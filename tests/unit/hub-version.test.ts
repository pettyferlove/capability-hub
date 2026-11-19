import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cliCompatibility } from '@capability-hub/contracts';
import { compareVersionLabels, isFixedVersionLabel } from '@capability-hub/domain/version-labels';
import cliPackage from '../../apps/cli/package.json' with { type: 'json' };

test('推荐版本对应当前 CLI 包，且该版本仍满足最低要求', () => {
  const { recommended, minimum } = cliCompatibility;
  assert.equal(recommended, cliPackage.version);
  assert(isFixedVersionLabel(recommended) && isFixedVersionLabel(minimum));
  assert(compareVersionLabels(minimum, recommended) <= 0);
});
