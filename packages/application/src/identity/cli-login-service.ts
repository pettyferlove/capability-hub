import type { Principal } from '@capability-hub/domain/identity';
import type { RecordStore } from '../ports/index.js';
import { sha256 } from '@capability-hub/domain/canonical';
import { fail } from '@capability-hub/domain/errors';
import { randomBytes } from 'node:crypto';
import type { CliLoginCommand, ApproveCliLoginCommand, PollCliLoginQuery } from './commands.js';
import type { IdentityService } from './identity-service.js';
import type { TokenService } from './token-service.js';

/** 网页批准与校验码消费共享事务边界，一次批准只签发一个令牌。 */
export class CliLoginService {
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
    private readonly tokens: TokenService,
    private readonly publicUrl: string,
  ) {}

  /**
   * 发起 CLI 登录：生成一次性 `device_code`（明文只出现在本次响应）与 8 位大写 `user_code`。
   * 记录 10 分钟内有效，`challenge` 原样存储，轮询时用 `sha256(verifier)` 与之比对，
   * 即 verifier 必须在发起前就确定（PKCE 语义）。匿名可调用，不写审计。
   */
  async request(input: CliLoginCommand) {
    const { challenge } = input;
    const device = randomBytes(32).toString('base64url');
    const code = randomBytes(4).toString('hex').toUpperCase();
    await this.store.insert('cli_logins', {
      id: sha256(device),
      code,
      challenge,
      state: 'pending',
      expires_at: Date.now() + 600000,
    });
    return {
      device_code: device,
      user_code: code,
      verification_uri: `${this.publicUrl}/connect?code=${code}`,
      expires_in: 600,
    };
  }

  /**
   * 网页端批准 CLI 登录：把待处理记录绑定到当前账号，必须携带网页会话调用。
   * 授权码不存在、已过期或状态不再是 pending 抛 400/`CLI_LOGIN_EXPIRED`，
   * 因此重复批准不会产生第二个令牌；账号失效抛 401/`UNAUTHENTICATED`。
   * 写审计 `identity.cli_approved`，令牌仍由 {@link poll} 一次性签发。
   */
  async approve(principal: Principal, input: ApproveCliLoginCommand): Promise<void> {
    const { code } = input;
    await this.store.tx(async () => {
      await this.identity.activeUser(principal.id);
      const login = await this.store.find('cli_logins', 'code', code);
      if (!login || login.expires_at <= Date.now() || login.state !== 'pending')
        fail(400, 'CLI_LOGIN_EXPIRED', 'CLI 授权码无效或过期');
      await this.store.put('cli_logins', { ...login, state: 'approved', user_id: principal.id });
      await this.store.audit(principal.id, 'identity.cli_approved', login.id);
    });
  }

  /**
   * CLI 轮询：未批准时只回报 `pending`；批准后在本次事务内签发 scope 为 `hub:read` 的令牌并置为
   * consumed，所以同一次授权最多换到一枚令牌。
   * `device_code` 未知或过期、verifier 与 challenge 不符都抛 400/`CLI_LOGIN_EXPIRED`
   * （不区分原因）；已消费抛 409/`CLI_LOGIN_USED`。令牌明文只在此返回一次，库中只留摘要。
   */
  async poll(input: PollCliLoginQuery) {
    const value = input;
    return await this.store.tx(async () => {
      const login = await this.store.get('cli_logins', sha256(value.device_code));
      if (!login || login.expires_at <= Date.now() || sha256(value.verifier) !== login.challenge)
        fail(400, 'CLI_LOGIN_EXPIRED', 'CLI 登录已过期');
      if (login.state === 'pending') return { state: 'pending' as const };
      if (login.state !== 'approved' || !login.user_id) fail(409, 'CLI_LOGIN_USED', '授权已使用');
      const principal = await this.identity.principal(login.user_id);
      const token = await this.tokens.issue(principal, { name: 'CLI' });
      await this.store.put('cli_logins', { ...login, state: 'consumed' });
      return { state: 'complete' as const, ...token };
    });
  }
}
