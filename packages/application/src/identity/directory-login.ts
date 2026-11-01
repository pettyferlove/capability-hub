import { randomUUID } from 'node:crypto';
import type { UserRecord } from '@capability-hub/domain/models';
import { fail } from '@capability-hub/domain/errors';
import type { DirectoryIdentity, RecordStore } from '../ports/index.js';

/** 由登录事务调用；目录条目的 UUID 才能继承已有账号的授权。 */
export async function resolveDirectoryUser(
  store: RecordStore,
  username: string,
  identity: DirectoryIdentity,
  current: UserRecord | undefined,
  defaultRoles: readonly string[],
): Promise<UserRecord | undefined> {
  if (current)
    return current.active && current.ldap_entry_uuid === identity.entryUuid ? current : undefined;
  const previous = await store.find('users', 'ldap_entry_uuid', identity.entryUuid);
  if (previous) {
    if (!previous.active) return undefined;
    return store.put('users', { ...previous, username, revision: previous.revision + 1 });
  }
  // 初始化管理员必须由部署方创建，目录登录不能占用首次初始化入口。
  if (!(await store.all('users')).length) return undefined;
  const user = await store.insert('users', {
    id: randomUUID(),
    username,
    display_name: identity.displayName,
    password_hash: null,
    ldap_entry_uuid: identity.entryUuid,
    active: true,
    revision: 1,
    created_at: new Date().toISOString(),
  });
  for (const key of defaultRoles) {
    const role = await store.find('roles', 'key', key);
    if (!role) fail(503, 'LDAP_ROLE_UNAVAILABLE', 'LDAP 默认角色不可用');
    let teamId = '';
    if (key === 'maintainer') {
      teamId = randomUUID();
      const name = 'LDAP · ' + username;
      await store.insert('groups', {
        id: teamId,
        name: (await store.find('groups', 'name', name)) ? 'LDAP · ' + teamId : name,
        active: true,
        revision: 1,
      });
      await store.insert('memberships', { id: randomUUID(), user_id: user.id, group_id: teamId });
    }
    await store.insert('role_bindings', {
      id: randomUUID(),
      principal_id: user.id,
      role_id: role.id,
      scope_type: teamId ? 'team' : 'platform',
      scope_id: teamId,
    });
  }
  await store.audit(user.id, 'identity.user_created', user.id, 'ldap', { roles: defaultRoles });
  return user;
}
