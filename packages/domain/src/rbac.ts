import type { Principal } from './identity.js';
export const PERMISSIONS = [
  'ai:execute',
  'ai:inspect',
  'identity:manage',
  'audit:read',
  'source:create',
  'source:manage',
  'source:share',
  'asset:create',
  'asset:maintain',
  'review:decide',
  'asset:lifecycle',
  'version:revoke',
  'asset:migrate',
] as const;
export function has(
  p: Principal,
  permission: string,
  context: { team?: string; source?: string; asset?: string; scenario?: string } = {},
) {
  return (
    p.active &&
    p.bindings.some(
      (b) =>
        (p.permissions[b.role_id] ?? []).includes(permission) &&
        (b.scope_type === 'platform' || context[b.scope_type] === b.scope_id),
    )
  );
}
export const builtinRoles = [
  {
    name: '平台管理员',
    key: 'admin',
    permissions: [
      'ai:execute',
      'ai:inspect',
      'identity:manage',
      'audit:read',
      'source:manage',
      'source:share',
      'review:decide',
      'asset:lifecycle',
      'version:revoke',
      'asset:migrate',
    ],
  },
  {
    name: '资产维护者',
    key: 'maintainer',
    permissions: [
      'source:create',
      'source:manage',
      'source:share',
      'asset:create',
      'asset:maintain',
    ],
  },
  { name: '审核者', key: 'reviewer', permissions: ['review:decide'] },
  { name: '使用者', key: 'reader', permissions: [] },
];
