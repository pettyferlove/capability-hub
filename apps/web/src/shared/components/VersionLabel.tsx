import { shortVersion } from '../format/version-label.js';

/** 完整版本标识保留为提示，页面正文统一使用展示标签。 */
export function VersionLabel({ value }: { value: string }) {
  return <span title={value}>{shortVersion(value)}</span>;
}
