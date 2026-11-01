import {
  userLoginProvider,
  type LoginProvider,
  type Principal,
} from '@capability-hub/domain/identity';
import type { RecordStore } from '../ports/index.js';
import { fail } from '@capability-hub/domain/errors';
import type { UserRecord } from '@capability-hub/domain/models';
import { filterAsync } from '@capability-hub/domain/async';
import { bindingMatchesScope, has } from '@capability-hub/domain/rbac';

/** 每次从存储读取有效身份及当前授权，不缓存账号和角色。 */
export class IdentityService {
  constructor(private readonly store: RecordStore) {}
  /** 同名本地和目录账号各自持有独立的 id、停用状态与授权。 */
  async userForLogin(username: string, provider: LoginProvider) {
    const users = await this.store.where('users', 'username', username);
    return users.find((user) => userLoginProvider(user) === provider);
  }

  /**
   * 读取仍启用的账号记录；每次直查存储，不缓存，因此停用在下一次调用立即生效。
   * 记录缺失或 `active` 为 false 抛 401/`UNAUTHENTICATED`。
   * 返回值含 `password_hash`，只可用于校验，不得进入响应或日志。
   */
  async activeUser(id: string): Promise<UserRecord> {
    const user = await this.store.get('users', id);
    if (!user?.active) fail(401, 'UNAUTHENTICATED', '账号不可用');
    return user;
  }
  /**
   * 依据当前持久化状态重建 {@link Principal}：只并入启用团队，绑定既含直接授予也含团队授予，
   * 并附上全量角色权限表（以 `role_id` 为键），供 {@link has} 后续判定。
   * 整个读取在 `store.tx` 内完成，避免角色表与绑定表读到半更新状态；
   * 账号失效抛 401/`UNAUTHENTICATED`。
   * 结果不缓存，权限变更下一次请求即生效。
   */
  async principal(id: string): Promise<Principal> {
    return this.store.tx(async () => {
      const user = await this.store.get('users', id);
      if (!user || !user.active) fail(401, 'UNAUTHENTICATED', '账号不可用');
      const groups = await filterAsync(
        (await this.store.all('memberships'))
          .filter((r) => r.user_id === id)
          .map((r) => r.group_id),
        async (g) => (await this.store.get('groups', g))?.active,
      );
      const bindings = (await this.store.all('role_bindings'))
        .filter((r) => r.principal_id === id || groups.includes(r.principal_id))
        .map((r) => ({ role_id: r.role_id, scope_type: r.scope_type, scope_id: r.scope_id }));
      return {
        id,
        username: user.username,
        display_name: user.display_name,
        active: user.active,
        revision: user.revision,
        groups,
        bindings,
        permissions: Object.fromEntries(
          (await this.store.all('roles')).map((r) => [r.id, r.permissions]),
        ),
      };
    });
  }

  /** 从匹配的用户与团队授权反查有效账号；使用所选身份前仍须按目标复查权限。 */
  async userIdsWithPermission(permission: string, scope: Parameters<typeof has>[2] = {}) {
    return this.store.tx(async () => {
      const roles = new Set(
        (await this.store.all('roles'))
          .filter((role) => role.permissions.includes(permission))
          .map((role) => role.id),
      );
      const grantees = new Set(
        (await this.store.all('role_bindings'))
          .filter((binding) => roles.has(binding.role_id) && bindingMatchesScope(binding, scope))
          .map((binding) => binding.principal_id),
      );
      const groups = new Set(
        (await this.store.all('groups'))
          .filter((group) => group.active && grantees.has(group.id))
          .map((group) => group.id),
      );
      for (const member of await this.store.all('memberships'))
        if (groups.has(member.group_id)) grantees.add(member.user_id);
      return (await this.store.all('users'))
        .filter((user) => user.active && grantees.has(user.id))
        .sort((a, b) => a.username.localeCompare(b.username, 'en'))
        .map((user) => user.id);
    });
  }

  /**
   * 权限断言：不满足时抛 403/`FORBIDDEN`，错误信息不含缺少哪项权限，避免探测。
   * 判定委托 {@link has}——`platform` 绑定全局生效，其它绑定只有 `context` 传入同名作用域 id
   * 且相等时才生效，漏传即视为拒绝；账号已停用的主体一律拒绝。
   * @param permission - 须取自 {@link PERMISSIONS}，例如 `identity:manage`、`asset:maintain`
   * @param context - 当前请求所处作用域，如 `{ team, source, asset }`
   */
  require(principal: Principal, permission: string, context: Parameters<typeof has>[2] = {}) {
    if (!has(principal, permission, context)) fail(403, 'FORBIDDEN', '当前角色无权执行该操作');
  }
}
