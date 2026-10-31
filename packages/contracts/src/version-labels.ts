import { valid } from 'semver';

/** SemVer 2.0.0：数字标识不含前导零，预发布和构建标识不能有空段。 */
export const versionLabelPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export { compare as compareVersionLabels } from 'semver';

export function isFixedVersionLabel(value: string): boolean {
  return (
    value.length <= 128 && value === value.trim() && /^\d/.test(value) && valid(value) !== null
  );
}
