import { compareVersionLabels, isFixedVersionLabel } from '@capability-hub/domain/version-labels';
import { fail } from '@capability-hub/domain/errors';

export function createVersionPlan(currentVersion: string | null, occupiedVersions: string[]) {
  const occupied = [...new Set(occupiedVersions)];
  const latest =
    occupied
      .filter((label) => isFixedVersionLabel(label))
      .sort(compareVersionLabels)
      .at(-1) ?? null;
  let suggestions = { patch: '1.0.0', minor: '1.0.0', major: '1.0.0' };
  if (latest) {
    const [major, minor, patch] = latest.split(/[+-]/)[0].split('.').map(BigInt);
    suggestions = {
      patch: `${major}.${minor}.${latest.split('+')[0].includes('-') ? patch : patch + 1n}`,
      minor: `${major}.${minor + 1n}.0`,
      major: `${major + 1n}.0.0`,
    };
  }
  if (Object.values(suggestions).some((version) => !isFixedVersionLabel(version)))
    fail(409, 'VERSION_RANGE_EXHAUSTED', '自动递增超出版本数字范围，请手动填写有效版本');
  return {
    current_version: currentVersion,
    latest_version: latest,
    occupied_versions: occupied,
    suggestions,
  };
}
