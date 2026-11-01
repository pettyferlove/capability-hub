import { valid } from 'semver';

/** SemVer 2.0.0：数字标识不含前导零，预发布和构建标识不能有空段。 */
export const versionLabelPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export { compare as compareVersionLabels } from 'semver';

/**
 * 判定字符串能否作为固定版本号：以数字开头、长度 ≤128、无首尾空白且满足 SemVer。
 * 入库与检索两侧共用同一判定，保证版本号可直接编入 URL 且长度可控。
 */
export function isFixedVersionLabel(value: string): boolean {
  return (
    value.length <= 128 && value === value.trim() && /^\d/.test(value) && valid(value) !== null
  );
}
