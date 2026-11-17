import { randomUUID } from 'node:crypto';
import type { GroupRecord, UserRecord } from '@capability-hub/domain/models';
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
  let user = current ?? (await store.find('users', 'ldap_entry_uuid', identity.entryUuid));
  if (user && (!user.active || user.ldap_entry_uuid !== identity.entryUuid)) return undefined;
  const created = !user;
  if (!user) {
    // 初始化管理员必须由部署方创建，目录登录不能占用首次初始化入口。
    if (!(await store.all('users')).length) return undefined;
    user = await store.insert('users', {
      id: randomUUID(),
      username,
      display_name: identity.displayName,
      password_hash: null,
      ldap_entry_uuid: identity.entryUuid,
      active: true,
      revision: 1,
      created_at: new Date().toISOString(),
    });
  } else if (user.username !== username) {
    user = await store.put('users', { ...user, username, revision: user.revision + 1 });
  }
  const group = await resolveDepartment(store, user.id, identity.department);
  await synchronizeMembership(store, user.id, group);
  if (created) {
    const roles: string[] = [];
    for (const key of defaultRoles) {
      const role = await store.find('roles', 'key', key);
      if (!role) fail(503, 'LDAP_ROLE_UNAVAILABLE', 'LDAP 默认角色不可用');
      if (key === 'maintainer' && !group?.active) continue;
      const bindingId = randomUUID();
      await store.insert('role_bindings', {
        id: bindingId,
        principal_id: user.id,
        role_id: role.id,
        scope_type: key === 'maintainer' ? 'team' : 'platform',
        scope_id: key === 'maintainer' ? group!.id : '',
      });
      if (key === 'maintainer')
        user = await store.put('users', { ...user, ldap_maintainer_binding_id: bindingId });
      roles.push(key);
    }
    await store.audit(user.id, 'identity.user_created', user.id, 'ldap', { roles });
  }
  if (user.ldap_maintainer_binding_id) {
    const binding = await store.get('role_bindings', user.ldap_maintainer_binding_id);
    if (binding && (!group?.active || binding.scope_id !== group.id)) {
      await store.audit(user.id, 'identity.grant_removed', binding.id, 'ldap');
      if (!group?.active) await store.remove('role_bindings', binding.id);
      else {
        await store.put('role_bindings', { ...binding, scope_id: group.id });
        await store.audit(user.id, 'identity.role_granted', binding.id, 'ldap');
      }
    }
  }
  return user;
}

async function resolveDepartment(
  store: RecordStore,
  actor: string,
  department: DirectoryIdentity['department'],
): Promise<GroupRecord | undefined> {
  if (!department) return undefined;
  const existing = await store.find('groups', 'ldap_entry_uuid', department.entryUuid);
  if (existing?.name === department.displayName) return existing;
  const collision = await store.find('groups', 'name', department.displayName);
  const name =
    collision && collision.id !== existing?.id
      ? department.displayName.slice(0, 41) + ' · ' + department.entryUuid
      : department.displayName;
  if (existing) {
    if (existing.name === name) return existing;
    const updated = await store.put('groups', {
      ...existing,
      name,
      revision: existing.revision + 1,
    });
    await store.audit(actor, 'identity.group_updated', existing.id, 'ldap', {
      changes: [{ field: 'name', before: existing.name, after: updated.name }],
    });
    return updated;
  }
  const group = await store.insert('groups', {
    id: randomUUID(),
    name,
    ldap_entry_uuid: department.entryUuid,
    active: true,
    revision: 1,
  });
  await store.audit(actor, 'identity.group_created', group.id, 'ldap');
  return group;
}

async function synchronizeMembership(
  store: RecordStore,
  userId: string,
  department: GroupRecord | undefined,
): Promise<void> {
  let joined = false;
  for (const membership of await store.where('memberships', 'user_id', userId)) {
    if (membership.group_id === department?.id) {
      joined = true;
      continue;
    }
    if ((await store.get('groups', membership.group_id))?.ldap_entry_uuid) {
      await store.audit(userId, 'identity.grant_removed', membership.id, 'ldap');
      await store.remove('memberships', membership.id);
    }
  }
  if (department && !joined) {
    const membership = await store.insert('memberships', {
      id: randomUUID(),
      user_id: userId,
      group_id: department.id,
    });
    await store.audit(userId, 'identity.membership_added', membership.id, 'ldap');
  }
}
