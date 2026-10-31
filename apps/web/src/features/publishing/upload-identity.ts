import {
  compareVersionLabels,
  versionLabelPattern,
  isFixedVersionLabel,
} from '@capability-hub/contracts';
import type { AssetVersionPlanResponse } from '@capability-hub/contracts/http';

export const fixedVersionPattern = versionLabelPattern;
export type UploadVersionMode = 'auto' | 'patch' | 'minor' | 'major' | 'manual';

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

export interface UploadIdentity {
  slug: string;
  version: string;
  slugEdited: boolean;
  versionEdited: boolean;
}
export const emptyUploadIdentity: UploadIdentity = {
  slug: '',
  version: '1.0.0',
  slugEdited: false,
  versionEdited: false,
};
export interface IdentitySuggestion {
  slug?: string;
  version?: string;
}

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

export function suggestSlug(text: string): string | undefined {
  const value = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return value && value.length <= 64 ? value : undefined;
}

export function skillFilenameIdentity(filename: string): IdentitySuggestion {
  if (!/\.zip$/i.test(filename)) return {};
  const stem = filename.slice(0, -4);
  const match = /^(.+?)-v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)$/.exec(stem);
  return { slug: suggestSlug(match?.[1] ?? stem), ...(match ? { version: match[2] } : {}) };
}

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
