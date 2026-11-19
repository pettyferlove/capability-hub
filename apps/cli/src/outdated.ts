import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import {
  agentClients,
  assetSlugSchema,
  manifestFileSchema,
  shellArgument,
} from '@capability-hub/contracts';
import { utf8Compare } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';
import { HubApiClient, HubApiError, terminalText } from './api-client.js';
import { hubUrl } from './credentials.js';
import { safeDirectory } from './filesystem.js';
import { installSourceFile, localDiff } from './install.js';
import { assetSchema, versionIdentitySchema, versionsSchema } from './response-schemas.js';
import { readSkillAsset } from './skill-versions.js';

const receiptSchema = versionIdentitySchema.extend({
  hub_url: z.string(),
  slug: assetSlugSchema.optional(),
  version_label: z.string().min(1).optional(),
  files: z.array(manifestFileSchema),
});

type Receipt = z.infer<typeof receiptSchema>;
interface Installation {
  path: string;
  receipt: Receipt;
}

type Status =
  'current' | 'update_available' | 'deprecated' | 'unavailable' | 'modified' | 'other_hub';

interface Entry {
  path: string;
  hub_url: string;
  asset_id: string;
  version_id: string;
  slug: string | null;
  version_label: string | null;
  status: Status;
  latest_release?: { version_id: string; version_label: string };
  deprecation_reason?: string;
  replacement_asset_slug?: string | null;
  differences?: string[];
  next_step?: string;
}

async function installedSkills(directories: readonly string[]) {
  const defaults = directories.length === 0;
  const parents = new Set<string>();
  const installs: Installation[] = [];
  for (const directory of defaults
    ? new Set(Object.values(agentClients).map((c) => c.skillDirectory))
    : directories) {
    if (!directory.trim()) throw new Error('--to 必须指定技能父目录');
    let parent: string;
    try {
      parent = await safeDirectory(directory, false);
    } catch (error) {
      // add 不会写入经过链接或非目录的路径，默认扫描跳过这些预设目录；显式 --to 仍报错。
      if (defaults && error instanceof HubError && error.code === 'INSTALL_PATH') continue;
      throw error;
    }
    if (parents.has(parent)) continue;
    parents.add(parent);
    const children = await readdir(parent, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) => {
        if (defaults && error.code === 'ENOENT') return [];
        throw error;
      },
    );
    for (const child of children) {
      if (!child.isDirectory()) continue;
      const path = join(parent, child.name);
      const source = join(path, installSourceFile);
      const stat = await lstat(source).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!stat) continue;
      if (!stat.isFile()) throw new Error(`来源记录不是普通文件：${source}`);
      try {
        const receipt = receiptSchema.parse(JSON.parse(await readFile(source, 'utf8')));
        receipt.hub_url = hubUrl(receipt.hub_url);
        installs.push({ path, receipt });
      } catch (error) {
        throw new Error(`来源记录无效：${source}`, { cause: error });
      }
    }
  }
  return installs;
}

async function ifReadable<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof HubApiError && error.status === 404) return null;
    throw error;
  }
}

async function inspectInstallation(
  api: HubApiClient,
  { path, receipt }: Installation,
  configDir?: string,
): Promise<Entry> {
  const { hub_url, asset_id, version_id, files } = receipt;
  const entry = {
    path,
    hub_url,
    asset_id,
    version_id,
    slug: receipt.slug ?? null,
    version_label: receipt.version_label ?? null,
  };
  if (hub_url !== api.url)
    return { ...entry, status: 'other_hub', next_step: `请用 ${hub_url} 对应的 --url 或凭据重试` };

  const version = await ifReadable(
    api.json(`/api/versions/${version_id}/manifest`, versionIdentitySchema),
  );
  if (version && (version.version_id !== version_id || version.asset_id !== asset_id))
    throw new Error('Hub 返回的版本与来源记录不一致');
  const detail = version || !entry.slug ? await ifReadable(readSkillAsset(api, asset_id)) : null;
  if (detail && (detail.asset.asset_id !== asset_id || detail.asset.kind !== 'skill'))
    throw new Error('Hub 返回的资源与来源记录不一致');
  const asset = detail?.asset;
  entry.slug ??= asset?.slug ?? null;
  if (!version || !asset || !detail)
    return { ...entry, status: 'unavailable', next_step: '复核版本和权限后删除或更换安装' };

  const latest = asset.current_release;
  if (!entry.version_label) {
    if (latest.version_id === version_id) entry.version_label = latest.version_label;
    else {
      const history = await api.json(detail.historyPath, versionsSchema);
      entry.version_label = history.find((v) => v.version_id === version_id)?.version_label ?? null;
    }
  }
  const latestRelease = { version_id: latest.version_id, version_label: latest.version_label };
  if (asset.lifecycle === 'deprecated') {
    const reason = asset.deprecation_reason ?? '';
    const replacement =
      asset.replacement_asset_slug ??
      (asset.replacement_asset_id
        ? (await ifReadable(api.json(`/api/assets/${asset.replacement_asset_id}`, assetSchema)))
            ?.slug
        : undefined);
    return {
      ...entry,
      status: 'deprecated',
      latest_release: latestRelease,
      deprecation_reason: reason,
      replacement_asset_slug: replacement ?? null,
      next_step: replacement ? `${reason} · 替代资源：${replacement}` : reason,
    };
  }
  const differences = await localDiff(path, files);
  if (differences.length)
    return {
      ...entry,
      status: 'modified',
      latest_release: latestRelease,
      differences,
      next_step: '先核对本地修改',
    };
  if (latest.version_id !== version_id) {
    const preview = `capability-hub add ${asset.slug} --version ${shellArgument(latest.version_label)} --to ${shellArgument(dirname(path))} --url ${shellArgument(api.url)}${configDir ? ` --config-dir ${shellArgument(configDir)}` : ''} --dry-run`;
    return {
      ...entry,
      status: 'update_available',
      latest_release: latestRelease,
      next_step: preview,
    };
  }
  return { ...entry, status: 'current', latest_release: latestRelease };
}

function printTable(entries: Entry[]): void {
  const header = ['STATUS', 'SKILL', 'INSTALLED', 'LATEST', 'PATH'];
  const rows = entries.map((entry) => [
    entry.status,
    entry.slug ?? basename(entry.path),
    entry.version_label ?? '—',
    entry.latest_release?.version_label ?? '—',
    entry.path,
  ]);
  const widths = header.map((label, column) =>
    rows.reduce((width, row) => Math.max(width, row[column].length), label.length),
  );
  const line = (row: string[]) =>
    row.map((cell, i) => (i === row.length - 1 ? cell : cell.padEnd(widths[i]))).join('  ');
  process.stdout.write(line(header) + '\n');
  for (const [i, entry] of entries.entries()) {
    process.stdout.write(terminalText(line(rows[i])) + '\n');
    if (entry.next_step) process.stdout.write(`  ${terminalText(entry.next_step)}\n`);
    if (entry.status === 'update_available')
      process.stdout.write('  确认后去掉 --dry-run 并加 --replace\n');
  }
}

/** 同一安装的 HTTP 请求串行，异源条目不发请求。 */
export async function outdated(
  directories: readonly string[],
  options: { json?: boolean; exitCode?: boolean; configDir?: string },
  credentials: () => Promise<{ url: string; token?: string }>,
): Promise<number | undefined> {
  const installs = await installedSkills(directories);
  const entries: Entry[] = [];
  if (installs.length) {
    const { url, token } = await credentials();
    const api = new HubApiClient(url, token);
    const pending = installs.values();
    await Promise.all(
      Array.from({ length: Math.min(8, installs.length) }, async () => {
        for (const install of pending)
          entries.push(await inspectInstallation(api, install, options.configDir));
      }),
    );
    entries.sort(
      (a, b) =>
        Number(b.status === 'unavailable') - Number(a.status === 'unavailable') ||
        utf8Compare(a.path, b.path),
    );
  }
  if (options.json) process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
  else printTable(entries);
  if (
    options.exitCode &&
    entries.some(({ status }) => status === 'update_available' || status === 'unavailable')
  )
    return 2;
}
