import { auditDefinitions } from '@capability-hub/domain/audit';
import type { Principal } from '@capability-hub/domain/identity';
import type { RecordStore } from '../ports/index.js';
import { has } from '@capability-hub/domain/rbac';
import { z } from 'zod';
import type { GitCredentialService } from '../credentials/git-credential-service.js';
import type { IdentityService } from '../identity/identity-service.js';
import { matchRevision } from '../shared/revision.js';

const profileInputSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80),
    title: z.string().trim().max(80),
    bio: z.string().trim().max(500),
    email: z.union([z.literal(''), z.string().email().max(254)]),
    avatar_color: z.enum(['teal', 'blue', 'violet', 'amber', 'rose']),
  })
  .strict();

export class ProfileService {
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
    private readonly credentials: GitCredentialService,
    private readonly gitHosts: string[],
  ) {}

  async current(principal: Principal, csrfToken: string) {
    const user = await this.identity.activeUser(principal.id);
    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_color: user.avatar_color ?? 'teal',
      csrf_token: csrfToken,
      groups: (await this.store.all('groups'))
        .filter((group) => principal.groups.includes(group.id))
        .map(({ id, name }) => ({ id, name })),
      capabilities: {
        can_ai: has(principal, 'ai:execute'),
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

  async detail(principal: Principal) {
    const user = await this.identity.activeUser(principal.id);
    return {
      id: user.id,
      username: user.username,
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
