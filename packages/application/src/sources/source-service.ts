import type { Principal } from '@capability-hub/domain/identity';
import type { CreateSourceCommand, UpdateSourceCommand, SourceTarget } from './commands.js';
import type { GitSourceRecord, SourceRecord } from '@capability-hub/domain/models';
import { canonical, digest } from '@capability-hub/domain/canonical';
import { fail, notFound } from '@capability-hub/domain/errors';
import { collisionKey, sourcePath } from '@capability-hub/domain/paths';
import { has } from '@capability-hub/domain/rbac';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from '../catalog/asset-access-service.js';
import type { GitCredentialService } from '../credentials/git-credential-service.js';
import type { GitRepository } from '../ports/index.js';
import type { JobQueue } from '../jobs/job-queue.js';
import type { PublicationService } from '../publication/publication-service.js';
import type { IdempotencyService } from '../shared/idempotency-service.js';
import { matchRevision } from '../shared/revision.js';

/**
 * 管理 Git 来源的配置、目标绑定与同步触发。
 * 读入口统一经 {@link AssetAccessService.requireSourceManagement} 校验
 * `source:manage`（`team` + `source` 作用域），写入口按操作再单独收紧。
 */
export class SourceService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly assets: AssetAccessService,
    private readonly publications: PublicationService,
    private readonly idempotency: IdempotencyService,
    private readonly jobs: JobQueue,
    private readonly git: GitRepository,
    private readonly credentials: GitCredentialService,
  ) {}
  private get store() {
    return this.context.store;
  }
  private async getSourceRecord(id: string): Promise<GitSourceRecord> {
    const source = await this.store.get('sources', id);
    if (!source || source.kind !== 'git') notFound();
    return source.distribution_revoked_at ? { ...source, state: 'blocked' } : source;
  }
  /**
   * 返回来源详情与未退役目标（附资产 `slug`、`kind`）；要求 `source:manage`
   * （`team` = 来源所有者团队，`source` = 来源 id），非 Git 来源或不存在 → 404。
   */
  async get(principal: Principal, id: string) {
    return this.store.tx(async () => {
      const source = await this.getSourceRecord(id);
      this.assets.requireSourceManagement(principal, source);
      return {
        ...source,
        targets: await Promise.all(
          (await this.store.all('bindings'))
            .filter((b) => b.source_id === id && !b.retired_at)
            .map(async (b) => ({
              ...b,
              slug: (await this.assets.getAsset(b.asset_id)).slug,
              kind: (await this.assets.getAsset(b.asset_id)).kind,
            })),
        ),
      };
    });
  }
  /**
   * 列出主体在 `source:manage`（`team` + `source`）范围内可见的 Git 来源，
   * 逐条复用 {@link get} 拼装目标；不可见的来源直接跳过而非报错。
   */
  async list(principal: Principal) {
    return await Promise.all(
      (await this.store.all('sources'))
        .filter(
          (s) =>
            s.kind === 'git' &&
            has(principal, 'source:manage', { source: s.id, team: s.owner_group_id }),
        )
        .map(async (s) => await this.get(principal, s.id)),
    );
  }
  private async validateTargets(targets: SourceTarget[]) {
    const seen = new Set<string>();
    for (const t of targets) {
      await this.publications.validatePolicy(t);
      sourcePath(t.path, t.kind);
      const key = collisionKey(t.path);
      if (seen.has(key)) fail(422, 'DUPLICATE_PATH', '同一来源不允许重复目标路径');
      seen.add(key);
    }
    const enabled = targets.filter((t) => t.enabled !== false);
    for (let i = 0; i < enabled.length; i++)
      for (let j = i + 1; j < enabled.length; j++) {
        const a = collisionKey(enabled[i].path),
          b = collisionKey(enabled[j].path);
        if (a === '.' || b === '.' || a.startsWith(b + '/') || b.startsWith(a + '/'))
          fail(422, 'OVERLAPPING_PATH', '启用目标之间不能有父子路径重叠');
      }
  }
  private async validateCredential(
    principal: Principal,
    ref: string | undefined | null,
    destination?: {
      host: string;
      transport: string;
    },
    existing?: string | null,
  ) {
    if (!ref) return;
    if (destination)
      await this.credentials.select(principal, ref, destination, existing ?? undefined);
    else {
      const r = await this.credentials.active(ref);
      if (r.user_id !== principal.id && ref !== existing)
        fail(403, 'CREDENTIAL_FORBIDDEN', '只能选择自己的 Git 凭据');
    }
  }
  /**
   * 创建 Git 来源及其目标资产。调用前先做 Git/凭据/目标校验，随后在
   * {@link IdempotencyService} 的事务内重做校验并写入：`key` 为 Idempotency-Key
   * （缺失或超过 200 字符 → 400 `IDEMPOTENCY_REQUIRED`，同键异参 → 409
   * `IDEMPOTENCY_CONFLICT`），请求摘要取自整个命令体。需要 `source:create`
   * （`team` = 目标团队），身份在事务中被再次读取，过期主体 → 409
   * `AUTH_CONTEXT_CHANGED`。Git 校验会解析主机并比对允许列表（422 `GIT_URL`、
   * `GIT_HOST_DENIED`、`GIT_ADDRESS_DENIED`、`GIT_BRANCH`）；SSH 仓库缺
   * `credential_ref` → 422 `SSH_CREDENTIAL_REQUIRED`，凭据域名/方式不符 → 422
   * `CREDENTIAL_MISMATCH`，借用他人凭据 → 403 `CREDENTIAL_FORBIDDEN`。目标路径
   * 重复或启用目标父子重叠 → 422 `DUPLICATE_PATH`/`OVERLAPPING_PATH`，发布策略
   * 非法 → 422 `INVALID_POLICY`；团队无效 → 422 `INVALID_GROUP`，slug 已占用 →
   * 409 `SLUG_CONFLICT`。新来源为 `active`、`revision` 1、`generation` 0，5 分钟后
   * 首次轮询；写入审计 `source.created`。
   */
  async create(principal: Principal, body: CreateSourceCommand, key: string | undefined) {
    const b = body;
    this.context.identity.require(principal, 'source:create', { team: b.owner_group_id });
    await this.validateCredential(principal, b.credential_ref);
    await this.validateTargets(b.targets);
    await this.git.branch(b.branch);
    const repository = await this.git.validate(b.repository_url);
    await this.validateCredential(principal, b.credential_ref, repository);
    if (repository.transport === 'ssh' && !b.credential_ref)
      fail(422, 'SSH_CREDENTIAL_REQUIRED', 'SSH 仓库需要选择个人 SSH 凭据');
    return await this.idempotency.execute(
      principal,
      'sources',
      key,
      digest(canonical(b)),
      async () => {
        this.context.identity.require(principal, 'source:create', { team: b.owner_group_id });
        await this.validateCredential(principal, b.credential_ref, repository);
        await this.validateTargets(b.targets);
        if (!(await this.store.get('groups', b.owner_group_id))?.active)
          fail(422, 'INVALID_GROUP', '团队无效');
        for (const t of b.targets)
          if (await this.store.find('assets', 'slug', t.slug))
            fail(409, 'SLUG_CONFLICT', '资产名称已占用');
        const source = await this.store.insert('sources', {
          id: randomUUID(),
          kind: 'git',
          provider: b.provider,
          canonical_url: repository.url,
          repository_identity: repository.identity,
          branch: b.branch,
          credential_ref: b.credential_ref ?? null,
          owner_group_id: b.owner_group_id,
          state: 'active',
          revision: 1,
          generation: 0,
          next_poll_at: Date.now() + 300000,
          created_at: new Date().toISOString(),
        });
        for (const t of b.targets) await this.createTarget(source, t);
        await this.store.audit(principal.id, 'source.created', source.id);
        return await this.get(principal, source.id);
      },
    );
  }
  private async createTarget(source: SourceRecord, target: SourceTarget) {
    const a = await this.store.insert('assets', {
      id: randomUUID(),
      slug: target.slug,
      kind: target.kind,
      requires_api_key: false,
      source_id: source.id,
      owner_group_id: source.owner_group_id,
      lifecycle: 'active',
      current_release_id: null,
      revision: 1,
      created_at: new Date().toISOString(),
    });
    return await this.store.insert('bindings', {
      id: randomUUID(),
      source_id: source.id,
      asset_id: a.id,
      path: target.path,
      enabled: target.enabled !== false,
      retired_at: null,
      category: target.category,
      scenario_ids: target.scenario_ids,
      distribution: target.distribution,
      applies_to: target.applies_to ?? {},
      created_at: new Date().toISOString(),
    });
  }
  /**
   * 部分更新来源配置；`etag` 必须精确等于来源当前 revision 的 `"<n>"`，缺失 →
   * 428 `IF_MATCH_REQUIRED`，不符 → 412 `REVISION_CONFLICT`（事务外与事务内各校验
   * 一次）。权限为 `source:manage`（`team` + `source`）。Git 校验、凭据与目标校验先
   * 在事务外试跑（避免长校验占用写锁），在自有 `store.tx` 内重取记录、重读主体后
   * 再写，并自增 revision、把 `next_poll_at` 提前到当前时刻。`targets` 必须覆盖全部
   * 现有目标（否则 422 `TARGET_SET_INCOMPLETE`），已有目标的 `slug`/`kind`/`asset_id`
   * 不可改（422 `BINDING_IMMUTABLE`），新增目标不得认领已有资产（409
   * `SLUG_CONFLICT`），非 `paused` 状态至少保留一个启用目标（422
   * `ACTIVE_TARGET_REQUIRED`），凭据改为 SSH 未提供 → 422 `SSH_CREDENTIAL_REQUIRED`。
   * 旧目标的待审发布请求会失效（原因 `SOURCE_CONFIG_CHANGED`），并写审计
   * `source.updated`。
   */
  async patch(p: Principal, id: string, body: UpdateSourceCommand, etag: string | undefined) {
    const b = body;
    const before = await this.get(p, id);
    matchRevision(before, etag);
    if (b.branch) await this.git.branch(b.branch);
    await this.validateCredential(p, b.credential_ref, undefined, before.credential_ref);
    const destination =
      'credential_ref' in b ? await this.git.validate(before.canonical_url) : undefined;
    if (destination) {
      await this.validateCredential(p, b.credential_ref, destination, before.credential_ref);
      if (destination.transport === 'ssh' && !b.credential_ref)
        fail(422, 'SSH_CREDENTIAL_REQUIRED', 'SSH 来源必须保留有效 SSH 凭据');
    }
    if (b.targets) await this.validateTargets(b.targets);
    return await this.store.tx(async () => {
      const source = await this.getSourceRecord(id);
      this.assets.requireSourceManagement(await this.context.identity.principal(p.id), source);
      matchRevision(source, etag);
      if (b.state && source.state === 'blocked')
        fail(409, 'SOURCE_BLOCKED', '已封锁的来源不能切换同步状态');
      if (destination)
        await this.validateCredential(p, b.credential_ref, destination, source.credential_ref);
      if (b.targets) await this.validateTargets(b.targets);
      const old = (await this.store.all('bindings')).filter(
        (t) => t.source_id === id && !t.retired_at,
      );
      if (b.targets) {
        const ids = b.targets.map((t) => t.binding_id).filter(Boolean);
        if (
          new Set(ids).size !== ids.length ||
          old.some((t) => !ids.includes(t.id)) ||
          ids.some((i) => !old.some((t) => t.id === i))
        )
          fail(422, 'TARGET_SET_INCOMPLETE', '必须提交完整现有目标；停用请明确设置 enabled=false');
        for (const t of b.targets) {
          if (t.binding_id) {
            const existing = old.find((x) => x.id === t.binding_id)!;
            const a = await this.assets.getAsset(existing.asset_id);
            if (t.slug !== a.slug || t.kind !== a.kind || (t.asset_id && t.asset_id !== a.id))
              fail(422, 'BINDING_IMMUTABLE', '目标身份不能通过普通编辑改变');
          } else if (t.asset_id || (await this.store.find('assets', 'slug', t.slug)))
            fail(409, 'SLUG_CONFLICT', '新增目标不可认领已有资产');
        }
      }
      const targets = b.targets ?? before.targets;
      if ((b.state ?? source.state) !== 'paused' && !targets.some((t) => t.enabled !== false))
        fail(422, 'ACTIVE_TARGET_REQUIRED', '活动来源至少需要一个启用目标');
      // 先释放路径唯一约束占用，再在同一事务中交换目标路径。
      if (b.targets)
        for (const t of old)
          await this.store.put('bindings', { ...t, path: 'reserved-' + randomUUID() });
      if (b.targets)
        for (const t of b.targets) {
          if (t.binding_id) {
            const prior = old.find((x) => x.id === t.binding_id)!;
            await this.store.put('bindings', {
              ...prior,
              path: t.path,
              enabled: t.enabled !== false,
              category: t.category,
              scenario_ids: t.scenario_ids,
              distribution: t.distribution,
              applies_to: t.applies_to ?? {},
            });
          } else await this.createTarget(source, t);
        }
      const updated = await this.store.put('sources', {
        ...source,
        ...(b.branch ? { branch: b.branch } : {}),
        ...('credential_ref' in b ? { credential_ref: b.credential_ref } : {}),
        ...(b.state ? { state: b.state } : {}),
        revision: source.revision + 1,
        next_poll_at: Date.now(),
      });
      for (const t of old)
        await this.publications.invalidatePending(t.asset_id, 'SOURCE_CONFIG_CHANGED');
      await this.store.audit(p.id, 'source.updated', id, '', { revision: updated.revision });
      return await this.get(p, id);
    });
  }
  /**
   * 撤销来源分发：自有事务内重读主体后要求 `source:share`（`team` = 所有者团队，
   * `source` = 来源 id），把来源置为 `blocked`、写入 `distribution_revoked_at` 并
   * 自增 revision；`etag` 缺失/不符 → 428 `IF_MATCH_REQUIRED`/412
   * `REVISION_CONFLICT`，来源不存在 → 404。该来源名下所有资产的待审发布请求会
   * 失效（原因 `SOURCE_REVOKED`），`reason`（1–2000 字符，去首尾空白，严格对象，
   * 多余字段报错）作为审计备注写入 `source.distribution_revoked`；入参非法时直接抛
   * `ZodError`，由 HTTP 层映射为 422 `VALIDATION_ERROR`。
   */
  async revokeDistribution(
    principal: Principal,
    id: string,
    input: unknown,
    etag: string | undefined,
  ) {
    const value = z
      .object({ reason: z.string().trim().min(1).max(2000) })
      .strict()
      .parse(input);
    return await this.store.tx(async () => {
      const actor = await this.context.identity.principal(principal.id);
      const source = await this.store.get('sources', id);
      if (!source) notFound();
      this.context.identity.require(actor, 'source:share', {
        source: source.id,
        team: source.owner_group_id,
      });
      matchRevision(source, etag);
      await this.store.put('sources', {
        ...source,
        state: 'blocked',
        distribution_revoked_at: new Date().toISOString(),
        revision: source.revision + 1,
      });
      for (const asset of await this.store.where('assets', 'source_id', source.id))
        await this.publications.invalidatePending(asset.id, 'SOURCE_REVOKED');
      await this.store.audit(actor.id, 'source.distribution_revoked', source.id, value.reason);
      return { ok: true };
    });
  }

  /**
   * 返回来源下某次同步作业的对外视图（状态、尝试次数、时间、错误码与结果）；
   * 先经 {@link get} 校验来源可见性（`source:manage`）。作业不存在、类型不是
   * `source_sync` 或不属于该来源一律 404，因此不可用于跨来源探测作业。
   */
  async getSyncJob(principal: Principal, sourceId: string, jobId: string) {
    await this.get(principal, sourceId);
    const job = await this.store.get('jobs', jobId);
    if (!job || job.kind !== 'source_sync' || job.aggregate_id !== sourceId) notFound();
    return {
      id: job.id,
      state: job.state,
      attempt: job.attempt,
      created_at: job.created_at,
      finished_at: job.finished_at,
      last_error_code: job.last_error_code,
      error_message: job.error_message,
      result: job.result,
    };
  }

  /**
   * 触发一次来源同步，返回 `{ job_id, source_revision }`；实际拉取由
   * SourceSyncService.process 在作业租约下完成。权限同 {@link get}（`source:manage`），
   * 来源暂停/封锁 → 409 `SOURCE_NOT_ACTIVE`，无启用目标 → 409 `NO_TARGETS`。整体经
   * {@link IdempotencyService} 包裹（route `source-sync/<id>`，摘要含 source id 与
   * revision，缺 key → 400 `IDEMPOTENCY_REQUIRED`），事务内复核 revision（变化 →
   * 409 `SOURCE_CONFIG_CHANGED`）；当前修订已有可用的 `queued`/`running` 作业时
   * 直接复用其 id（单飞，不重复入队），否则入队并写审计 `source.sync_requested`。
   */
  async sync(principal: Principal, id: string, key: string | undefined, scheduled = false) {
    const source = await this.get(principal, id);
    if (source.state === 'paused' || source.state === 'blocked')
      fail(409, 'SOURCE_NOT_ACTIVE', '来源已暂停或封锁');
    const targets = source.targets.filter((t) => t.enabled);
    if (!targets.length) fail(409, 'NO_TARGETS', '没有启用目标');
    return await this.idempotency.execute(
      principal,
      'source-sync/' + id,
      key,
      digest(
        canonical({
          source_id: id,
          revision: source.revision,
          ...(scheduled ? { scheduled } : {}),
        }),
      ),
      async () => {
        const current = await this.get(principal, id);
        if (current.revision !== source.revision)
          fail(409, 'SOURCE_CONFIG_CHANGED', '来源配置已变化');
        if (current.state === 'paused' || current.state === 'blocked')
          fail(409, 'SOURCE_NOT_ACTIVE', '来源已暂停或封锁');
        if (!current.targets.some((target) => target.enabled))
          fail(409, 'NO_TARGETS', '没有启用目标');
        const active = (await this.store.all('jobs')).find(
          (j) =>
            j.kind === 'source_sync' &&
            j.aggregate_id === id &&
            j.input.source_revision === current.revision &&
            !j.cancel_requested &&
            ['running', 'queued'].includes(j.state),
        );
        if (active) return { job_id: active.id, source_revision: source.revision };
        const job = await this.jobs.enqueue('source_sync', id, {
          requested_by: principal.id,
          source_revision: source.revision,
          ...(scheduled ? { scheduled } : {}),
        });
        await this.store.audit(scheduled ? 'system' : principal.id, 'source.sync_requested', id);
        return { job_id: job.id, source_revision: source.revision };
      },
    );
  }
}
