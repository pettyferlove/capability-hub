import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Principal, ScopeType } from '@capability-hub/domain/identity';
import { has } from '@capability-hub/domain/rbac';

const principal: Principal = {
  id: 'member',
  username: 'member',
  display_name: '团队成员',
  active: true,
  revision: 1,
  groups: ['engineering'],
  bindings: [],
  permissions: { maintainer: ['asset:maintain'] },
};

test('团队成员关系不直接赋权，停用身份或缺失角色权限均不能通过权限判断', () => {
  assert.equal(has(principal, 'asset:maintain', { team: 'engineering' }), false);
  const granted: Principal = {
    ...principal,
    bindings: [{ role_id: 'maintainer', scope_type: 'platform', scope_id: '' }],
  };
  assert.equal(has(granted, 'asset:maintain'), true);
  assert.equal(has(granted, 'review:decide'), false);
  assert.equal(has({ ...granted, active: false }, 'asset:maintain'), false);
  assert.equal(has({ ...granted, permissions: {} }, 'asset:maintain'), false);
});

test('团队、来源、资产和场景授权精确匹配对应上下文，缺少上下文或其他范围不能借用授权', () => {
  for (const scope of [
    'team',
    'source',
    'asset',
    'scenario',
  ] as const satisfies readonly ScopeType[]) {
    const granted: Principal = {
      ...principal,
      bindings: [{ role_id: 'maintainer', scope_type: scope, scope_id: 'allowed' }],
    };
    assert.equal(has(granted, 'asset:maintain', { [scope]: 'allowed' }), true, scope);
    assert.equal(has(granted, 'asset:maintain', { [scope]: 'other' }), false, scope);
    assert.equal(has(granted, 'asset:maintain'), false, scope);
    const unrelated = scope === 'team' ? { source: 'allowed' } : { team: 'allowed' };
    assert.equal(has(granted, 'asset:maintain', unrelated), false, scope);
  }
});
