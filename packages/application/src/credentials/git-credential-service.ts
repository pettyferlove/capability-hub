import type { RecordStore } from '../ports/index.js';
import type { Principal } from '@capability-hub/domain/identity';
import type { GitCredentialRecord } from '@capability-hub/domain/models';
import { fail, notFound } from '@capability-hub/domain/errors';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CredentialCipher, SshKeyInspector, ResolvedCredential } from '../ports/index.js';

const base = z
  .object({
    name: z.string().trim().min(1).max(80),
    kind: z.enum(['token', 'ssh']),
    host: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(253)
      .refine((host) => {
        try {
          const url = new URL('https://' + host);
          return (
            url.hostname === host &&
            url.host === host &&
            url.pathname === '/' &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
          );
        } catch {
          return false;
        }
      }, 'Git 主机必须为规范域名或 IP 地址'),
    username: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_.@-]+$/)
      .default('git'),
    auth_method: z.enum(['basic', 'bearer']).default('basic'),
    secret: z.string().min(8).max(32768),
    passphrase: z.string().max(1024).default(''),
    host_key: z.string().trim().max(8192).default(''),
    expires_at: z.iso.datetime().nullable().default(null),
  })
  .strict();

/**
 * 维护用户自备的 Git 凭据：加密落库、按主机与传输方式校验、同步时解密使用。
 *
 * 明文只在内存中停留：落库前由 {@link CredentialCipher} 以记录快照作为上下文封装，
 * 只有密文与指纹入库。每次成功写入都递增 `revision`，使旧 `etag` 与来源侧固化的
 * 凭据版本失效。所有方法都不走幂等键，写操作以 `revision` 做乐观并发控制。
 */
export class GitCredentialService {
  constructor(
    private readonly store: RecordStore,
    private readonly gitHosts: readonly string[],
    private readonly cipher: CredentialCipher,
    private readonly sshKeys: SshKeyInspector,
  ) {}
  private async describe(row: GitCredentialRecord) {
    return {
      id: row.id,
      revision: row.revision,
      user_id: row.user_id,
      name: row.name,
      host: row.host,
      kind: row.kind,
      username: row.username,
      auth_method: row.auth_method,
      host_key: row.host_key,
      fingerprint: row.fingerprint,
      host_fingerprint: row.host_fingerprint,
      expires_at: row.expires_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      revoked_at: row.revoked_at,
      usage_count: (await this.store.all('sources')).filter(
        (s) => s.kind === 'git' && s.credential_ref === row.id,
      ).length,
    };
  }
  /**
   * 列出当前身份名下的凭据视图，按创建时间倒序。
   *
   * 只按 `user_id` 过滤，不含密文；已撤销/已过期的记录仍会列出，供前端展示状态。
   * 每行都会全量扫描 `sources` 统计引用数，成本与「凭据数 × 来源数」成正比。
   */
  async list(principal: Principal) {
    return (
      await Promise.all(
        (await this.store.where('git_credentials', 'user_id', principal.id)).map(
          async (r) => await this.describe(r),
        ),
      )
    ).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  /**
   * 取可用凭据记录；不存在、已撤销、已过期或所属账号已停用时
   * 422/`CREDENTIAL_UNAVAILABLE`。
   *
   * 供后台流程（同步、来源登记）调用，因此不接受 `Principal`，也不做所有权判断：
   * 面向用户的入口必须自行确认凭据归属，见 {@link GitCredentialService.select}。
   * 过期判定使用进程内时钟（`Date.parse(expires_at) <= Date.now()`）。
   */
  async active(id: string) {
    const r = await this.store.get('git_credentials', id);
    if (
      !r ||
      r.revoked_at ||
      !(await this.store.get('users', r.user_id))?.active ||
      (r.expires_at && Date.parse(r.expires_at) <= Date.now())
    )
      fail(422, 'CREDENTIAL_UNAVAILABLE', 'Git 凭据已撤销、过期或所属账号已停用，请在个人中心维护');
    return r;
  }
  /**
   * 校验凭据可用于给定仓库地址，只做检查不返回密钥材料。
   *
   * 传 `existing`（来源当前已绑定的凭据 id）时允许继续沿用他人共享的凭据，否则只能选
   * 自己的，违反 403/`CREDENTIAL_FORBIDDEN`。主机或传输方式不匹配
   * （`ssh` 对 `ssh`，其余对 `https`）时 422/`CREDENTIAL_MISMATCH`；可用性同
   * {@link GitCredentialService.active}。
   */
  async select(
    principal: Principal,
    id: string,
    url: {
      host: string;
      transport: string;
    },
    existing?: string,
  ) {
    const r = await this.active(id);
    if (r.user_id !== principal.id && id !== existing)
      fail(403, 'CREDENTIAL_FORBIDDEN', '只能选择自己的 Git 凭据');
    if (r.host !== url.host || (r.kind === 'ssh' ? 'ssh' : 'https') !== url.transport)
      fail(422, 'CREDENTIAL_MISMATCH', '凭据的 Git 域名或认证方式与仓库地址不匹配');
  }
  /**
   * 读取可用凭据的当前 `revision`，供来源记录固化并在轮换后判定是否需重拉。
   *
   * 不可用凭据同样 422/`CREDENTIAL_UNAVAILABLE`，因此该调用同时充当同步前的可用性检查。
   */
  async currentRevision(id: string): Promise<number> {
    return (await this.active(id)).revision;
  }
  /**
   * 解密凭据，返回可交给 Git 传输层的凭据材料。
   *
   * 解密前重新校验可用性与主机/传输方式匹配（422/`CREDENTIAL_MISMATCH`），密文缺失时
   * 422/`CREDENTIAL_UNAVAILABLE`。解密失败（典型为实例密钥不匹配）视为服务端问题：
   * 500/`CREDENTIAL_DECRYPTION`，需用户重新录入。返回的 `revision`
   * 便于调用方把材料与来源侧固化的凭据版本对应起来。
   */
  async resolve(id: string, host: string, transport: string): Promise<ResolvedCredential> {
    const r = await this.active(id);
    if (!r.encrypted) fail(422, 'CREDENTIAL_UNAVAILABLE', 'Git 凭据已撤销');
    if (r.host !== host || (r.kind === 'ssh' ? 'ssh' : 'https') !== transport)
      fail(422, 'CREDENTIAL_MISMATCH', 'Git 凭据与仓库不匹配');
    try {
      const secret = this.cipher.open(r, r.encrypted);
      return {
        kind: r.kind,
        username: r.username,
        auth_method: r.auth_method,
        host_key: r.host_key,
        revision: r.revision,
        ...secret,
      };
    } catch {
      fail(500, 'CREDENTIAL_DECRYPTION', '无法解密 Git 凭据，请检查实例密钥或重新维护凭据');
    }
  }
  /**
   * 新建或轮换凭据，返回不含密文的视图。
   *
   * 前置校验（事务外）：域名必须在管理员允许列表（422/`GIT_HOST_DENIED`）、到期时间须晚于
   * 当前时间（422/`CREDENTIAL_EXPIRY`）；更新时凭据须属于调用方（否则 404），`etag` 须等于
   * `"<revision>"`（412/`REVISION_CONFLICT`），且已撤销或要改主机/认证方式时
   * 422/`CREDENTIAL_IMMUTABLE`。Token 与 SSH 字段互斥，格式约束分别以
   * 422/`CREDENTIAL_FORMAT`、`SSH_KEY_INVALID`、`SSH_HOST_KEY` 拒绝。
   *
   * SSH 私钥与主机公钥的解析由 {@link SshKeyInspector} 在事务外完成（可能较慢）；写入
   * `git_credentials` 与审计 `credential.rotated`/`credential.created` 在同一事务内，并在
   * 进入事务后重新检查账号启用状态（401/`UNAUTHENTICATED`）、`revision` 与撤销状态。
   * @param body - 未信任的请求体，按严格 schema 解析，未知字段直接拒绝
   * @param id - 省略时新建；提供时轮换该凭据，记录不存在或不属于调用方均为 404
   * @param etag - 更新时期望的 `revision`，形如 `"3"`
   */
  async save(principal: Principal, body: unknown, id?: string, etag?: string) {
    const b = base.parse(body);
    if (!this.gitHosts.includes(b.host)) fail(422, 'GIT_HOST_DENIED', 'Git 域名不在管理员允许列表');
    if (b.expires_at && Date.parse(b.expires_at) <= Date.now())
      fail(422, 'CREDENTIAL_EXPIRY', '到期时间必须晚于当前时间');
    const previous = id ? await this.store.get('git_credentials', id) : undefined;
    if (id && (!previous || previous.user_id !== principal.id)) notFound();
    if (previous && etag !== `"${previous.revision}"`)
      fail(412, 'REVISION_CONFLICT', '凭据已变化，请刷新后重新操作');
    if (previous && (previous.revoked_at || previous.host !== b.host || previous.kind !== b.kind))
      fail(422, 'CREDENTIAL_IMMUTABLE', '已撤销凭据不能更新；更换域名或认证方式请新建凭据');
    let fingerprint: string | null = null,
      hostFingerprint: string | null = null;
    if (b.kind === 'token') {
      if (/[\p{Cc}\s]/u.test(b.secret) || b.secret.length > 4096)
        fail(422, 'CREDENTIAL_FORMAT', 'Token 不得包含空白或控制字符');
      if (b.passphrase || b.host_key) fail(422, 'CREDENTIAL_FORMAT', 'Token 凭据不接受 SSH 字段');
    } else {
      if (!/^(?!-)[a-zA-Z0-9_.-]+$/.test(b.username))
        fail(422, 'CREDENTIAL_FORMAT', 'SSH 用户名无效');
      if (
        !/^-----BEGIN (?:OPENSSH|RSA|EC|PRIVATE|ENCRYPTED)[A-Z ]*PRIVATE KEY-----/.test(b.secret) &&
        !/^-----BEGIN (?:PRIVATE|ENCRYPTED PRIVATE) KEY-----/.test(b.secret)
      )
        fail(422, 'SSH_KEY_INVALID', '请提供完整的 OpenSSH 或 PEM 私钥');
      if (
        !/^(?:ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(?:256|384|521)) [A-Za-z0-9+/]+={0,2}$/.test(
          b.host_key,
        )
      )
        fail(
          422,
          'SSH_HOST_KEY',
          '请提供 Git 服务的主机公钥（算法与 Base64），用于严格验证服务器身份',
        );
      const inspected = await this.sshKeys.inspect({
        privateKey: b.secret,
        passphrase: b.passphrase,
        hostKey: b.host_key,
      });
      fingerprint = inspected.fingerprint;
      hostFingerprint = inspected.hostFingerprint;
    }

    return await this.store.tx(async () => {
      if (!(await this.store.get('users', principal.id))?.active)
        fail(401, 'UNAUTHENTICATED', '账号已停用');
      if (previous) {
        const current = (await this.store.get('git_credentials', previous.id))!;
        if (etag !== `"${current.revision}"`)
          fail(412, 'REVISION_CONFLICT', '凭据已变化，请刷新后重新操作');
        if (current.revoked_at) fail(409, 'CREDENTIAL_UNAVAILABLE', '凭据已撤销');
      }
      const draft: Omit<GitCredentialRecord, 'encrypted'> = {
        id: previous?.id ?? randomUUID(),
        user_id: principal.id,
        name: b.name,
        host: b.host,
        kind: b.kind,
        username: b.username,
        auth_method: b.auth_method,
        host_key: b.host_key,
        fingerprint,
        host_fingerprint: hostFingerprint,
        expires_at: b.expires_at,
        created_at: previous?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
        revoked_at: null,
        revision: (previous?.revision ?? 0) + 1,
      };
      const row: GitCredentialRecord = {
        ...draft,
        encrypted: this.cipher.seal(draft, { secret: b.secret, passphrase: b.passphrase }),
      };
      if (previous) await this.store.put('git_credentials', row);
      else await this.store.insert('git_credentials', row);
      await this.store.audit(
        principal.id,
        previous ? 'credential.rotated' : 'credential.created',
        row.id,
      );
      return await this.describe(row);
    });
  }
  /**
   * 撤销凭据：清空密文并递增 `revision`，使既有 `etag` 与来源侧固化的凭据版本失效。
   *
   * 与状态写入同事务，另需账号仍启用（401/`UNAUTHENTICATED`）、凭据属于调用方（否则 404）、
   * `etag` 匹配（412/`REVISION_CONFLICT`）。撤销不可逆：之后既不能更新该凭据，引用它的
   * 来源同步也会因解密入口判定不可用而失败。审计 `credential.revoked`。
   */
  async revoke(principal: Principal, id: string, etag: string | undefined) {
    return await this.store.tx(async () => {
      if (!(await this.store.get('users', principal.id))?.active)
        fail(401, 'UNAUTHENTICATED', '账号已停用');
      const r = await this.store.get('git_credentials', id);
      if (!r || r.user_id !== principal.id) notFound();
      if (etag !== `"${r.revision}"`)
        fail(412, 'REVISION_CONFLICT', '凭据已变化，请刷新后重新操作');
      await this.store.put('git_credentials', {
        ...r,
        encrypted: null,
        revoked_at: new Date().toISOString(),
        revision: r.revision + 1,
      });
      await this.store.audit(principal.id, 'credential.revoked', id);
      return { ok: true };
    });
  }
}
