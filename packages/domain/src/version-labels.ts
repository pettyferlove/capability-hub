import { valid } from 'semver';
export { compare as compareVersionLabels } from 'semver';

export function isFixedVersionLabel(value: string): boolean {
  return (
    value.length <= 128 && value === value.trim() && /^\d/.test(value) && valid(value) !== null
  );
}
