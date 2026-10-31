import assert from 'node:assert/strict';
import { test } from 'node:test';
import { audienceChange } from '../../apps/web/src/features/review/audience-change.js';

test('审核受众比较识别公开和组织范围的包含关系，不把收窄错误标成扩大', () => {
  assert.equal(audienceChange(['public'], ['organization']), 'narrowed');
  assert.equal(audienceChange(['public'], ['group:a']), 'narrowed');
  assert.equal(audienceChange(['organization'], ['principal:a']), 'narrowed');
  assert.equal(audienceChange(['group:a'], ['organization']), 'expanded');
  assert.equal(audienceChange(['organization'], ['public']), 'expanded');
});

test('指定受众按集合比较，新增、移除和替换分别显示，不推测成员所属团队', () => {
  assert.equal(audienceChange(['group:a', 'group:b'], ['group:b', 'group:a']), 'unchanged');
  assert.equal(audienceChange(['group:a'], ['group:a', 'group:b']), 'expanded');
  assert.equal(audienceChange(['group:a', 'group:b'], ['group:a']), 'narrowed');
  assert.equal(audienceChange(['group:a'], ['group:b']), 'changed');
  assert.equal(audienceChange(['group:a'], ['principal:a']), 'changed');
});
