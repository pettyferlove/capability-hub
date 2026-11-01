import type { Principal } from './identity.js';

/**
 * 权限标识的唯一清单，形如 `域:动作`；判定按字面量精确匹配（见 {@link has}），
 * 自定义角色只能从此处取值，所以新增能力必须同时在这里登记，否则任何角色都无法被授予。
 */
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

/**
 * 按角色绑定的作用域判定权限：`platform` 绑定全局生效，其余绑定只有在调用方传入同名作用域 id 且相等时才生效；
 * 调用方没传的作用域一律按不匹配处理，因此漏传上下文得到的是拒绝而不是放行。
 * 停用主体（`active` 为 false）即使仍持有绑定也立即失去全部权限。
 *
 * @param p - 已展开角色权限的主体快照，`permissions` 以 role_id 为键
 * @param permission - 须取自 {@link PERMISSIONS}；未知标识不会命中任何角色
 * @param context - 当前请求所处的作用域 id，未提供的作用域视作不匹配
 */
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

/**
 * 初始化时写入的内置角色集合。`key` 是稳定标识，改名不影响已有绑定；`admin` 刻意不含 `source:create`
 * 与 `asset:create`/`asset:maintain`，创建类动作留给 `maintainer`，`reader` 权限为空（仅保留登录本身）。
 * 播种时按 `key` 判重，已存在即跳过，所以后续改动不会回灌到运行中的实例。
 */
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
