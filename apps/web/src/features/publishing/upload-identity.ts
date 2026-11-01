import {
  compareVersionLabels,
  versionLabelPattern,
  isFixedVersionLabel,
} from '@capability-hub/contracts';
import type { AssetVersionPlanResponse } from '@capability-hub/contracts/http';

/** 契约层固定版本模式的再导出，表单校验与提交校验共用同一正则，避免两处规则漂移。 */
export const fixedVersionPattern = versionLabelPattern;
/**
 * 待发布版本的来源：`auto` 在源版本可用时沿用、否则退回 `patch` 建议，`patch`/`minor`/`major`
 * 直接用服务端建议值，`manual` 采用手填值且不依赖版本计划。
 */
export type UploadVersionMode = 'auto' | 'patch' | 'minor' | 'major' | 'manual';

/**
 * 源包版本能否直接发布：不超过 128 字符、是固定版本、未被 `occupied_versions` 占用，且严格大于
 * `latest_version`（无 latest 时只要求前三项）。为 false 时调用方应改用建议版本。
 */
export function canUseSourceVersion(
  plan: AssetVersionPlanResponse,
  sourceVersion: string,
): boolean {
  return (
    sourceVersion.length <= 128 &&
    isFixedVersionLabel(sourceVersion) &&
    !plan.occupied_versions.includes(sourceVersion) &&
    (!plan.latest_version || compareVersionLabels(sourceVersion, plan.latest_version) > 0)
  );
}

/**
 * 按模式得出待发布版本：`manual` 原样返回；缺少版本计划（资产尚未解析）时返回空串，表示暂不可提交；
 * `auto` 仅在 {@link canUseSourceVersion} 通过时沿用源版本，否则退回 `plan.suggestions.patch`。
 */
export function resolveUploadVersion(
  plan: AssetVersionPlanResponse | undefined,
  sourceVersion: string,
  mode: UploadVersionMode,
  manualVersion: string,
): string {
  if (mode === 'manual') return manualVersion;
  if (!plan) return '';
  if (mode === 'auto')
    return canUseSourceVersion(plan, sourceVersion) ? sourceVersion : plan.suggestions.patch;
  return plan.suggestions[mode];
}

/**
 * 上传表单的身份草稿。`slugEdited`/`versionEdited` 记录用户是否手动改过，置真后自动建议不再覆盖
 * 对应字段；两者互相独立。
 */
export interface UploadIdentity {
  slug: string;
  version: string;
  slugEdited: boolean;
  versionEdited: boolean;
}
/** 版本预填 `1.0.0` 且两个 `…Edited` 均为 false，使首个自动建议仍可覆盖。 */
export const emptyUploadIdentity: UploadIdentity = {
  slug: '',
  version: '1.0.0',
  slugEdited: false,
  versionEdited: false,
};
/** 建议值可缺省：推断不可靠时省略对应字段，调用方据此保留原值而不是写入空串。 */
export interface IdentitySuggestion {
  slug?: string;
  version?: string;
}

/**
 * 用建议值覆盖用户未编辑过的字段。`existing` 表示目标资产已存在：slug 一律保持原值，版本在无建议时
 * 置空而非回落 `1.0.0`，避免与既有版本冲突。
 */
export function suggestUploadIdentity(
  current: UploadIdentity,
  suggestion: IdentitySuggestion,
  existing = false,
): UploadIdentity {
  return {
    ...current,
    slug: current.slugEdited || existing ? current.slug : (suggestion.slug ?? ''),
    version: current.versionEdited
      ? current.version
      : (suggestion.version ?? (existing ? '' : '1.0.0')),
  };
}

/**
 * 从文本推导资产名：NFKC 归一化后转小写，非字母数字压成 `-` 再去首尾连字符。结果为空或超过
 * 64 字符时返回 `undefined`，由调用方留空让用户填写，而不是截断。
 */
export function suggestSlug(text: string): string | undefined {
  const value = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value && value.length <= 64 ? value : undefined;
}

/**
 * 从 zip 文件名推导身份，形如 `<name>-1.2.3.zip` 或 `<name>-v1.2.3.zip`；非 zip 返回空建议，未带
 * 版本时只给 slug，版本随后交由版本计划补全。
 */
export function skillFilenameIdentity(filename: string): IdentitySuggestion {
  if (!/\.zip$/i.test(filename)) return {};
  const stem = filename.slice(0, -4);
  const match = /^(.+?)-v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)$/.exec(stem);
  return { slug: suggestSlug(match?.[1] ?? stem), ...(match ? { version: match[2] } : {}) };
}

/**
 * 解析 MCP 的 server.json 描述文件，取出名称、用途与建议 slug/版本。JSON 非法、不是对象、缺少
 * name/description，或名称超过 200 字符、用途超过 100 字符时抛 {@link Error}。版本仅在固定版本格式
 * 下采用，否则省略以免提交阶段被拒。
 */
export function mcpFileIdentity(text: string): IdentitySuggestion & {
  name: string;
  description: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('文件不是有效的 JSON，请检查内容后重新选择。');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('请选择 MCP 的 server.json 描述文件。');
  const fields = parsed as Record<string, unknown>;
  if (typeof fields.name !== 'string' || typeof fields.description !== 'string')
    throw new Error('描述文件需要 name 和 description；客户端配置请改用服务地址或 npx 命令添加。');
  if (
    !fields.name.trim() ||
    fields.name.length > 200 ||
    !fields.description.trim() ||
    fields.description.length > 100
  )
    throw new Error('MCP 描述文件需要非空的名称和用途；名称不超过 200 字符，用途不超过 100 字符。');
  return {
    name: fields.name,
    description: fields.description,
    slug: suggestSlug(fields.name.split('/').at(-1) ?? ''),
    ...(typeof fields.version === 'string' &&
    fields.version.length <= 128 &&
    isFixedVersionLabel(fields.version)
      ? { version: fields.version }
      : {}),
  };
}
