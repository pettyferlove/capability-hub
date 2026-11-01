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
  /**
   * 补齐内置角色：按稳定的 `key` 判存，已存在的角色跳过而不覆盖，
   * 因而升级不会冲掉运行中实例的角色配置，可反复调用（幂等）。
   */
  async initialize() {
    const store = this.store;
    await store.tx(async () => {
      for (const r of builtinRoles)
        if (!(await store.find('roles', 'key', r.key)))
          await store.insert('roles', { id: randomUUID(), ...r, builtin: true, revision: 1 });
    });
  }
  /**
   * 管理台快照：账号（经 {@link toUserSummary} 过滤字段）、团队、成员关系、角色、绑定与权限清单。
   * 需要 `identity:manage` 平台权限，否则 403/`FORBIDDEN`。只读，不开事务也不缓存，
   * 因此并发的变更可能让快照内部略有不一致。
   */
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
  /**
   * 新建账号并挂团队。密码哈希在事务外算完，事务内再次校验调用者权限，
   * 因为哈希期间授权可能已被撤销。
   * 用户名小写后唯一，重复抛 409/`USERNAME_CONFLICT`；团队必须存在且启用，
   * 否则 422/`INVALID_GROUP`；团队 ID 去重后建成员关系。写审计 `identity.user_created`。
   * @param body - 严格 schema：用户名 3–64、显示名 1–80、密码 12–256、最多 50 个团队
   */
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
  /**
   * 新建团队，允许重名；写审计 `identity.group_created`，返回原始团队记录。
   * 需 `identity:manage`（403/`FORBIDDEN`），在与 {@link mutate} 相同的双检事务内执行。
   * @param body - `{ name }`，1–80 字符，未知字段直接拒绝
   */
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
  /**
   * 新建场景，名称全局唯一，重复抛 409/`SCENARIO_CONFLICT`；写审计 `scenario.created`。
   * 需 `identity:manage`（403/`FORBIDDEN`）。
   * @param body - `{ name, description? }`，名称 1–80，描述缺省空串、上限 2000 字符
   */
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
  /**
   * 新建自定义角色：权限只能取自 {@link PERMISSIONS}，数量不超过权限总数，落库时 `builtin: false`。
   * 角色本身不带作用域，作用范围由 {@link grantRole} 的绑定决定。
   * 写审计 `identity.role_created`。需 `identity:manage`（403/`FORBIDDEN`）。
   */
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
  /**
   * 给用户或团队绑定角色：主体可以是 user 或 group，作用域为
   * `platform` | `team` | `source` | `asset` | `scenario`。
   * 角色或主体不存在抛 422/`INVALID_BINDING`；`platform` 必须 `scope_id` 为空，
   * 其它作用域必须指向存在的记录，否则 422/`INVALID_SCOPE`。写审计 `identity.role_granted`。
   * 不检查重复绑定，同一三元组可重复插入（判定时按「存在任一匹配」计算，不影响结果）。
   */
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
  /**
   * 把用户加入团队；成员或团队不存在抛 422/`INVALID_MEMBERSHIP`。
   * 写审计 `identity.membership_added`。不检查是否已是成员，
   * 重复调用会产生重复记录（判定不受影响）。
   */
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
  /**
   * 撤销一条角色绑定或成员关系：事务内先写审计 `identity.grant_removed` 再删除。
   * 记录不存在抛 404；删除后若已无有效平台管理员，抛 409/`LAST_ADMIN` 由事务回滚保住授权。
   * 需 `identity:manage`（403/`FORBIDDEN`）。
   * @param table - 只接受 `role_bindings` 与 `memberships`
   */
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
  /**
   * 局部更新账号的 `active` / `display_name` / `password`，需 `identity:manage`，并发靠修订号。
   * `etag` 必须等于当前 `revision`：缺失抛 428/`IF_MATCH_REQUIRED`，
   * 不符抛 412/`REVISION_CONFLICT`；账号不存在抛 404。
   * 任何更新都吊销该用户全部会话，改密或停用即刻踢出在线设备。
   * `active: false` 还会连带作废待处理的 OAuth 同意、CLI 登录，并吊销已授权连接与个人令牌。
   * 事务末尾校验仍保留有效平台管理员（409/`LAST_ADMIN`）；写审计 `identity.user_updated`，
   * 密码只记录「已修改」而不记录内容。
   */
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
  /**
   * 覆写自定义角色的名称与权限（权限自动去重）；内置角色不可改，抛 409/`BUILTIN_ROLE`。
   * 需 `identity:manage`；角色不存在抛 404，`etag` 缺失 428、不符 412。
   * 变更后重算平台管理员数量（409/`LAST_ADMIN`），
   * 写审计 `identity.role_updated` 并保留前后权限差异。
   */
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
  /**
   * 局部更新团队名称或启停。停用后，该团队授予的绑定与成员关系在下一次
   * {@link IdentityService.principal} 重建时全部失效（鉴权不受历史快照影响）。
   * 需 `identity:manage`；不存在抛 404，`etag` 缺失 428、不符 412。
   * 写审计 `identity.group_updated`，并在事务末尾校验仍保留有效平台管理员（409/`LAST_ADMIN`）。
   */
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
