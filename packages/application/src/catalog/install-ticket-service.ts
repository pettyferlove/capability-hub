import { randomBytes } from 'node:crypto';
import { sha256 } from '@capability-hub/domain/canonical';
import { fail, HubError } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type { InstallTicketCredential } from '@capability-hub/domain/models';
import type { IdentityService } from '../identity/identity-service.js';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';

const ticketLifetime = 600_000;

function invalidTicket(): never {
  fail(404, 'INSTALL_TICKET_INVALID', '安装票据无效或已过期，请重新调用 install_skill');
}

/** 兑换与授权复核在同一事务内完成，归档读取不持有事务。 */
export class InstallTicketService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
    private readonly identity: IdentityService,
  ) {}

  async issue(principal: Principal, credential: InstallTicketCredential, versionId: string) {
    const { store } = this.context;
    const prepared = await store.tx(async () => {
      const current = await this.identity.principal(principal.id);
      if (!(await this.hasCredential(current.id, credential)))
        fail(401, 'UNAUTHENTICATED', '连接已失效，请重新授权');
      const version = await this.access.requireReadableVersion(current, versionId);
      const asset = await this.access.getAsset(version.asset_id);
      if (asset.kind !== 'skill') fail(422, 'NOT_SKILL', '需要 Skill 版本');

      let issued: { ticket: string; expires_at: number } | undefined;
      if (!(await this.access.canRead(null, asset, version))) {
        const now = Date.now();
        let active = 0;
        for (const record of await store.where('install_tickets', 'user_id', current.id)) {
          if (record.expires_at <= now) await store.remove('install_tickets', record.id);
          else active++;
        }
        // 限额错误在事务外抛出，否则本次清理的过期票据会随之回滚。
        if (active >= 20) return null;
        const ticket = randomBytes(32).toString('base64url');
        const expiresAt = now + ticketLifetime;
        await store.insert('install_tickets', {
          id: sha256(ticket),
          user_id: current.id,
          version_id: version.id,
          credential,
          created_at: now,
          expires_at: expiresAt,
          consumed_at: null,
        });
        issued = { ticket, expires_at: expiresAt };
      }
      await store.audit(current.id, 'skill.installation_prepared', version.id);
      return { version, slug: asset.slug, ...(issued ?? { ticket: null, expires_at: null }) };
    });
    if (!prepared)
      throw new HubError(
        429,
        'INSTALL_TICKET_LIMIT',
        '安装票据已达 20 张，请等待过期后重试',
        {},
        true,
      );
    return prepared;
  }

  async describe(ticket: string) {
    return await this.context.store.tx(async () => {
      const { record, principal, version } = await this.authorize(ticket);
      const asset = await this.access.getAsset(version.asset_id);
      const release = await this.access.latestReleaseForVersion(version);
      if (!release) invalidTicket();
      return {
        asset_id: asset.id,
        slug: asset.slug,
        version_id: version.id,
        version_label: version.version_label,
        release_id: release.id,
        latest_release: await this.access.latestReadableRelease(principal, asset),
        content_digest: version.content_digest,
        artifact_digest: version.artifact_digest,
        manifest: version.manifest,
        expires_at: new Date(record.expires_at).toISOString(),
        archive_available: record.consumed_at === null,
      };
    });
  }

  async redeem(ticket: string) {
    const { store } = this.context;
    return await store.tx(async () => {
      const { record, principal, version } = await this.authorize(ticket);
      if (record.consumed_at !== null)
        fail(409, 'INSTALL_TICKET_USED', '安装票据已使用，请重新调用 install_skill');
      // 下载可能跨过原到期时间；顺延后 CLI 仍能在提交前复核清单，归档不会再次交付。
      const now = Date.now();
      await store.put('install_tickets', {
        ...record,
        consumed_at: now,
        expires_at: now + ticketLifetime,
      });
      return { principal, version };
    });
  }

  private async authorize(ticket: string) {
    const record = await this.context.store.get('install_tickets', sha256(ticket));
    if (
      !record ||
      record.expires_at <= Date.now() ||
      !(await this.hasCredential(record.user_id, record.credential))
    )
      invalidTicket();
    try {
      const principal = await this.identity.principal(record.user_id);
      const version = await this.access.requireReadableVersion(principal, record.version_id);
      return { record, principal, version };
    } catch (error) {
      if (
        error instanceof HubError &&
        (error.code === 'UNAUTHENTICATED' || error.code === 'NOT_FOUND')
      )
        invalidTicket();
      throw error;
    }
  }

  private async hasCredential(userId: string, credential: InstallTicketCredential) {
    const { store } = this.context;
    const record =
      credential.kind === 'oauth'
        ? await store.get('oauth_grants', credential.id)
        : await store.get('tokens', credential.id);
    return record?.user_id === userId && record.revoked_at === null;
  }
}
