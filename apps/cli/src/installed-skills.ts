import { lstat, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { agentClients, type InstallSourceRecord } from '@capability-hub/contracts';
import { utf8Compare } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';
import { installSourceFile } from '@capability-hub/domain/paths';
import { terminalText } from './api-client.js';
import { printTable } from './cli-ui.js';
import { safeDirectory } from './filesystem.js';
import { localDiff, readSourceRecord } from './install.js';
import { displayVersionLabel } from './skill-versions.js';

/** 带有效来源记录的已安装 Skill；`receipt.hub_url` 已归一化为 origin。 */
export interface Installation {
  path: string;
  receipt: InstallSourceRecord;
}

interface ListEntry {
  path: string;
  hub_url: string | null;
  asset_id: string | null;
  version_id: string | null;
  slug: string | null;
  version_label: string | null;
  status: 'unmodified' | 'modified' | 'unknown_source';
  differences?: string[];
}

async function statIfPresent(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * 未指定目录时扫描当前项目已存在的预设技能目录。add 不会写入经过链接或非目录的路径，默认扫描
 * 跳过这类预设目录并在 stderr 说明，显式 `--to` 仍报错。含 SKILL.md 但缺少来源记录的目录
 * 归入 `unknownSources`。
 */
export async function installedSkills(directories: readonly string[]) {
  const defaults = directories.length === 0;
  const parents = new Set<string>();
  const installs: Installation[] = [];
  const unknownSources: string[] = [];
  for (const directory of defaults
    ? new Set(Object.values(agentClients).map((c) => c.skillDirectory))
    : directories) {
    if (!directory.trim()) throw new Error('--to 必须指定技能父目录');
    let parent: string;
    try {
      parent = await safeDirectory(directory, false);
    } catch (error) {
      if (!defaults || !(error instanceof HubError) || error.code !== 'INSTALL_PATH') throw error;
      process.stderr.write(
        terminalText(
          `已跳过 ${directory}：${error.message}；如需检查，请用 --to 指定不经过链接的实际目录`,
        ) + '\n',
      );
      continue;
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
      if (!child.isDirectory() || child.name.startsWith('.')) continue;
      const path = join(parent, child.name);
      const source = join(path, installSourceFile);
      const stat = await statIfPresent(source);
      if (!stat) {
        if ((await statIfPresent(join(path, 'SKILL.md')))?.isFile()) unknownSources.push(path);
        continue;
      }
      if (!stat.isFile()) throw new Error(`来源记录不是普通文件：${source}`);
      try {
        installs.push({ path, receipt: await readSourceRecord(source) });
      } catch (error) {
        throw new Error(`来源记录无效：${source}`, { cause: error });
      }
    }
  }
  return { installs, unknownSources };
}

/** 离线列出已安装的 Skill：只读来源记录并比对本地文件，不联系 Hub。 */
export async function listSkills(directories: readonly string[], options: { json?: boolean }) {
  const { installs, unknownSources } = await installedSkills(directories);
  const entries: ListEntry[] = unknownSources.map((path) => ({
    path,
    hub_url: null,
    asset_id: null,
    version_id: null,
    slug: null,
    version_label: null,
    status: 'unknown_source',
  }));
  for (const { path, receipt } of installs) {
    const differences = await localDiff(path, receipt.files);
    entries.push({
      path,
      hub_url: receipt.hub_url,
      asset_id: receipt.asset_id,
      version_id: receipt.version_id,
      slug: receipt.slug ?? null,
      version_label: receipt.version_label ?? null,
      status: differences.length ? 'modified' : 'unmodified',
      ...(differences.length ? { differences } : {}),
    });
  }
  entries.sort((a, b) => utf8Compare(a.path, b.path));
  if (options.json) {
    process.stdout.write(JSON.stringify(entries, null, 2) + '\n');
    return;
  }
  printTable(
    ['STATUS', 'SKILL', 'VERSION', 'HUB', 'PATH'],
    entries.map((entry) => ({
      cells: [
        entry.status,
        entry.slug ?? basename(entry.path),
        entry.version_label === null ? '—' : displayVersionLabel(entry.version_label),
        entry.hub_url ?? '—',
        entry.path,
      ],
      notes:
        entry.status === 'unknown_source'
          ? [`无法判定来源：缺少 ${installSourceFile}`]
          : (entry.differences ?? []),
    })),
  );
}
