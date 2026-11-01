import type { LoginProvider, Principal } from '@capability-hub/domain/identity';
import type { UserRecord } from '@capability-hub/domain/models';
import type { DirectoryAuthenticator, DirectoryIdentity, RecordStore } from '../ports/index.js';
import { fail } from '@capability-hub/domain/errors';
import { sha256 } from '@capability-hub/domain/canonical';
import { randomUUID } from 'node:crypto';
import { usernameSchema, type SetupCommand } from './commands.js';
import { resolveDirectoryUser } from './directory-login.js';
import type { PasswordHasher } from '../ports/index.js';
import type { IdentityService } from './identity-service.js';
import type { SessionService } from './session-service.js';

/** 本地账号初始化、密码变更及本地或目录认证。 */
export class AuthenticationService {
  private readonly dummy = '00000000000000000000000000000000:' + '00'.repeat(64);
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
    private readonly passwords: PasswordHasher,
    private readonly directory?: { authenticator: DirectoryAuthenticator; defaultRoles: string[] },
  ) {}
  /**
   * 首次初始化：以「库内无账号」为唯一前置条件，重复调用抛 409/`ALREADY_INITIALIZED`。
   * 一个事务内建账号、同名团队、成员关系，并授予 `admin`（平台）与 `maintainer`（该团队）绑定，
   * 最后写审计 `identity.bootstrap`；初始化密钥由路由层校验，本方法不再校验。
   * 密码哈希在开事务前完成，避免 scrypt 计算期间长时间持有写事务。
   * @returns 新建的账号记录，调用方据此立刻签发会话
   */
  async setup(body: SetupCommand) {
    const v = body;
    const password_hash = await this.passwords.hash(v.password);
    return await this.store.tx(async () => {
      if ((await this.store.all('users')).length) fail(409, 'ALREADY_INITIALIZED', '系统已初始化');
      const u = await this.store.insert('users', {
        id: randomUUID(),
        username: v.username,
        password_hash,
        display_name: v.display_name,
        active: true,
        revision: 1,
        created_at: new Date().toISOString(),
      });
      const g = await this.store.insert('groups', {
        id: randomUUID(),
        name: v.team_name,
        active: true,
        revision: 1,
      });
      await this.store.insert('memberships', { id: randomUUID(), user_id: u.id, group_id: g.id });
      for (const key of ['admin', 'maintainer'])
        await this.store.insert('role_bindings', {
          id: randomUUID(),
          principal_id: u.id,
          role_id: (await this.store.find('roles', 'key', key))!.id,
          scope_type: key === 'admin' ? 'platform' : 'team',
          scope_id: key === 'admin' ? '' : g.id,
        });
      await this.store.audit(u.id, 'identity.bootstrap', u.id);
      return u;
    });
  }
  /**
   * 校验密码并返回账号；只验证身份，不建会话，也不进入幂等重放。
   * 同一认证来源、地址和归一化用户名 15 分钟内失败满 8 次即 429/`LOGIN_RATE_LIMIT`；
   * 只验证选定来源的凭据，凭据错误统一 401/`INVALID_CREDENTIALS`，
   * 不区分「无此账号」与「密码错误」。失败计数与成功清理都写审计，失败记在 `anonymous` 名下。
   * @param username - 首尾空格与大小写不敏感，按小写查表
   * @param address - 客户端地址，只参与限流键的摘要，不落库明文
   */
  async login(
    username: string,
    password: string,
    address: string,
    provider: LoginProvider = 'local',
  ) {
    username = username.trim().toLowerCase();
    const directory = provider === 'ldap' ? this.directory : undefined;
    if (provider !== 'local' && !directory) fail(403, 'LDAP_DISABLED', '此实例未启用 LDAP 登录');
    const key = sha256(JSON.stringify([provider, address, username]));
    const attempts = await this.store.get('login_attempts', key);
    if (attempts && attempts.window_expires_at > Date.now() && attempts.failure_count >= 8)
      fail(429, 'LOGIN_RATE_LIMIT', '登录尝试过多，请 15 分钟后重试');
    const observed = await this.identity.userForLogin(username, provider);
    let directoryIdentity: DirectoryIdentity | undefined;
    let localValid = false;
    if (directory) {
      if (observed?.active !== false && usernameSchema.safeParse(username).success)
        directoryIdentity = await directory.authenticator.authenticate(username, password);
    } else {
      const valid = await this.passwords.verify(password, observed?.password_hash ?? this.dummy);
      localValid = valid && observed?.password_hash != null;
    }
    const user = await this.store.tx(async () => {
      const attempts = await this.store.get('login_attempts', key);
      if (attempts && attempts.window_expires_at > Date.now() && attempts.failure_count >= 8)
        fail(429, 'LOGIN_RATE_LIMIT', '登录尝试过多，请 15 分钟后重试');
      const current = await this.identity.userForLogin(username, provider);
      let authenticated: UserRecord | undefined;
      if (directoryIdentity && directory)
        authenticated = await resolveDirectoryUser(
          this.store,
          username,
          directoryIdentity,
          current,
          directory.defaultRoles,
        );
      else if (
        localValid &&
        current?.active &&
        current.id === observed?.id &&
        current.password_hash === observed.password_hash
      )
        authenticated = current;
      if (!authenticated) {
        const attempt = {
          id: key,
          failure_count:
            (attempts && attempts.window_expires_at > Date.now() ? attempts.failure_count : 0) + 1,
          window_expires_at: Date.now() + 15 * 60000,
        };
        if (attempts) await this.store.put('login_attempts', attempt);
        else await this.store.insert('login_attempts', attempt);
        await this.store.audit(
          'anonymous',
          'identity.login_failed',
          current?.id ?? '',
          'invalid_credentials',
          { provider },
        );
        return undefined;
      }
      if (attempts) await this.store.remove('login_attempts', key);
      await this.store.audit(authenticated.id, 'identity.login', authenticated.id, '', {
        provider,
      });
      return authenticated;
    });
    if (!user) fail(401, 'INVALID_CREDENTIALS', '账号或密码错误');
    return user;
  }
  /**
   * 改密需要当前密码二次确认，成功后在同一事务内吊销该用户全部会话。
   * 当前密码不符抛 422/`CURRENT_PASSWORD_INVALID`；账号失效抛 401/`UNAUTHENTICATED`。
   * 哈希在事务外计算，事务内若发现哈希已被他处改动则抛 409/`AUTH_CONTEXT_CHANGED`，
   * 防止覆盖并发修改。写审计 `identity.password_changed`。
   */
  async changePassword(
    principal: Principal,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const observed = await this.identity.activeUser(principal.id);
    if (observed.password_hash === null)
      fail(422, 'DIRECTORY_PASSWORD_MANAGED', '请在 LDAP 目录中修改密码');
    if (!(await this.passwords.verify(currentPassword, observed.password_hash)))
      fail(422, 'CURRENT_PASSWORD_INVALID', '当前密码不正确');
    const password_hash = await this.passwords.hash(newPassword);
    await this.store.tx(async () => {
      const current = await this.identity.activeUser(principal.id);
      if (current.password_hash !== observed.password_hash)
        fail(409, 'AUTH_CONTEXT_CHANGED', '密码已变化，请重新登录');
      await this.store.put('users', { ...current, password_hash, revision: current.revision + 1 });
      await this.sessions.revokeAll(principal.id);
      await this.store.audit(principal.id, 'identity.password_changed', principal.id);
    });
  }
}
