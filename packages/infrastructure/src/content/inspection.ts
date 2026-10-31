import type {
  InstallationInput,
  InputVariable,
  InstallationArgument,
  Finding,
  Manifest,
} from '@capability-hub/domain/content';
import type {
  Applicability,
  ContentMetadata,
  InstallationOption,
} from '@capability-hub/domain/content';
import type { ContentInspection, ContentFile } from '@capability-hub/domain/content';
import { canonical, digest, sha256, utf8Compare } from '@capability-hub/domain/canonical';
import { fail } from '@capability-hub/domain/errors';
import {
  archiveResource,
  contentText,
  executableText,
  packagingMetadata,
} from '@capability-hub/domain/files';
import { isFixedVersionLabel } from '@capability-hub/domain/version-labels';
import { artifactPath, collisionKey } from '@capability-hub/domain/paths';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { boundedJson } from './json.js';
import { normalizeSkill } from './zip-archive.js';
import { secretFindings, variableReference } from './secret-detection.js';
import { localReference, markdownReferences } from './markdown-references.js';
const MiB = 1024 * 1024;

const schemaBytes = readFileSync(
  fileURLToPath(import.meta.resolve('@capability-hub/contracts/schemas/mcp-server.schema.json')),
);
const ajv = new Ajv({ allErrors: true, strict: false });
(addFormats as unknown as (a: Ajv) => void)(ajv);
const schema: unknown = boundedJson(schemaBytes.toString());
if (!schema || typeof schema !== 'object' || Array.isArray(schema))
  throw new Error('MCP schema must be an object');
const schemaId = '$id' in schema && typeof schema.$id === 'string' ? schema.$id : '';
const validateMcp = ajv.compile<McpServerDocument>(schema);
export function inspect(
  kind: 'skill' | 'mcp',
  input: ContentFile[],
  expectedSlug: string,
): ContentInspection {
  if (
    input.length > 500 ||
    input.some((file) => file.bytes.length > 10 * MiB) ||
    input.reduce((size, file) => size + file.bytes.length, 0) > 100 * MiB
  )
    fail(413, 'PACKAGE_LIMIT', '包超过限制');
  input = input.map((file) => ({ ...file })).sort((a, b) => utf8Compare(a.path, b.path));
  const ignored = kind === 'skill' ? input.filter((f) => packagingMetadata(f.path, f.bytes)) : [];
  const files =
    kind === 'skill'
      ? normalizeSkill(input.filter((f) => !packagingMetadata(f.path, f.bytes)))
      : input;
  const findings: Finding[] = [];
  const findingCounts = new Map<string, number>();
  let findingsTruncated = false;
  const add = (
    rule_id: string,
    severity: 'warning' | 'info',
    file: string,
    line: number,
    evidence_summary: string,
  ) => {
    if (findings.length >= 1000) {
      if (!findingsTruncated)
        findings.push({
          id: 'SCAN_TRUNCATED',
          rule_id: 'SCAN_TRUNCATED',
          severity: 'warning',
          file,
          line,
          evidence_summary: '静态提示超过 1000 条，后续内容未继续展开检查；请完整人工审查后确认。',
        });
      findingsTruncated = true;
      return;
    }
    const base = `${rule_id}:${file}:${line}`;
    const occurrence = (findingCounts.get(base) ?? 0) + 1;
    findingCounts.set(base, occurrence);
    findings.push({
      id: occurrence === 1 ? base : `${base}:${occurrence}`,
      rule_id,
      severity,
      file,
      line,
      evidence_summary,
    });
  };
  for (const file of ignored)
    add(
      'PACKAGING_METADATA',
      'info',
      file.path,
      1,
      '已排除 macOS 打包元数据；原始上传归档保留，业务文件字节保持原样。',
    );
  const keys = new Set<string>();
  const fileKeys = new Set(files.map((file) => collisionKey(file.path)));
  for (const file of files) {
    artifactPath(file.path);
    if (/[\u202a-\u202e\u2066-\u2069]/.test(file.path))
      add(
        'BIDI_PATH',
        'warning',
        file.path,
        1,
        '文件名包含双向文本控制字符，请核对显示名称与真实路径。',
      );
    const key = collisionKey(file.path);
    if (keys.has(key)) fail(422, 'PATH_COLLISION', '包内路径冲突');
    const parts = key.split('/');
    parts.pop();
    let parent = '';
    for (const part of parts) {
      parent = parent ? parent + '/' + part : part;
      if (fileKeys.has(parent)) fail(422, 'PATH_COLLISION', '包内路径同时作为文件和目录');
    }
    keys.add(key);
    const text = contentText(file.bytes);
    if (archiveResource(file.bytes))
      add(
        'ARCHIVE_RESOURCE',
        'warning',
        file.path,
        1,
        '包内归档按原始字节保存，未展开检查内部内容；需人工核对来源、用途与风险。平台不递归解压或执行。',
      );
    else if (text === null)
      add(
        'BINARY_RESOURCE',
        'warning',
        file.path,
        1,
        '非 UTF-8 文本资源按原始字节分发，未分析内部内容；请确认用途及来源。',
      );
    file.executable =
      file.path === 'SKILL.md' || file.path === 'server.json'
        ? false
        : executableText(file.path, file.bytes);
    if (file.path === 'SKILL.md' && file.bytes.length > 256 * 1024)
      fail(413, 'SKILL_SIZE', 'SKILL.md 超过 256 KiB');
    if (text !== null && !findingsTruncated) {
      for (const finding of secretFindings(text)) {
        add(finding.rule_id, finding.severity, file.path, finding.line, finding.evidence_summary);
        if (findingsTruncated) break;
      }
      for (const [i, line] of text.split(/\r\n?|\n/).entries()) {
        if (findingsTruncated) break;
        if (/[\u202a-\u202e\u2066-\u2069]/.test(line))
          add(
            'BIDI',
            'warning',
            file.path,
            i + 1,
            '包含双向文本控制字符；请核对显示顺序与实际文本是否一致。',
          );
      }
      const commandLines = text.split(/\r\n?|\n/);
      for (let index = 0; index < commandLines.length && !findingsTruncated; index++) {
        const start = index + 1;
        const parts = [commandLines[index]];
        while (/\\$/.test(parts[parts.length - 1]) && index + 1 < commandLines.length)
          parts.push(commandLines[++index]);
        const command = parts.join(' ').replace(/\\ /g, ' ');
        const download = /(?:^|[^\w-])(?:curl|wget)\b/.exec(command);
        if (
          (download && /\|\s*(?:sudo\s+)?(?:ba|z|k)?sh\b/.test(command.slice(download.index))) ||
          /(?:^|[^\w-])(?:ba|z|k)?sh\s+<\(\s*(?:curl|wget)\b/.test(command)
        )
          add(
            'DOWNLOAD_EXECUTE',
            'warning',
            file.path,
            start,
            '存在下载内容交给 shell 的语句模式；请审核上下文，平台未执行或验证其行为。',
          );
      }
      if (file.executable) add('SCRIPT', 'info', file.path, 1, '包含文本脚本；平台仅分发，不执行');
      if (
        /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n(?:ext-[^\r\n]+\r?\n)*oid sha256:[a-f0-9]{64}\r?\nsize [0-9]+(?:\r?\n)?$/.test(
          text,
        )
      )
        add(
          'LFS_POINTER',
          'warning',
          file.path,
          1,
          '这是 Git LFS 指针而非原始对象；请确认是否有意分发指针文件。',
        );
    }
  }
  let metadata: ContentMetadata;
  if (kind === 'skill') {
    const rootFile = files.find((f) => f.path === 'SKILL.md');
    const body = rootFile ? contentText(rootFile.bytes) : null;
    if (!body) fail(422, 'SKILL_REQUIRED', '缺少非空 SKILL.md');
    const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match) fail(422, 'SKILL_FRONTMATTER', 'SKILL.md 缺少 YAML frontmatter');
    const doc = parseDocument(match[1], { uniqueKeys: true });
    if (doc.errors.length) fail(422, 'SKILL_YAML', '无效或重复的 YAML 字段');
    let rawFront: unknown;
    try {
      rawFront = doc.toJS({ maxAliasCount: 20 });
    } catch {
      fail(422, 'SKILL_YAML', 'YAML alias 超过限制');
    }
    if (!rawFront || typeof rawFront !== 'object' || Array.isArray(rawFront))
      fail(422, 'SKILL_YAML', 'frontmatter 必须为对象');
    const front = rawFront as Record<string, unknown>;
    if (
      !front ||
      typeof front.name !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(front.name) ||
      front.name.length > 64 ||
      front.name !== expectedSlug
    )
      fail(422, 'SKILL_NAME', 'Skill name 必须匹配资产名称，最长 64 字符');
    if (
      typeof front.description !== 'string' ||
      !front.description.trim() ||
      front.description.length > 1024 ||
      !match[2].trim()
    )
      fail(422, 'SKILL_DESCRIPTION', 'description 或正文为空/过长');
    for (const file of files.filter((f) => /\.md$/i.test(f.path))) {
      if (findingsTruncated) break;
      const text = contentText(file.bytes);
      if (text === null) continue;
      for (const reference of markdownReferences(text)) {
        if (findingsTruncated) break;
        let relative: string | null;
        try {
          relative = localReference(reference.url);
        } catch {
          add('BROKEN_REFERENCE', 'warning', file.path, reference.line, '无效链接编码');
          continue;
        }
        if (relative === null || relative === '') continue;
        if (relative.startsWith('/') || relative.includes('\\')) {
          add(
            'REFERENCE_ESCAPE',
            'warning',
            file.path,
            reference.line,
            '链接指向包外路径，接收者可能无法访问；请核对用途。',
          );
          continue;
        }
        const base = file.path.split('/').slice(0, -1);
        let escaped = false;
        for (const part of relative.split('/')) {
          if (part === '..') {
            if (!base.length) {
              escaped = true;
              break;
            }
            base.pop();
          } else if (part && part !== '.') base.push(part);
        }
        if (escaped) {
          add(
            'REFERENCE_ESCAPE',
            'warning',
            file.path,
            reference.line,
            '链接引用包外文件，接收者可能无法访问；请核对用途。',
          );
          continue;
        }
        const target = base.join('/');
        if (target && !files.some((f) => f.path === target || f.path.startsWith(target + '/')))
          add(
            'MISSING_REFERENCE',
            'warning',
            file.path,
            reference.line,
            '缺少相对引用文件或目录：' + target,
          );
      }
    }

    metadata = {
      name: front.name,
      description: front.description,
      frontmatter: front,
      has_scripts: files.some((f) => f.executable),
      has_archives: files.some((f) => archiveResource(f.bytes)),
      applies_to: readApplicability(
        front.metadata && typeof front.metadata === 'object' && 'applies_to' in front.metadata
          ? front.metadata.applies_to
          : undefined,
      ),
    };
  } else {
    if (files.length !== 1 || files[0].path !== 'server.json')
      fail(422, 'MCP_ROOT', 'MCP 只接受单个 server.json');
    const json = boundedJson(files[0].bytes.toString());
    if (!validateMcp(json))
      fail(422, 'MCP_SCHEMA', 'server.json 不符合固定官方 Schema', {
        errors: validateMcp.errors?.slice(0, 12),
      });
    const pending: { value: unknown; path: string }[] = [{ value: json, path: '' }];
    while (pending.length && !findingsTruncated) {
      const { value, path } = pending.pop()!;
      if (!value || typeof value !== 'object') continue;
      const record = value as Record<string, unknown>;
      if (record.isSecret === true) {
        for (const key of ['value', 'default']) {
          const literal = record[key];
          if (typeof literal !== 'string' || !literal.trim()) continue;
          const references = [...literal.matchAll(/\{([A-Za-z_][\w]*)\}/g)];
          const variables = record.variables;
          const variableTemplate =
            references.length > 0 &&
            variables &&
            typeof variables === 'object' &&
            references.every((reference) => Object.hasOwn(variables, reference[1]));
          if (!variableReference(literal) && !variableTemplate) {
            add(
              'DECLARED_SECRET',
              'warning',
              'server.json',
              1,
              `声明为秘密的输入包含固定 ${key}（JSON Pointer: ${path}/${key}）；请确认是否为模拟值、协议模板或确需分发的内容，避免发布真实凭据。`,
            );
          }
        }
      }
      for (const [key, child] of Object.entries(record))
        pending.push({
          value: child,
          path: path + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1'),
        });
    }
    const options: InstallationOption[] = [];
    for (const [i, r] of (json.remotes ?? []).entries()) {
      if (r.type === 'streamable-http') {
        let u: URL;
        try {
          u = new URL(r.url);
        } catch {
          fail(422, 'MCP_URL', '无效远程 URL');
        }
        if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
          fail(422, 'MCP_URL', '远程 MCP 需要不含凭据的 HTTP 或 HTTPS URL');
      }
      options.push({
        option_id: `remote-${i + 1}`,
        kind: 'remote',
        type: r.type,
        url: r.url,
        ...(r.variables ? { variables: r.variables } : {}),
        ...(r.headers ? { headers: r.headers.map(projectVariable) } : {}),
        supported: r.type === 'streamable-http',
      });
    }
    for (const [i, p] of (json.packages ?? []).entries()) {
      if (!p.version || /^(latest|next|main|master)$|[~^*<>=|\s]/.test(p.version))
        fail(422, 'MUTABLE_VERSION', '安装包必须使用明确固定版本');
      options.push({
        option_id: `package-${i + 1}`,
        kind: 'package',
        registryType: p.registryType,
        identifier: p.identifier,
        version: p.version,
        ...(p.transport ? { transport: { type: p.transport.type } } : {}),
        ...(p.runtimeArguments
          ? { runtimeArguments: p.runtimeArguments.map(projectArgument) }
          : {}),
        ...(p.packageArguments
          ? { packageArguments: p.packageArguments.map(projectArgument) }
          : {}),
        ...(p.environmentVariables
          ? { environmentVariables: p.environmentVariables.map(projectVariable) }
          : {}),
        supported: p.registryType === 'npm' && isFixedVersionLabel(p.version),
      });
    }
    if (!options.length) fail(422, 'MCP_OPTIONS', '至少需要一个安装选项');
    metadata = {
      name: json.name,
      description: json.description,
      server_json: json,
      schema_id: schemaId,
      schema_digest: digest(schemaBytes),
      installation_options: options,
      declared_tools: [],
      tools_verified: false,
    };
  }
  const manifest: Manifest = {
    schema_version: 1,
    kind,
    files: [...files]
      .sort((a, b) => utf8Compare(a.path, b.path))
      .map((f) => ({
        path: f.path,
        size: f.bytes.length,
        sha256: sha256(f.bytes),
        executable: f.path === 'SKILL.md' || f.path === 'server.json' ? false : f.executable,
      })),
  };
  return {
    files,
    manifest,
    content_digest: digest(canonical(manifest)),
    metadata,
    findings,
    state: 'passed',
  };
}
interface McpServerDocument {
  name: string;
  description: string;
  remotes?: (Omit<InstallationOption, 'kind' | 'supported' | 'option_id'> & {
    type: string;
    url: string;
  })[];
  packages?: (Omit<InstallationOption, 'kind' | 'supported' | 'option_id'> & { version: string })[];
  [key: string]: unknown;
}

/** 检索提示独立提取，保留 Skill 原始 frontmatter 与文件字节。 */
function readApplicability(value: unknown): Applicability {
  const hints: Applicability = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return hints;
  const fields = value as Record<string, unknown>;
  for (const key of ['languages', 'frameworks', 'keywords'] as const) {
    const raw = fields[key];
    const texts =
      typeof raw === 'string'
        ? [raw]
        : Array.isArray(raw)
          ? raw.filter((item): item is string => typeof item === 'string')
          : [];
    if (texts.length) hints[key] = texts;
  }
  return hints;
}

/** 选项只保存配置生成需要的字段；官方描述的其余字段保留在 server_json。 */
function projectInput(value: InstallationInput): InstallationInput {
  return {
    ...(value.value !== undefined ? { value: value.value } : {}),
    ...(value.isSecret !== undefined ? { isSecret: value.isSecret } : {}),
    ...(value.isRequired !== undefined ? { isRequired: value.isRequired } : {}),
    ...(value.variables ? { variables: value.variables } : {}),
  };
}
function projectVariable(value: InputVariable): InputVariable {
  return { name: value.name, ...projectInput(value) };
}
function projectArgument(value: InstallationArgument): InstallationArgument {
  return value.type === 'named'
    ? { type: 'named', name: value.name, ...projectInput(value) }
    : { type: 'positional', ...projectInput(value) };
}
