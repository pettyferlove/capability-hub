import { basename, dirname } from 'node:path';
import { shellArgument } from '@capability-hub/contracts';
import { utf8Compare } from '@capability-hub/domain/canonical';
import { installSourceFile } from '@capability-hub/domain/paths';
import { HubApiClient, HubApiError } from './api-client.js';
import { printTable } from './cli-ui.js';
import { localDiff } from './install.js';
import { installedSkills, type Installation } from './installed-skills.js';
import { assetSchema, versionIdentitySchema, versionsSchema } from './response-schemas.js';
import { displayVersionLabel, readSkillAsset } from './skill-versions.js';

type Status =
  | 'current'
  | 'update_available'
  | 'deprecated'
  | 'unavailable'
  | 'modified'
  | 'other_hub'
  | 'unknown_source';

interface Entry {
  path: string;
  hub_url: string | null;
  asset_id: string | null;
  version_id: string | null;
  slug: string | null;
  version_label: string | null;
  status: Status;
  latest_release?: { version_id: string; version_label: string };
  deprecation_reason?: string;
  replacement_asset_slug?: string | null;
  differences?: string[];
  next_step?: string;
}

async function ifReadable<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof HubApiError && error.status === 404) return null;
    throw error;
  }
}

/** 本地差异不依赖 Hub，任何状态都会报告；`status` 只取优先级最高的一项。 */
async function inspectInstallation(
  api: HubApiClient,
  { path, receipt }: Installation,
  configDir?: string,
): Promise<Entry> {
  const { hub_url, asset_id, version_id, files } = receipt;
  const differences = await localDiff(path, files);
  const entry = {
    path,
    hub_url,
    asset_id,
    version_id,
    slug: receipt.slug ?? null,
    version_label: receipt.version_label ?? null,
    ...(differences.length ? { differences } : {}),
  };
  const nextStep = (...steps: string[]) =>
    [...steps, ...(differences.length ? ['先核对本地修改'] : [])].filter(Boolean).join(' · ');
  if (hub_url !== api.url)
    return {
      ...entry,
      status: 'other_hub',
      next_step: nextStep(`请用 ${hub_url} 对应的 --url 或凭据重试`),
    };

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
    return {
      ...entry,
      status: 'unavailable',
      next_step: nextStep('复核版本和权限后删除或更换安装'),
    };

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
      next_step: nextStep(reason, replacement ? `替代资源：${replacement}` : ''),
    };
  }
  if (differences.length)
    return {
      ...entry,
      status: 'modified',
      latest_release: latestRelease,
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

/**
 * 同一安装的 HTTP 请求串行，异源条目不发请求。退出码按事实而非单一状态判定：本地有修改返回 3
 * （`failOnModified`），有更新的发布、已弃用或不可用返回 2（`exitCode`），3 优先。
 */
export async function outdated(
  directories: readonly string[],
  options: { json?: boolean; exitCode?: boolean; failOnModified?: boolean; configDir?: string },
  credentials: () => Promise<{ url: string; token?: string }>,
): Promise<number | undefined> {
  const { installs, unknownSources } = await installedSkills(directories);
  const entries: Entry[] = unknownSources.map((path) => ({
    path,
    hub_url: null,
    asset_id: null,
    version_id: null,
    slug: null,
    version_label: null,
    status: 'unknown_source',
    next_step: `无法判定来源：缺少 ${installSourceFile}`,
  }));
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
  }
  entries.sort(
    (a, b) =>
      Number(b.status === 'unavailable') - Number(a.status === 'unavailable') ||
      utf8Compare(a.path, b.path),
  );
  if (options.json) process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
  else
    printTable(
      ['STATUS', 'SKILL', 'INSTALLED', 'LATEST', 'PATH'],
      entries.map((entry) => ({
        cells: [
          entry.status,
          entry.slug ?? basename(entry.path),
          entry.version_label === null ? '—' : displayVersionLabel(entry.version_label),
          entry.latest_release ? displayVersionLabel(entry.latest_release.version_label) : '—',
          entry.path,
        ],
        notes: [
          ...(entry.next_step ? [entry.next_step] : []),
          ...(entry.status === 'update_available' ? ['确认后去掉 --dry-run 并加 --replace'] : []),
        ],
      })),
    );
  if (options.failOnModified && entries.some((entry) => entry.differences?.length)) return 3;
  if (
    options.exitCode &&
    entries.some(
      ({ status, version_id, latest_release }) =>
        status === 'unavailable' ||
        status === 'deprecated' ||
        (latest_release !== undefined && latest_release.version_id !== version_id),
    )
  )
    return 2;
}
