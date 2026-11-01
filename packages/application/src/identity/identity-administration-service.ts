import type { Principal } from '@capability-hub/domain/identity';
import type { RecordStore } from '../ports/index.js';
import { fail } from '@capability-hub/domain/errors';
import { someAsync } from '@capability-hub/domain/async';
import { builtinRoles, PERMISSIONS } from '@capability-hub/domain/rbac';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { matchRevision } from '../shared/revision.js';
import { toUserSummary } from './identity-mapper.js';
import type { PasswordHasher } from '../ports/index.js';
import type { IdentityService } from './identity-service.js';
import type { SessionService } from './session-service.js';
const usernameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/)
  .transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(12).max(256);

/** 管理账号、团队、角色及授权；最后管理员检查与变更一并提交。 */
export class IdentityAdministrationService {
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordHasher,
  ) {}
  async initialize() {
    const store = this.store;
    await store.tx(async () => {
      for (const r of builtinRoles)
        if (!(await store.find('roles', 'key', r.key)))
          await store.insert('roles', { id: randomUUID(), ...r, builtin: true, revision: 1 });
    });
  }
  async adminSnapshot(principal: Principal) {
    this.identity.require(principal, 'identity:manage');
    return {
      users: (await this.store.all('users')).map((u) => toUserSummary(u)),
      groups: await this.store.all('groups'),
      memberships: await this.store.all('memberships'),
      roles: await this.store.all('roles'),
      bindings: await this.store.all('role_bindings'),
      permissions: PERMISSIONS,
    };
  }
  private async guardLastAdmin() {
    const adminRole = (await this.store.find('roles', 'key', 'admin'))!;
    const users = (await this.store.all('users')).filter((u) => u.active);
    if (
      !(await someAsync(users, async (u) => {
        const p = await this.identity.principal(u.id);
        return p.bindings.some((b) => b.role_id === adminRole.id && b.scope_type === 'platform');
      }))
    )
      fail(409, 'LAST_ADMIN', '必须保留至少一个有效平台管理员');
  }
  async createUser(p: Principal, body: unknown) {
    this.identity.require(p, 'identity:manage');
    const b = z
      .object({
        username: usernameSchema,
        display_name: z.string().trim().min(1).max(80),
        password: passwordSchema,
        group_ids: z.array(z.uuid()).max(50),
      })
      .strict()
      .parse(body);
    const password_hash = await this.passwords.hash(b.password);
    return await this.store.tx(async () => {
      this.identity.require(await this.identity.principal(p.id), 'identity:manage');
      if (await this.store.find('users', 'username', b.username))
        fail(409, 'USERNAME_CONFLICT', '账号已存在');
      for (const id of b.group_ids)
        if (!(await this.store.get('groups', id))?.active) fail(422, 'INVALID_GROUP', '团队无效');
      const u = await this.store.insert('users', {
        id: randomUUID(),
        username: b.username,
        display_name: b.display_name,
        password_hash,
        active: true,
        revision: 1,
        created_at: new Date().toISOString(),
      });
      for (const group_id of new Set(b.group_ids))
        await this.store.insert('memberships', { id: randomUUID(), user_id: u.id, group_id });
      await this.store.audit(p.id, 'identity.user_created', u.id);
      return toUserSummary(u);
    });
  }
  private async mutate<T>(principal: Principal, work: () => Promise<T>): Promise<T> {
    this.identity.require(principal, 'identity:manage');
    return await this.store.tx(async () => {
      this.identity.require(await this.identity.principal(principal.id), 'identity:manage');
      return await work();
    });
  }
  async createGroup(principal: Principal, body: unknown) {
    return await this.mutate(principal, async () => {
      const b = z
        .object({ name: z.string().trim().min(1).max(80) })
        .strict()
        .parse(body);
      const g = await this.store.insert('groups', {
        id: randomUUID(),
        ...b,
        active: true,
        revision: 1,
      });
      await this.store.audit(principal.id, 'identity.group_created', g.id);
      return g;
    });
  }
  async createScenario(principal: Principal, body: unknown) {
    const input = z
      .object({
        name: z.string().trim().min(1).max(80),
        description: z.string().max(2000).default(''),
      })
      .strict()
      .parse(body);
    return this.mutate(principal, async () => {
      if (await this.store.find('scenarios', 'name', input.name))
        fail(409, 'SCENARIO_CONFLICT', '场景名称已存在');
      const scenario = await this.store.insert('scenarios', {
        id: randomUUID(),
        ...input,
        active: true,
      });
      await this.store.audit(principal.id, 'scenario.created', scenario.id);
      return scenario;
    });
  }
  async createRole(principal: Principal, body: unknown) {
    return await this.mutate(principal, async () => {
      const b = z
        .object({
          name: z.string().trim().min(1).max(80),
          permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
        })
        .strict()
        .parse(body);
      const r = await this.store.insert('roles', {
        id: randomUUID(),
        ...b,
        builtin: false,
        revision: 1,
      });
      await this.store.audit(principal.id, 'identity.role_created', r.id);
      return r;
    });
  }
  async grantRole(principal: Principal, body: unknown) {
    return await this.mutate(principal, async () => {
      const b = z
        .object({
          principal_id: z.uuid(),
          role_id: z.uuid(),
          scope_type: z.enum(['platform', 'team', 'source', 'asset', 'scenario']),
          scope_id: z.string().default(''),
        })
        .strict()
        .parse(body);
      if (
        !(await this.store.get('roles', b.role_id)) ||
        (!(await this.store.get('users', b.principal_id)) &&
          !(await this.store.get('groups', b.principal_id)))
      )
        fail(422, 'INVALID_BINDING', '角色或主体不存在');
      if (b.scope_type === 'platform' && b.scope_id !== '')
        fail(422, 'INVALID_SCOPE', '平台作用域不接受资源 ID');
      if (
        b.scope_type !== 'platform' &&
        !(await this.store.get(
          (
            {
              team: 'groups',
              source: 'sources',
              asset: 'assets',
              scenario: 'scenarios',
            } as const
          )[b.scope_type],
          b.scope_id,
        ))
      )
        fail(422, 'INVALID_SCOPE', '作用域不存在');
      const r = await this.store.insert('role_bindings', { id: randomUUID(), ...b });
      await this.store.audit(principal.id, 'identity.role_granted', r.id);
      return r;
    });
  }
  async addMembership(principal: Principal, body: unknown) {
    return await this.mutate(principal, async () => {
      const b = z.object({ user_id: z.uuid(), group_id: z.uuid() }).strict().parse(body);
      if (
        !(await this.store.get('users', b.user_id)) ||
        !(await this.store.get('groups', b.group_id))
      )
        fail(422, 'INVALID_MEMBERSHIP', '成员或团队不存在');
      const r = await this.store.insert('memberships', { id: randomUUID(), ...b });
      await this.store.audit(principal.id, 'identity.membership_added', r.id);
      return r;
    });
  }
  async removeGrant(p: Principal, table: 'role_bindings' | 'memberships', id: string) {
    this.identity.require(p, 'identity:manage');
    return await this.store.tx(async () => {
      this.identity.require(await this.identity.principal(p.id), 'identity:manage');
      const row = await this.store.get(table, id);
      if (!row) fail(404, 'NOT_FOUND', '授权不存在');
      await this.store.audit(p.id, 'identity.grant_removed', id);
      await this.store.remove(table, id);
      await this.guardLastAdmin();
      return { ok: true };
    });
  }
  async updateUser(p: Principal, id: string, body: unknown, etag: string | undefined) {
    this.identity.require(p, 'identity:manage');
    const b = z
      .object({
        active: z.boolean().optional(),
        display_name: z.string().trim().min(1).max(80).optional(),
        password: passwordSchema.optional(),
      })
      .strict()
      .parse(body);
    const hash = b.password ? await this.passwords.hash(b.password) : undefined;
    return await this.store.tx(async () => {
      this.identity.require(await this.identity.principal(p.id), 'identity:manage');
      const u = await this.store.get('users', id);
      if (!u) fail(404, 'NOT_FOUND', '账号不存在');
      matchRevision(u, etag);
      const updated = {
        ...u,
        ...(b.active !== undefined ? { active: b.active } : {}),
        ...(b.display_name ? { display_name: b.display_name } : {}),
        ...(hash ? { password_hash: hash } : {}),
        revision: u.revision + 1,
      };
      await this.store.put('users', updated);
      await this.guardLastAdmin();
      await this.sessions.revokeAll(id);
      if (b.active === false) {
        for (const request of await this.store.where('oauth_requests', 'user_id', id))
          if (request.status === 'approved')
            await this.store.put('oauth_requests', { ...request, status: 'denied', code: null });
        for (const login of await this.store.where('cli_logins', 'user_id', id))
          if (login.state === 'approved')
            await this.store.put('cli_logins', { ...login, state: 'consumed' });
        for (const grant of await this.store.where('oauth_grants', 'user_id', id))
          if (grant.revoked_at === null)
            await this.store.put('oauth_grants', { ...grant, revoked_at: Date.now() });
        for (const token of await this.store.where('tokens', 'user_id', id))
          if (token.revoked_at === null)
            await this.store.put('tokens', { ...token, revoked_at: Date.now() });
      }
      await this.store.audit(p.id, 'identity.user_updated', id, '', {
        changes: [
          ...(b.display_name !== undefined && b.display_name !== u.display_name
            ? [{ field: 'display_name', before: u.display_name, after: b.display_name }]
            : []),
          ...(b.active !== undefined && b.active !== u.active
            ? [{ field: 'active', before: u.active, after: b.active }]
            : []),
          ...(hash ? [{ field: 'password' }] : []),
        ],
      });
      return toUserSummary(updated);
    });
  }
  async updateRole(p: Principal, id: string, body: unknown, etag: string | undefined) {
    this.identity.require(p, 'identity:manage');
    const b = z
      .object({
        name: z.string().trim().min(1).max(80),
        permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
      })
      .strict()
      .parse(body);
    return await this.store.tx(async () => {
      this.identity.require(await this.identity.principal(p.id), 'identity:manage');
      const r = await this.store.get('roles', id);
      if (!r) fail(404, 'NOT_FOUND', '角色不存在');
      if (r.builtin) fail(409, 'BUILTIN_ROLE', '内置角色不可改写，请创建自定义角色');
      matchRevision(r, etag);
      const next = await this.store.put('roles', {
        ...r,
        ...b,
        permissions: [...new Set(b.permissions)],
        revision: r.revision + 1,
      });
      await this.guardLastAdmin();
      await this.store.audit(p.id, 'identity.role_updated', id, '', {
        changes: [
          { field: 'name', before: r.name, after: next.name },
          { field: 'permissions', before: r.permissions, after: next.permissions },
        ],
      });
      return next;
    });
  }
  async updateGroup(p: Principal, id: string, body: unknown, etag: string | undefined) {
    this.identity.require(p, 'identity:manage');
    const b = z
      .object({ name: z.string().trim().min(1).max(80).optional(), active: z.boolean().optional() })
      .strict()
      .parse(body);
    return await this.store.tx(async () => {
      this.identity.require(await this.identity.principal(p.id), 'identity:manage');
      const g = await this.store.get('groups', id);
      if (!g) fail(404, 'NOT_FOUND', '团队不存在');
      matchRevision(g, etag);
      const next = await this.store.put('groups', { ...g, ...b, revision: g.revision + 1 });
      await this.guardLastAdmin();
      await this.store.audit(p.id, 'identity.group_updated', id, '', {
        changes: [
          ...(g.name !== next.name ? [{ field: 'name', before: g.name, after: next.name }] : []),
          ...(g.active !== next.active
            ? [{ field: 'active', before: g.active, after: next.active }]
            : []),
        ],
      });
      return next;
    });
  }
}
