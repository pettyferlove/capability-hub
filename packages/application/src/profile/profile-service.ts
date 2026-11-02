import { auditDefinitions } from '@capability-hub/domain/audit';
import { userLoginProvider, type Principal } from '@capability-hub/domain/identity';
import type { RecordStore } from '../ports/index.js';
import { has, hasInAnyScope } from '@capability-hub/domain/rbac';
import { z } from 'zod';
import type { GitCredentialService } from '../credentials/git-credential-service.js';
import type { IdentityService } from '../identity/identity-service.js';
import { matchRevision } from '../shared/revision.js';

const profileInputSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80),
    title: z.string().trim().max(80),
    bio: z.string().trim().max(500),
    email: z.union([z.literal(''), z.email().max(254)]),
    avatar_color: z.enum(['teal', 'blue', 'violet', 'amber', 'rose']),
  })
  .strict();

/**
 * 个人资料与能力的只读/自改入口：账号可用性统一由 {@link IdentityService.activeUser} 判定，
 * 不可用时抛 401/`UNAUTHENTICATED`；写操作自开 `store.tx`，与 HTTP 层的幂等中间件无关。
 * 凭据数量依赖 {@link GitCredentialService}，`gitHosts` 来自部署配置，仅用于前端展示。
 */
export class ProfileService {
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
    private readonly credentials: GitCredentialService,
    private readonly gitHosts: string[],
  ) {}

  /**
   * 组装会话引导数据；`csrfToken` 由调用方（会话层）传入并原样回显，此处既不生成也不校验。
   * 能力位用 `has` 按角色绑定实时求值，角色变更后无需重新登录即生效；
   * `can_publish` 直接检查绑定权限里是否含 `asset:create` 或 `asset:maintain`。
   */
  async current(principal: Principal, csrfToken: string) {
    const user = await this.identity.activeUser(principal.id);
    return {
      id: user.id,
      username: user.username,
      auth_provider: userLoginProvider(user),
      display_name: user.display_name,
      avatar_color: user.avatar_color ?? 'teal',
      csrf_token: csrfToken,
      groups: (await this.store.all('groups'))
        .filter((group) => principal.groups.includes(group.id))
        .map(({ id, name }) => ({ id, name })),
      capabilities: {
        can_ai: hasInAnyScope(principal, 'ai:execute'),
        can_ai_console: has(principal, 'ai:inspect'),
        can_admin: has(principal, 'identity:manage'),
        can_audit: has(principal, 'audit:read'),
        can_manage_assets: has(principal, 'asset:lifecycle'),
        can_publish: principal.bindings.some((binding) =>
          (principal.permissions[binding.role_id] ?? []).some(
            (permission) => permission === 'asset:maintain' || permission === 'asset:create',
          ),
        ),
        can_review: principal.bindings.some((binding) =>
          (principal.permissions[binding.role_id] ?? []).includes('review:decide'),
        ),
      },
      features: { git_hosts: this.gitHosts },
    };
  }

  /**
   * 读取调用者自身资料，无额外权限校验，仅要求账号可用；多次读取不构成一致快照。
   * `stats.credentials` 经 {@link GitCredentialService} 统计未撤销凭据，
   * `stats.decisions` 只统计 `publication.approved` / `publication.rejected` 两类审计事件。
   */
  async detail(principal: Principal) {
    const user = await this.identity.activeUser(principal.id);
    return {
      id: user.id,
      username: user.username,
      auth_provider: userLoginProvider(user),
      display_name: user.display_name,
      title: user.title ?? '',
      bio: user.bio ?? '',
      email: user.email ?? '',
      avatar_color: user.avatar_color ?? 'teal',
      created_at: user.created_at,
      revision: user.revision,
      roles: await Promise.all(
        principal.bindings.map(async (binding) => ({
          name: (await this.store.get('roles', binding.role_id))?.name,
          scope_type: binding.scope_type,
          scope_id: binding.scope_id,
        })),
      ),
      stats: {
        submissions: (await this.store.where('requests', 'submitted_by', principal.id)).length,
        decisions: (await this.store.where('audit', 'actor_id', principal.id)).filter((event) =>
          ['publication.approved', 'publication.rejected'].includes(event.action),
        ).length,
        credentials: (await this.credentials.list(principal)).filter(
          (credential) => !credential.revoked_at,
        ).length,
      },
    };
  }

  /**
   * 乐观并发：`etag` 缺失抛 428/`IF_MATCH_REQUIRED`，与 `user.revision` 不符抛
   * 412/`REVISION_CONFLICT`。`input` 经 `profileInputSchema` 严格校验（拒绝未知字段），
   * 失败直接抛 `ZodError`，由 HTTP 层映射成 422/`VALIDATION_ERROR`。
   * 自己开启 `store.tx`，在同一事务内改写 `users`（`revision` 加一）并写审计
   * `identity.profile_updated`；未包 `IdempotencyService`，重复提交会再次提升 `revision`。
   */
  async update(principal: Principal, input: unknown, etag: string | undefined) {
    const value = profileInputSchema.parse(input);
    return await this.store.tx(async () => {
      const user = await this.identity.activeUser(principal.id);
      matchRevision(user, etag);
      await this.store.put('users', { ...user, ...value, revision: user.revision + 1 });
      await this.store.audit(principal.id, 'identity.profile_updated', principal.id);
      return await this.detail(principal);
    });
  }

  /**
   * 不做权限校验：`userId` 由调用方给定，必须已限定为当前主体，否则会读出他人操作记录。
   * 按 `occurred_at` 倒序（同刻按 `id` 倒序）取最近 50 条，不开启事务。
   */
  async activity(userId: string) {
    return (await this.store.where('audit', 'actor_id', userId))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id))
      .slice(0, 50)
      .map(({ id, action, occurred_at, entity_id, result }) => ({
        id,
        action,
        action_label: auditDefinitions[action]?.label ?? '其他操作',
        occurred_at,
        entity_id,
        result,
      }));
  }
}
