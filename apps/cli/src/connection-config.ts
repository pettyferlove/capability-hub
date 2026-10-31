import { constants } from 'node:fs';
import { chmod, open, rename, rm } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parse, parseTree, modify, applyEdits, type ParseError, type Node } from 'jsonc-parser';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import {
  agentClients,
  renderMcpClientConfiguration,
  type AgentClient,
} from '@capability-hub/contracts';
import { sha256 } from '@capability-hub/domain/canonical';
import { withFileLock } from './file-lock.js';
import { safeDirectory } from './filesystem.js';

export interface ConnectionConfigOptions {
  client: AgentClient;
  scope: 'project' | 'user';
  url: string;
  directory: string;
  configFile?: string;
  replace?: boolean;
}
export async function prepareConnectionConfig(options: ConnectionConfigOptions) {
  const { client, scope } = options;
  if (!options.configFile && scope === 'user' && ['claude-code', 'vscode'].includes(client))
    throw new Error(
      '此客户端的用户配置位置由客户端管理。请使用 --scope project，或通过 --config-file 指定客户端提供的配置文件路径。',
    );
  let target =
    options.configFile ??
    (scope === 'project' ? agentClients[client].projectConfig : agentClients[client].userConfig);
  if (target.startsWith('~/')) target = join(homedir(), target.slice(2));
  if (
    !options.configFile &&
    scope === 'user' &&
    client === 'copilot-cli' &&
    process.env.COPILOT_HOME
  )
    target = join(process.env.COPILOT_HOME, 'mcp-config.json');
  if (!options.configFile && client === 'codex' && scope === 'user' && process.env.CODEX_HOME)
    target = join(process.env.CODEX_HOME, 'config.toml');
  if (!options.configFile && client === 'opencode') {
    const jsonc = target.replace(/\.json$/, '.jsonc');
    const found = await readConfig(jsonc);
    if (found !== null) target = jsonc;
  }
  target = resolve(target);
  await safeDirectory(dirname(target), false);
  const original = await readConfig(target);
  const generated = renderMcpClientConfiguration(
    client,
    'capability-hub',
    {
      command: process.execPath,
      args: [
        resolve(process.argv[1]),
        'bridge',
        '--url',
        options.url,
        '--client',
        client,
        '--config-dir',
        resolve(options.directory),
      ],
    },
    scope,
  );
  const root =
    client === 'codex'
      ? 'mcp_servers'
      : client === 'opencode'
        ? 'mcp'
        : client === 'vscode'
          ? 'servers'
          : 'mcpServers';
  const errors: ParseError[] = [];
  const document: unknown = original
    ? client === 'codex'
      ? parseToml(original)
      : parse(original, errors, { allowTrailingComma: true })
    : {};
  if (errors.length || !document || typeof document !== 'object' || Array.isArray(document))
    throw new Error('现有配置无效，未修改文件');
  if (original && client !== 'codex') {
    const checkKeys = (node: Node) => {
      if (node.type === 'object') {
        const keys = (node.children ?? []).map(
          (property) => property.children?.[0].value as string,
        );
        if (new Set(keys).size !== keys.length)
          throw new Error('配置含重复字段，无法安全合并，请先修正配置');
      }
      node.children?.forEach(checkKeys);
    };
    const tree = parseTree(original, [], { allowTrailingComma: true });
    if (tree) checkKeys(tree);
  }
  const object = document as Record<string, unknown>;
  const container = object[root];
  if (
    container !== undefined &&
    (!container || typeof container !== 'object' || Array.isArray(container))
  )
    throw new Error('现有 MCP 配置结构无效');
  const existing = (container as Record<string, unknown> | undefined)?.['capability-hub'];
  const desired = generated.config[root]['capability-hub'];
  if (existing !== undefined && !isDeepStrictEqual(existing, desired) && !options.replace)
    throw new Error(
      '已有 capability-hub 配置与助手方案不同。核对后使用 --replace 替换该条目；其他设置保留并备份。',
    );
  let text =
    existing !== undefined && isDeepStrictEqual(existing, desired)
      ? original!
      : client === 'codex'
        ? existing !== undefined
          ? stringifyToml({
              ...object,
              [root]: { ...(container as Record<string, unknown>), 'capability-hub': desired },
            })
          : (original ?? '') + '\n' + generated.text + '\n'
        : applyEdits(
            original ?? '{}\n',
            modify(original ?? '{}\n', [root, 'capability-hub'], desired, {
              formattingOptions: { insertSpaces: true, tabSize: 2 },
            }),
          );
  if (client === 'codex') {
    try {
      parseToml(text);
    } catch {
      // 已有内联表不能通过追加子表扩展，重新序列化并保留原文备份。
      text = stringifyToml({
        ...object,
        [root]: { ...(container as Record<string, unknown>), 'capability-hub': desired },
      });
      parseToml(text);
    }
  }
  return {
    target,
    original,
    text,
    backupDirectory: join(resolve(options.directory), 'config-backups'),
  };
}
async function readConfig(path: string): Promise<string | null> {
  await safeDirectory(dirname(resolve(path)), false);
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 1024 * 1024)
      throw new Error('配置必须是小于 1 MiB 的普通文件');
    return await file.readFile('utf8');
  } finally {
    await file.close();
  }
}
export async function writeConnectionConfig(
  prepared: Awaited<ReturnType<typeof prepareConnectionConfig>>,
) {
  const { target, original, text, backupDirectory } = prepared;
  return withFileLock(target + '.hub', async () => {
    await safeDirectory(dirname(target));
    if ((await readConfig(target)) !== original)
      throw new Error('配置已被其他程序修改，请重新运行接入助手');
    if (text === original) return;
    let backupPath: string | undefined;
    if (original !== null) {
      await safeDirectory(backupDirectory);
      await chmod(backupDirectory, 0o700);
      backupPath = join(backupDirectory, sha256(target) + '-' + randomUUID() + '.backup');
      const backup = await open(backupPath, 'wx', 0o600);
      try {
        await backup.writeFile(original);
        await backup.sync();
      } finally {
        await backup.close();
      }
    }
    const temporary = target + '.hub-' + randomUUID();
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(text);
        await file.sync();
      } finally {
        await file.close();
      }
      await safeDirectory(dirname(target), false);
      if ((await readConfig(target)) !== original)
        throw new Error('配置在保存期间被其他程序修改，请重试；已保留最新文件');
      await rename(temporary, target);
      return backupPath;
    } finally {
      await rm(temporary, { force: true });
    }
  });
}
