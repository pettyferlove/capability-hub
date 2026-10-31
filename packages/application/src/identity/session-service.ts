import type { UserRecord } from '@capability-hub/domain/models';
import type { RecordStore } from '../ports/index.js';
import { sha256 } from '@capability-hub/domain/canonical';
import { fail, notFound } from '@capability-hub/domain/errors';
import { randomBytes } from 'node:crypto';
import type { IdentityService } from './identity-service.js';
import type { SessionClientInfo } from '@capability-hub/domain/identity';

export class SessionService {
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
  ) {}

  async create(user: UserRecord, client: SessionClientInfo | null = null) {
    const token = randomBytes(32).toString('base64url');
    const session = {
      id: sha256(token),
      user_id: user.id,
      csrf: randomBytes(32).toString('base64url'),
      created_at: new Date().toISOString(),
      expires_at: Date.now() + 8 * 3600000,
      revoked_at: null,
      client,
    };
    await this.store.tx(async () => {
      const current = await this.identity.activeUser(user.id);
      if (current.password_hash !== user.password_hash)
        fail(401, 'INVALID_CREDENTIALS', '账号或密码已变化，请重新登录');
      await this.store.insert('sessions', session);
    });
    return { token, session };
  }

  async find(token: string) {
    const session = await this.store.get('sessions', sha256(token));
    if (!session || session.expires_at <= Date.now() || session.revoked_at !== null) return;
    return session;
  }

  async list(userId: string, currentId: string) {
    return (await this.store.where('sessions', 'user_id', userId))
      .filter((session) => session.revoked_at === null && session.expires_at > Date.now())
      .sort(
        (a, b) =>
          Number(b.id === currentId) - Number(a.id === currentId) ||
          b.created_at.localeCompare(a.created_at) ||
          a.id.localeCompare(b.id),
      )
      .map((session) => ({
        id: session.id,
        current: session.id === currentId,
        created_at: session.created_at,
        expires_at: session.expires_at,
        client: session.client,
      }));
  }

  async revoke(userId: string, id: string, currentId: string): Promise<void> {
    await this.store.tx(async () => {
      await this.identity.activeUser(userId);
      const session = await this.store.get('sessions', id);
      if (!session || session.user_id !== userId) notFound();
      if (id === currentId) fail(422, 'CURRENT_SESSION', '请通过退出登录结束当前会话');
      await this.store.put('sessions', { ...session, revoked_at: Date.now() });
      await this.store.audit(userId, 'identity.session_revoked', id);
    });
  }

  async logout(userId: string, id: string): Promise<void> {
    await this.store.tx(async () => {
      const session = await this.store.get('sessions', id);
      if (session?.user_id === userId) {
        await this.store.put('sessions', { ...session, revoked_at: Date.now() });
        await this.store.audit(userId, 'identity.logout', userId);
      }
    });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.store.tx(async () => {
      for (const session of await this.store.where('sessions', 'user_id', userId))
        if (session.revoked_at === null)
          await this.store.put('sessions', { ...session, revoked_at: Date.now() });
    });
  }
}
