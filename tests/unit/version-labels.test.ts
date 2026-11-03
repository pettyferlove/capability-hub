import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareVersionLabels,
  versionLabelPattern,
  isFixedVersionLabel,
} from '@capability-hub/contracts';
import { createVersionPlan } from '../../packages/application/src/intake/version-plan.js';
import {
  isGeneratedGitVersion,
  shortVersion,
} from '../../apps/web/src/shared/format/version-label.js';

test('页面仅缩写自动 Git 标签，保留配置修订并在选择版本时区分来源', () => {
  const source = '88c84e92-7566-411e-993e-a257754af657';
  for (const commit of ['7e1ca32e' + 'a'.repeat(32), '7e1ca32e' + 'b'.repeat(56)]) {
    const label = `git.${commit}.s${source}.r12`;
    assert.equal(isGeneratedGitVersion(label), true);
    assert.equal(shortVersion(label), 'Git 7e1ca32e · r12');
    assert.equal(shortVersion(label, true), 'Git 7e1ca32e · s88c84e92 · r12');
    assert.notEqual(shortVersion(label), shortVersion(label.replace('.r12', '.r13')));
    assert.notEqual(
      shortVersion(label, true),
      shortVersion(label.replace(source, 'a8c84e92-7566-411e-993e-a257754af657'), true),
    );
  }
  for (const label of ['', '1.2.3-beta.1+build.001', 'git.release', 'git.7e1ca32e.ssource.r1']) {
    assert.equal(isGeneratedGitVersion(label), false, label);
    assert.equal(shortVersion(label), label);
  }
});

test('固定版本号遵循 SemVer 的数字、预发布和构建标识语法', () => {
  for (const label of ['0.0.0', '1.2.3', '1.2.3-0.alpha-1+build.001'])
    assert(versionLabelPattern.test(label), label);
  for (const label of [
    '01.2.3',
    '1.02.3',
    '1.2.03',
    '1.2.3-01',
    '1.2.3-alpha..1',
    '1.2.3+.',
    '1.2.3-',
    '1.2',
    'v1.2.3',
  ])
    assert.equal(versionLabelPattern.test(label), false, label);
});

test('版本比较采用规范优先级并忽略构建信息，超出解析器整数范围的标签被拒绝', () => {
  const ordered = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
  ];
  assert.deepEqual([...ordered].reverse().sort(compareVersionLabels), ordered);
  assert.equal(compareVersionLabels('1.0.0+a', '1.0.0+b'), 0);
  assert.equal(isFixedVersionLabel('9007199254740993.0.0'), false);
  assert.throws(() => compareVersionLabels('1.0', '1.0.0'));
});

test('版本计划跳过 Git 标签，预发布提升为正式版，所有占用标签仍保留', () => {
  assert.deepEqual(createVersionPlan('1.2.3', ['git.commit', '1.3.0-beta.1', '1.2.3', '1.2.3']), {
    current_version: '1.2.3',
    latest_version: '1.3.0-beta.1',
    occupied_versions: ['git.commit', '1.3.0-beta.1', '1.2.3'],
    suggestions: { patch: '1.3.0', minor: '1.4.0', major: '2.0.0' },
  });
  assert.deepEqual(createVersionPlan(null, []).suggestions, {
    patch: '1.0.0',
    minor: '1.0.0',
    major: '1.0.0',
  });
});

test('自动递增遇到 SemVer 安全整数上限时明确拒绝，不返回无法接收的版本建议', () => {
  assert.throws(
    () => createVersionPlan('9007199254740991.0.0', ['9007199254740991.0.0']),
    (error: unknown) =>
      error instanceof Error && 'code' in error && error.code === 'VERSION_RANGE_EXHAUSTED',
  );
});
