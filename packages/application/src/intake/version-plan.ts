import { compareVersionLabels, isFixedVersionLabel } from '@capability-hub/domain/version-labels';
import { fail } from '@capability-hub/domain/errors';

/**
 * 依据已占用版本给出下一个 patch/minor/major 建议。
 *
 * 只把固定版本（见 {@link isFixedVersionLabel}）纳入比较，`git.commit` 这类浮动标签被忽略；
 * 最高版本带预发布后缀时，patch 建议沿用当前 patch 数（去掉后缀），否则 patch + 1。
 * 递增结果若超出 semver 允许的数值范围，直接 409/`VERSION_RANGE_EXHAUSTED` 而不是给出非法建议。
 */
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
