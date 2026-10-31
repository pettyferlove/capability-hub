import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sha256 } from '@capability-hub/domain/canonical';
import { HubError, notFound } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type { OAuthGrantRecord } from '@capability-hub/domain/models';
import type { RecordStore } from '../ports/index.js';
import type { IdentityService } from './identity-service.js';

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
const value = z.string().min(1).max(2048);
const verifier = z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/);
const registration = z.object({
  client_name: z.string().trim().min(1).max(80).default('MCP 客户端'),
  redirect_uris: z.array(value).min(1).max(10),
  token_endpoint_auth_method: z.literal('none').default('none'),
  grant_types: z.array(z.enum(['authorization_code', 'refresh_token'])).optional(),
  response_types: z.array(z.literal('code')).optional(),
});
const authorization = z.object({
  client_id: value,
  redirect_uri: value,
  response_type: z.literal('code'),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal('S256'),
  resource: value,
  scope: value.default('hub:read'),
  state: z.string().max(2048).default(''),
});
const tokenRequest = z.object({
  grant_type: z.enum(['authorization_code', 'refresh_token']),
  client_id: value,
  resource: value,
  code: value.optional(),
  redirect_uri: value.optional(),
  code_verifier: verifier.optional(),
  refresh_token: value.optional(),
  scope: value.optional(),
});
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new OAuthError('invalid_request', '授权请求格式无效');
  return parsed.data;
}
function scopeOf(scope: string): OAuthGrantRecord['scope'] {
  const scopes = scope.split(' ');
  if (scopes.some((s) => !['hub:read', 'hub:contribute'].includes(s)))
    throw new OAuthError('invalid_scope', '不支持请求的权限');
  return scopes.includes('hub:contribute') ? 'hub:contribute' : 'hub:read';
}
function redirect(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthError('invalid_redirect_uri', '回调地址无效');
  }
  if (
    url.username ||
    url.password ||
    value.includes('#') ||
    value.includes('\\') ||
    ['code', 'error', 'state', 'iss'].some((key) => url.searchParams.has(key)) ||
    /[\p{Cc}\p{Cf}\s]/u.test(value) ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname)))
  )
    throw new OAuthError('invalid_redirect_uri', '回调仅支持 HTTPS 或本机 HTTP');
  return url;
}
/** Loopback 只放宽端口，主机、路径和查询必须与注册信息完全一致。 */
function matchesRedirect(registered: string, requested: string): boolean {
  const left = redirect(registered);
  redirect(requested);
  if (left.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(left.hostname)) {
    const port = /^(http:\/\/(?:127\.0\.0\.1|\[::1\]))(?::[0-9]+)?(?=\/|$)/;
    return registered.replace(port, '$1') === requested.replace(port, '$1');
  }
  return registered === requested;
}
const secret = () => randomBytes(32).toString('base64url');
const invalidGrant = () => new OAuthError('invalid_grant', '授权已失效，请重新连接');

/** 浏览器授权、兑换与刷新都使用持久事务；原始凭据只交付给发起连接的客户端。 */
export class OAuthService {
  readonly resource: string;
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
    readonly issuer: string,
  ) {
    this.resource = issuer + '/mcp';
  }

  async register(input: unknown) {
    const request = parse(registration, input);
    request.redirect_uris.forEach(redirect);
    const client = {
      id: randomUUID(),
      name: request.client_name,
      redirect_uris: request.redirect_uris,
      created_at: Date.now(),
    };
    await this.store.insert('oauth_clients', client);
    return {
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirect_uris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_id_issued_at: Math.floor(client.created_at / 1000),
    };
  }

  async begin(input: unknown) {
    const request = parse(authorization, input);
    const client = await this.store.get('oauth_clients', request.client_id);
    if (!client) throw new OAuthError('invalid_client', '客户端未注册');
    if (!client.redirect_uris.some((uri) => matchesRedirect(uri, request.redirect_uri)))
      throw new OAuthError('invalid_redirect_uri', '回调地址与客户端注册信息不符');
    if (request.resource !== this.resource)
      throw new OAuthError('invalid_target', '授权目标不是当前 Hub');
    const id = secret();
    await this.store.insert('oauth_requests', {
      id,
      client_id: client.id,
      redirect_uri: request.redirect_uri,
      resource: request.resource,
      scope: scopeOf(request.scope),
      challenge: request.code_challenge,
      state: request.state,
      expires_at: Date.now() + 600_000,
      status: 'pending',
      code: null,
      user_id: null,
      grant_id: null,
    });
    return id;
  }

  async describe(id: string) {
    const request = await this.pending(id);
    const client = await this.store.get('oauth_clients', request.client_id);
    if (!client) throw invalidGrant();
    return {
      client_name: client.name,
      redirect_origin: new URL(request.redirect_uri).origin,
      resource: request.resource,
      scope: request.scope,
      expires_at: request.expires_at,
    };
  }
  private async pending(id: string) {
    const request = await this.store.get('oauth_requests', id);
    if (!request || request.status !== 'pending' || request.expires_at <= Date.now())
      throw invalidGrant();
    return request;
  }

  async decide(principal: Principal, id: string, allow: boolean, contribute: boolean) {
    return this.store.tx(async () => {
      await this.identity.activeUser(principal.id);
      const request = await this.pending(id);
      if (contribute && request.scope !== 'hub:contribute')
        throw new OAuthError('invalid_scope', '不能超出客户端请求的权限');
      const code = allow ? secret() : null;
      await this.store.put('oauth_requests', {
        ...request,
        status: allow ? 'approved' : 'denied',
        scope: contribute ? 'hub:contribute' : 'hub:read',
        code: code ? sha256(code) : null,
        user_id: principal.id,
        expires_at: Date.now() + 60_000,
      });
      const url = new URL(request.redirect_uri);
      url.searchParams.set(code ? 'code' : 'error', code ?? 'access_denied');
      if (request.state) url.searchParams.set('state', request.state);
      url.searchParams.set('iss', this.issuer);
      await this.store.audit(
        principal.id,
        allow ? 'identity.connection_approved' : 'identity.connection_denied',
        request.client_id,
      );
      return { redirect_uri: url.href };
    });
  }

  async exchange(input: unknown) {
    const request = parse(tokenRequest, input);
    if (request.resource !== this.resource)
      throw new OAuthError('invalid_target', '授权目标不是当前 Hub');
    // 重放撤销必须提交事务后再返回错误，不能随异常回滚。
    const result = await this.store.tx(async () => {
      if (request.grant_type === 'authorization_code') {
        if (!request.code || !request.code_verifier || !request.redirect_uri) throw invalidGrant();
        const saved = await this.store.find('oauth_requests', 'code', sha256(request.code));
        if (
          !saved ||
          saved.client_id !== request.client_id ||
          saved.redirect_uri !== request.redirect_uri ||
          saved.challenge !== createHash('sha256').update(request.code_verifier).digest('base64url')
        )
          throw invalidGrant();
        if (saved.status === 'consumed' && saved.grant_id) {
          await this.revokeGrant(saved.grant_id);
          await this.store.audit(saved.user_id!, 'identity.connection_replay', saved.grant_id);
          return null;
        }
        if (saved.status !== 'approved' || !saved.user_id || saved.expires_at <= Date.now())
          throw invalidGrant();
        await this.activeGrantUser(saved.user_id);
        const client = await this.store.get('oauth_clients', saved.client_id);
        if (!client) throw invalidGrant();
        const grant: OAuthGrantRecord = {
          id: randomUUID(),
          user_id: saved.user_id,
          client_id: saved.client_id,
          name: client.name,
          scope: saved.scope,
          resource: this.resource,
          created_at: Date.now(),
          last_used_at: null,
          revoked_at: null,
        };
        await this.store.insert('oauth_grants', grant);
        await this.store.put('oauth_requests', {
          ...saved,
          status: 'consumed',
          grant_id: grant.id,
        });
        return this.issue(grant);
      }
      if (!request.refresh_token) throw invalidGrant();
      const credential = await this.store.get('oauth_credentials', sha256(request.refresh_token));
      if (!credential || credential.kind !== 'refresh') throw invalidGrant();
      const grant = await this.store.get('oauth_grants', credential.grant_id);
      if (!grant || grant.client_id !== request.client_id || grant.revoked_at !== null)
        throw invalidGrant();
      if (credential.consumed_at !== null) {
        await this.revokeGrant(grant.id);
        await this.store.audit(grant.user_id, 'identity.connection_replay', grant.id);
        return null;
      }
      if (credential.expires_at <= Date.now()) throw invalidGrant();
      await this.activeGrantUser(grant.user_id);
      const scope = request.scope ? scopeOf(request.scope) : grant.scope;
      if (scope === 'hub:contribute' && grant.scope !== 'hub:contribute')
        throw new OAuthError('invalid_scope', '追加权限需要重新授权');
      await this.store.put('oauth_credentials', { ...credential, consumed_at: Date.now() });
      await this.store.put('oauth_grants', { ...grant, scope });
      return this.issue({ ...grant, scope });
    });
    if (!result) throw invalidGrant();
    return result;
  }
  private async activeGrantUser(userId: string) {
    try {
      await this.identity.activeUser(userId);
    } catch (error) {
      if (error instanceof HubError && error.status === 401) throw invalidGrant();
      throw error;
    }
  }
  private async issue(grant: OAuthGrantRecord) {
    const access = secret(),
      refresh = secret();
    for (const [token, kind, lifetime] of [
      [access, 'access', 3600_000],
      [refresh, 'refresh', 30 * 86400_000],
    ] as const)
      await this.store.insert('oauth_credentials', {
        id: sha256(token),
        grant_id: grant.id,
        kind,
        expires_at: Date.now() + lifetime,
        consumed_at: null,
      });
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: refresh,
      scope: grant.scope === 'hub:contribute' ? 'hub:read hub:contribute' : 'hub:read',
    };
  }
  async authenticate(token: string) {
    return this.store.tx(async () => {
      const credential = await this.store.get('oauth_credentials', sha256(token));
      if (!credential || credential.kind !== 'access' || credential.expires_at <= Date.now())
        return null;
      const grant = await this.store.get('oauth_grants', credential.grant_id);
      if (!grant || grant.revoked_at !== null || grant.resource !== this.resource) return null;
      await this.identity.activeUser(grant.user_id);
      if (!grant.last_used_at || Date.now() - grant.last_used_at > 60_000)
        await this.store.put('oauth_grants', { ...grant, last_used_at: Date.now() });
      return grant;
    });
  }
  async list(userId: string) {
    return (await this.store.where('oauth_grants', 'user_id', userId)).map(
      ({ id, name, scope, created_at, last_used_at, revoked_at }) => ({
        id,
        name,
        scope,
        created_at,
        last_used_at,
        revoked_at,
      }),
    );
  }
  private async revokeGrant(id: string) {
    const grant = await this.store.get('oauth_grants', id);
    if (grant && grant.revoked_at === null)
      await this.store.put('oauth_grants', { ...grant, revoked_at: Date.now() });
  }
  async disconnect(userId: string, id: string) {
    await this.store.tx(async () => {
      await this.identity.activeUser(userId);
      const grant = await this.store.get('oauth_grants', id);
      if (!grant || grant.user_id !== userId) notFound();
      await this.revokeGrant(id);
      await this.store.audit(userId, 'identity.connection_revoked', id);
    });
  }
  async revoke(input: unknown) {
    const request = parse(z.object({ token: value, client_id: value }), input);
    await this.store.tx(async () => {
      const credential = await this.store.get('oauth_credentials', sha256(request.token));
      if (!credential) return;
      const grant = await this.store.get('oauth_grants', credential.grant_id);
      if (grant?.client_id === request.client_id && grant.revoked_at === null) {
        await this.revokeGrant(grant.id);
        await this.store.audit(grant.user_id, 'identity.connection_revoked', grant.id);
      }
    });
  }
}
