import { valid } from 'semver';
export { compare as compareVersionLabels } from 'semver';

/**
 * 判断版本标签是否可作为固定版本：长度 ≤ 128、未带首尾空白、以数字开头且是合法 semver。
 * 首字符必须是数字是为了把 `latest`、`stable` 之类浮动标签挡在外面——版本一旦入库就要可比较、可复现，
 * 浮动标签会让同一请求在不同时间解析到不同内容。
 *
 * @param value - 待判定的版本标签
 */
export function isFixedVersionLabel(value: string): boolean {
  return (
    value.length <= 128 && value === value.trim() && /^\d/.test(value) && valid(value) !== null
  );
}
