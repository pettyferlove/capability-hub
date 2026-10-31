import type { Principal } from '@capability-hub/domain/identity';
import type { RecordStore } from '../ports/index.js';
import { fail } from '@capability-hub/domain/errors';
import type { UserRecord } from '@capability-hub/domain/models';
import { filterAsync } from '@capability-hub/domain/async';
import { has } from '@capability-hub/domain/rbac';

/** 每次从存储读取有效身份及当前授权，不缓存账号和角色。 */
export class IdentityService {
  constructor(private readonly store: RecordStore) {}
  async activeUser(id: string): Promise<UserRecord> {
    const user = await this.store.get('users', id);
    if (!user?.active) fail(401, 'UNAUTHENTICATED', '账号不可用');
    return user;
  }
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

  require(principal: Principal, permission: string, context: Parameters<typeof has>[2] = {}) {
    if (!has(principal, permission, context)) fail(403, 'FORBIDDEN', '当前角色无权执行该操作');
  }
}
