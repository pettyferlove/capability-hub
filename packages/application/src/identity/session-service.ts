import type { UserRecord } from '@capability-hub/domain/models';
import type { RecordStore } from '../ports/index.js';
import { sha256 } from '@capability-hub/domain/canonical';
import { fail, notFound } from '@capability-hub/domain/errors';
import { randomBytes } from 'node:crypto';
import type { IdentityService } from './identity-service.js';
import type { SessionClientInfo } from '@capability-hub/domain/identity';

/** 浏览器会话的签发、查找与吊销；库里只存令牌摘要，明文仅存在于 `hub_session` cookie。 */
export class SessionService {
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
  ) {}

  /**
   * 签发会话：32 字节随机令牌只在此返回一次，库存 `sha256` 摘要；CSRF 令牌随会话一起下发。
   * 有效期固定 8 小时（与 `hub_session` cookie 的 `maxAge` 一致），到期即失效，不滑动续期。
   * 事务内复核账号仍启用且 `password_hash` 未变，否则 401/`INVALID_CREDENTIALS`，
   * 避免用旧密码在改密后补建会话。
   * @param client - 终端信息，仅供会话列表展示，不参与鉴权
   */
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

  /**
   * 按原始令牌查会话；未知、已过期或已吊销一律返回 `undefined` 而不抛错，
   * 由调用方自行决定按匿名访问还是 401 处理。
   */
  async find(token: string) {
    const session = await this.store.get('sessions', sha256(token));
    if (!session || session.expires_at <= Date.now() || session.revoked_at !== null) return;
    return session;
  }

  /**
   * 列出该用户仍有效（未过期、未吊销）的会话：当前会话排首位，其余按创建时间倒序，ID 兜底排序。
   * 只回显摘要 ID、时间与终端信息，不含令牌明文与 CSRF 值。
   */
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

  /**
   * 吊销指定会话；不能用于结束当前会话（抛 422/`CURRENT_SESSION`，应走 {@link logout}）。
   * 会话不存在或不属于该用户抛 404；用户已失效抛 401/`UNAUTHENTICATED`。
   * 写审计 `identity.session_revoked`，被吊销的会话即刻失效。
   */
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

  /**
   * 结束会话；ID 属于其他用户或已不存在时静默成功，可安全重复调用（重试无副作用）。
   * 写审计 `identity.logout`，但仅在实际吊销时。
   */
  async logout(userId: string, id: string): Promise<void> {
    await this.store.tx(async () => {
      const session = await this.store.get('sessions', id);
      if (session?.user_id === userId) {
        await this.store.put('sessions', { ...session, revoked_at: Date.now() });
        await this.store.audit(userId, 'identity.logout', userId);
      }
    });
  }

  /**
   * 吊销该用户全部未吊销的会话，用于改密、停用等权限上下文变化后的强制下线。
   * 不写审计（逐个会话吊销的痕迹由调用方自己的审计事件承担），不校验账号是否启用。
   */
  async revokeAll(userId: string): Promise<void> {
    await this.store.tx(async () => {
      for (const session of await this.store.where('sessions', 'user_id', userId))
        if (session.revoked_at === null)
          await this.store.put('sessions', { ...session, revoked_at: Date.now() });
    });
  }
}
