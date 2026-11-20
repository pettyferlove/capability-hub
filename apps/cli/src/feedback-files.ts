import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  agentClients,
  hubFeedbackLimits,
  type HubFeedbackAttachmentKind,
} from '@capability-hub/contracts';
import type { HubFeedbackAttachmentResponse } from '@capability-hub/contracts/http';
import { sha256 } from '@capability-hub/domain/canonical';
import {
  hubFeedbackAttachmentName,
  inspectHubFeedbackAttachment,
} from '@capability-hub/domain/content';
import { secretFindings } from '@capability-hub/infrastructure/content/secret-detection';
import { terminalText } from './api-client.js';
import { safeDirectory } from './filesystem.js';

export const defaultConfigDirectory = () => join(homedir(), '.config', 'capability-hub');

export interface FeedbackFile {
  name: string;
  bytes: Buffer<ArrayBuffer>;
  kind: HubFeedbackAttachmentKind;
  media_type: HubFeedbackAttachmentResponse['media_type'];
  size: number;
  digest: string;
}

export function scanFeedbackText(value: string, label: string, token?: string) {
  const finding = secretFindings(value).next();
  if (!finding.done)
    throw new Error(`${label}：第 ${finding.value.line} 行疑似含凭据，请移除后重试`);
  const knownIndex = token ? value.indexOf(token) : -1;
  // Hub 令牌是 32 字节的无填充 base64url，最后一位的低两位必为零。
  const shapeIndex = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048](?![A-Za-z0-9_-])/.exec(
    value,
  )?.index;
  const index = knownIndex === -1 ? (shapeIndex ?? -1) : knownIndex;
  if (index !== -1) {
    const line = value.slice(0, index).split(/\r\n?|\n/).length;
    throw new Error(`${label}：第 ${line} 行疑似含凭据，请移除后重试`);
  }
}

function fileLabel(path: string, token?: string) {
  const original = basename(path);
  scanFeedbackText(original, '文件名', token);
  const name = hubFeedbackAttachmentName(original);
  if (name !== original) scanFeedbackText(name, '文件名', token);
  return terminalText(name);
}

function isWithin(directory: string, path: string) {
  const rel = relative(directory, path);
  return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
}

async function realpathIfPresent(path: string) {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return path;
    throw error;
  }
}

function protectedName(path: string) {
  const name = basename(path).toLowerCase();
  return (
    /^(?:\.env(?:\..*)?|\.netrc|\.npmrc|\.pypirc|\.git-credentials|auth\.json|credentials(?:\.[^.]+)?|id_(?:rsa|dsa|ecdsa|ed25519))$/.test(
      name,
    ) ||
    /^(?:\.?mcp(?:-config)?\.jsonc?|opencode\.jsonc?|(?:config|settings)\.(?:jsonc?|toml|ya?ml))$/.test(
      name,
    ) ||
    /\.(?:key|pem|pfx|p12)$/.test(name)
  );
}

async function protectedPath(path: string, directory: string) {
  const directories = [directory, defaultConfigDirectory(), join(homedir(), '.ssh')];
  const files = Object.values(agentClients).flatMap(({ projectConfig, userConfig }) => [
    resolve(projectConfig),
    userConfig.startsWith('~/') ? join(homedir(), userConfig.slice(2)) : resolve(userConfig),
  ]);
  if (process.env.CODEX_HOME) files.push(resolve(process.env.CODEX_HOME, 'config.toml'));
  if (process.env.COPILOT_HOME) files.push(resolve(process.env.COPILOT_HOME, 'mcp-config.json'));
  if (protectedName(path)) return true;
  const fold = process.platform === 'darwin' || process.platform === 'win32';
  const target = fold ? path.toLowerCase() : path;
  const roots = await Promise.all(directories.map(realpathIfPresent));
  if (roots.some((root) => isWithin(fold ? root.toLowerCase() : root, target))) return true;
  const configPaths = await Promise.all(
    files.flatMap((file) =>
      (file.endsWith('.json') ? [file, `${file}c`] : [file]).map(realpathIfPresent),
    ),
  );
  return configPaths.some((file) => (fold ? file.toLowerCase() : file) === target);
}

async function readFile(
  path: string,
  directory: string,
  maximum: number,
  token?: string,
  sizeError = '文件超过大小限制',
) {
  const name = fileLabel(path, token);
  const source = resolve(path);
  try {
    const entry = await lstat(source);
    if (!entry.isFile() || entry.nlink !== 1) throw new Error('只支持没有链接的普通文件');
    const parent = await safeDirectory(dirname(source), false);
    const target = join(parent, basename(source));
    if (await protectedPath(target, directory)) throw new Error('不能附带凭据或配置文件');
    const file = await open(
      target,
      process.platform === 'win32'
        ? constants.O_RDONLY
        : constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== entry.dev || stat.ino !== entry.ino)
        throw new Error('只支持没有链接的普通文件');
      if (stat.size > maximum) throw new Error(sizeError);
      const bytes = Buffer.alloc(stat.size + 1);
      let size = 0;
      while (size < bytes.length) {
        const { bytesRead } = await file.read(bytes, size, bytes.length - size);
        if (bytesRead === 0) break;
        size += bytesRead;
      }
      if (size !== stat.size) throw new Error('文件读取期间发生变化');
      return { bytes: bytes.subarray(0, size), name };
    } finally {
      await file.close();
    }
  } catch (error) {
    const message =
      error instanceof Error && !('code' in error)
        ? error.message
        : '无法读取普通文件或文件路径经过链接';
    throw new Error(`${name}：${message}`, { cause: error });
  }
}

async function readStdin(maximum: number) {
  if (process.stdin.isTTY) throw new Error('请通过管道或重定向提供标准输入');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > maximum) throw new Error('标准输入超过大小限制');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

export async function feedbackBody(
  flag: string,
  value: string | undefined,
  path: string | undefined,
  directory: string,
  token?: string,
) {
  if (value !== undefined && path !== undefined)
    throw new Error(`${flag} 与 ${flag}-file 不能同时使用`);
  if (path === undefined) return value;
  const { bytes, name } =
    path === '-'
      ? { bytes: await readStdin(hubFeedbackLimits.textBytes), name: '标准输入' }
      : await readFile(path, directory, hubFeedbackLimits.textBytes, token);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error();
  } catch {
    throw new Error(`${name}：需要有效的 UTF-8 文本，不能含 NUL`);
  }
  scanFeedbackText(text, name, token);
  return text;
}

export async function feedbackAttachments(
  paths: readonly string[],
  directory: string,
  token?: string,
): Promise<FeedbackFile[]> {
  if (paths.length > hubFeedbackLimits.uploadFiles) throw new Error('一次最多可附带 5 个文件');
  let total = 0;
  const files: FeedbackFile[] = [];
  for (const path of paths) {
    if (path === '-') throw new Error('附件必须使用本地文件路径');
    const remaining = hubFeedbackLimits.uploadBytes - total;
    const { name, bytes } = await readFile(
      path,
      directory,
      Math.min(hubFeedbackLimits.imageBytes, remaining),
      token,
      remaining < hubFeedbackLimits.imageBytes ? '附件合计不能超过 12 MiB' : '附件不能超过 5 MiB',
    );
    total += bytes.length;
    const info = (() => {
      try {
        return inspectHubFeedbackAttachment(bytes);
      } catch (error) {
        throw new Error(`${name}：${error instanceof Error ? error.message : '附件格式无效'}`, {
          cause: error,
        });
      }
    })();
    if (info.content !== undefined) scanFeedbackText(info.content, name, token);
    else if (token && bytes.includes(token)) throw new Error(`${name}：疑似含凭据，请移除后重试`);
    const { kind, media_type } = info;
    files.push({ name, bytes, kind, media_type, size: bytes.length, digest: sha256(bytes) });
  }
  return files;
}
