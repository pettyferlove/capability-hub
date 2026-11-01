import { assetSlugSchema as assetSlug, isFixedVersionLabel } from '@capability-hub/contracts';
import { suggestSlug, type IdentitySuggestion } from './upload-identity.js';

/**
 * 手动录入 MCP 入口的表单快照。`mode` 决定哪些字段参与提交：`url` 只用 `url` 与 `tokenVariable`，
 * `command` 只用 `command`/`packageVersion`/`environment`，`file` 不读表单、须走 server.json 导入。
 */
export interface McpEntryDraft {
  mode: 'url' | 'command' | 'file';
  url: string;
  command: string;
  packageVersion: string;
  description: string;
  authenticated: boolean;
  tokenVariable: string;
  environment: string;
}

/** 初始值默认走 `url` 模式，Token 变量名预填 `MCP_TOKEN`，省去带鉴权远程入口的必填提醒。 */
export const emptyMcpEntry: McpEntryDraft = {
  mode: 'url',
  url: '',
  command: '',
  packageVersion: '',
  description: '',
  authenticated: false,
  tokenVariable: 'MCP_TOKEN',
  environment: '',
};

function commandWords(command: string): string[] {
  const words: string[] = [];
  let word = '';
  let quote = '';
  let escaped = false;
  let started = false;
  for (const char of command.trim()) {
    if (escaped) {
      word += char;
      escaped = false;
    } else if (char === '\\' && quote !== "'") {
      escaped = true;
      started = true;
    } else if (char === '$' || char === '`' || (!quote && /[|&;<>()\r\n]/.test(char))) {
      throw new Error('请只粘贴一条 npx 命令，不包含管道、重定向或 Shell 变量。');
    } else if (quote) {
      if (char === quote) quote = '';
      else word += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      started = true;
    } else if (/\s/.test(char)) {
      if (started) words.push(word);
      word = '';
      started = false;
    } else {
      word += char;
      started = true;
    }
  }
  if (quote || escaped) throw new Error('命令中的引号或转义符尚未闭合。');
  if (started) words.push(word);
  return words;
}

/**
 * 只接受单条 `npx` 命令或裸 npm 包名；npm/pnpm/yarn/uvx/uv/docker/node/python/sh/bash 等其他安装方式
 * 一律拒绝并提示改用 server.json。整串上限 4096 字符，参数最多 64 个、不能为空且不能含 `{}` 模板，
 * 版本必须是固定版本（`latest` 或范围会被拒）；任一不满足即抛 {@link Error}。返回的 `version` 为
 * `undefined` 表示命令未写版本，由调用方补全。
 */
export function parseNpmInstallation(command: string) {
  if (!command.trim()) throw new Error('请输入 npm 包名或 npx 命令。');
  if (command.length > 4096) throw new Error('安装命令不超过 4096 个字符。');
  const words = commandWords(command);
  if (
    ['npm', 'pnpm', 'yarn', 'uvx', 'uv', 'docker', 'node', 'python', 'sh', 'bash'].includes(
      words[0],
    )
  )
    throw new Error('此入口解析 npx 命令或 npm 包名；其他安装方式请导入 server.json 描述文件。');
  if (words.at(0) === 'npx') {
    words.shift();
    while (words[0] === '-y' || words[0] === '--yes') words.shift();
    if (words[0] === '--') words.shift();
  }
  const specifier = words.shift() ?? '';
  const at = specifier.lastIndexOf('@');
  const identifier = at > 0 ? specifier.slice(0, at) : specifier;
  const version = at > 0 ? specifier.slice(at + 1) : undefined;
  if (
    identifier.startsWith('-') ||
    !/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(identifier)
  )
    throw new Error('请输入标准 npm 包名，例如 @example/docs，或 npx -y @example/docs@1.2.3。');
  if (version !== undefined && (version.length > 128 || !isFixedVersionLabel(version)))
    throw new Error('安装包需要固定版本，例如 1.2.3；请将 latest 或版本范围替换为具体版本。');
  if (words.length > 64 || words.some((word) => !word || /[{}]/.test(word)))
    throw new Error('命令参数需为非空的固定值；环境变量请在下方按名称填写。');
  return { identifier, version, args: words };
}

/**
 * 校验并以 {@link URL} 形式返回 MCP 远程地址：仅 http/https，禁止内嵌账号密码、URL 片段与
 * `{}`/空白模板变量，保证同一地址能稳定比较与去重；不合法时抛 {@link Error}。
 */
export function mcpAddress(address: string): URL {
  const text = address.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error('请输入完整的 MCP 服务地址，例如 https://docs.example.com/mcp。');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    /[{}\s]/.test(text)
  )
    throw new Error('MCP 地址需要使用 HTTP 或 HTTPS，且不能包含账号密码、片段或模板变量。');
  return url;
}

/**
 * 从 draft 推测 slug 与版本：`url` 模式取末段路径（跳过 `mcp`/`sse`）或主域名，`command` 模式取包名
 * 末段。输入尚未完整时**不抛错**而返回空建议，具体校验错误留到 {@link buildMcpDocument} 提交时报出。
 */
export function mcpEntryIdentity(draft: McpEntryDraft): IdentitySuggestion {
  try {
    if (draft.mode === 'url') {
      const url = mcpAddress(draft.url);
      const path = url.pathname.split('/').filter((part) => part && !['mcp', 'sse'].includes(part));
      return {
        slug: suggestSlug(
          path.at(-1) ?? url.hostname.replace(/^(mcp|www|api)\./, '').split('.')[0],
        ),
      };
    }
    if (draft.mode === 'command') {
      const parsed = parseNpmInstallation(draft.command);
      return {
        slug: suggestSlug(parsed.identifier.split('/').at(-1) ?? ''),
        version:
          parsed.version ??
          (isFixedVersionLabel(draft.packageVersion) ? draft.packageVersion : undefined),
      };
    }
  } catch {
    // 输入未完成时不生成建议，提交时报告具体校验问题。
  }
  return {};
}

function environmentNames(text: string): string[] {
  const names = [...new Set(text.split(/[,，;；\s]+/).filter(Boolean))];
  if (names.length > 20 || names.some((name) => !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)))
    throw new Error('环境变量只填写名称，例如 GITHUB_TOKEN；最多 20 个，不要填写等号和值。');
  return names;
}

/**
 * 把 draft 转成 server.json 结构：`url` 模式产出单个 `remotes` 条目，`command` 模式产出 `packages`
 * 条目（只有 `npx` 包，走 stdio）。校验失败一律抛 {@link Error}：slug 须通过契约校验、版本须为固定
 * 版本且不超过 128 字符、描述 1–100 字符。`authenticated` 为真才写入 Bearer 头与变量声明；
 * `environment` 只收变量名，最多 20 个，写等号或值会被拒。
 */
export function buildMcpDocument(draft: McpEntryDraft, slug: string, version: string) {
  if (!assetSlug.safeParse(slug).success) throw new Error('请填写有效的资产名称。');
  if (!isFixedVersionLabel(version) || version.length > 128)
    throw new Error('发布版本需为 1.0.0 这样的固定版本。');
  const description = draft.description.trim();
  if (!description || description.length > 100)
    throw new Error('请用 1–100 个字符说明这个 MCP 的用途。');
  const base = { name: `local.capability-hub/${slug}`, description, version };
  if (draft.mode === 'url') {
    const url = mcpAddress(draft.url).href;
    const variable = draft.tokenVariable.trim();
    if (draft.authenticated && !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(variable))
      throw new Error('请填写有效的 Token 环境变量名，例如 DOCS_TOKEN。');
    return {
      ...base,
      remotes: [
        {
          type: 'streamable-http',
          url,
          ...(draft.authenticated
            ? {
                headers: [
                  {
                    name: 'Authorization',
                    value: `Bearer {${variable}}`,
                    isSecret: true,
                    variables: { [variable]: { isSecret: true } },
                  },
                ],
              }
            : {}),
        },
      ],
    };
  }
  if (draft.mode !== 'command') throw new Error('请选择描述文件。');
  const parsed = parseNpmInstallation(draft.command);
  const packageVersion = parsed.version ?? draft.packageVersion.trim();
  if (packageVersion.length > 128 || !isFixedVersionLabel(packageVersion))
    throw new Error('请为 npm 包填写固定版本，例如 1.2.3。');
  return {
    ...base,
    packages: [
      {
        registryType: 'npm',
        identifier: parsed.identifier,
        version: packageVersion,
        transport: { type: 'stdio' },
        ...(parsed.args.length
          ? { packageArguments: parsed.args.map((value) => ({ type: 'positional', value })) }
          : {}),
        ...(draft.environment.trim()
          ? {
              environmentVariables: environmentNames(draft.environment).map((name) => ({
                name,
                isSecret: true,
              })),
            }
          : {}),
      },
    ],
  };
}
