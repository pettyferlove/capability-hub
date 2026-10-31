import { filterAsync } from '@capability-hub/domain/async';
import { contentScanRuleset } from '@capability-hub/domain/content';
import type { Principal } from '@capability-hub/domain/identity';
import type { ReceiveIntakeCommand } from './commands.js';
import { compareVersionLabels } from '@capability-hub/domain/version-labels';
import type { AssetRecord } from '@capability-hub/domain/models';
import { canonical, digest, sha256 } from '@capability-hub/domain/canonical';
import { fail, notFound } from '@capability-hub/domain/errors';
import { randomUUID } from 'node:crypto';
import type { AssetAccessService } from '../catalog/asset-access-service.js';
import type { JobQueue } from '../jobs/job-queue.js';
import type { ApplicationContext } from '../shared/application-context.js';
import type { IdempotencyService } from '../shared/idempotency-service.js';
import type { IntakeQueryService } from './intake-query-service.js';
const now = () => new Date().toISOString();
/** 接收上传、重试和重新扫描命令；幂等记录与作业创建同时提交。 */
export class IntakeService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly assets: AssetAccessService,
    private readonly jobs: JobQueue,
    private readonly idempotency: IdempotencyService,
    private readonly queries: IntakeQueryService,
  ) {}
  async receive(
    principal: Principal,
    bytes: Buffer,
    filename: string,
    body: ReceiveIntakeCommand,
    key: string | undefined,
  ) {
    const metadata = body;
    if (!bytes.length || bytes.length > 20 * 1024 * 1024)
      fail(413, 'UPLOAD_SIZE', '上传文件必须非空且不超过 20 MiB');
    const kind =
      metadata.target === 'new'
        ? metadata.kind
        : (await this.assets.getAsset(metadata.asset_id)).kind;
    if (kind !== 'skill' && metadata.requires_api_key !== undefined)
      fail(422, 'NOT_SKILL', '仅 Skill 支持 API Key 需求声明');
    if (
      (kind === 'skill' && !filename.toLowerCase().endsWith('.zip')) ||
      (kind === 'mcp' && filename !== 'server.json')
    )
      fail(422, 'UPLOAD_TYPE', 'Skill 需要 ZIP，MCP 需要 server.json');
    if (metadata.target === 'new')
      this.context.identity.require(principal, 'asset:create', { team: metadata.owner_group_id });
    else this.assets.requireMaintenance(principal, await this.assets.getAsset(metadata.asset_id));
    if (metadata.target === 'existing') {
      const asset = await this.assets.getAsset(metadata.asset_id);
      const source = await this.context.store.get('sources', asset.source_id);
      if (source?.kind !== 'upload')
        fail(409, 'UPLOAD_SOURCE_REQUIRED', 'Git 资产请从登记来源同步新版本');
    }
    const payload_ref = await this.context.blobs.put(bytes);
    return await this.idempotency.execute(
      principal,
      'intakes',
      key,
      digest(canonical(metadata) + sha256(bytes)),
      async () => {
        let asset: AssetRecord;
        if (metadata.target === 'new') {
          if (!(await this.context.store.get('groups', metadata.owner_group_id))?.active)
            fail(422, 'INVALID_GROUP', '维护团队无效');
          if (await this.context.store.find('assets', 'slug', metadata.slug))
            fail(409, 'SLUG_CONFLICT', '名称已占用');
          const source = await this.context.store.insert('sources', {
            id: randomUUID(),
            kind: 'upload',
            owner_group_id: metadata.owner_group_id,
            state: 'active',
            revision: 1,
            generation: 0,
            created_at: now(),
          });
          asset = await this.context.store.insert('assets', {
            id: randomUUID(),
            slug: metadata.slug,
            kind,
            requires_api_key: metadata.requires_api_key === true,
            source_id: source.id,
            owner_group_id: metadata.owner_group_id,
            lifecycle: 'active',
            current_release_id: null,
            revision: 1,
            created_at: now(),
          });
        } else {
          asset = await this.assets.getAsset(metadata.asset_id);
          this.assets.requireMaintenance(principal, asset);
        }
        const source = await this.context.store.get('sources', asset.source_id);
        if (source?.kind !== 'upload')
          fail(409, 'UPLOAD_SOURCE_REQUIRED', 'Git 资产请从登记来源同步新版本');
        if (asset.lifecycle === 'blocked') fail(409, 'ASSET_BLOCKED', '封禁资产不能接收新版本');
        if (metadata.target === 'existing' && metadata.version_mode === 'automatic') {
          const plan = await this.queries.versionPlan(principal, asset.id);
          if (
            plan.occupied_versions.includes(metadata.version_label) ||
            (plan.latest_version &&
              compareVersionLabels(metadata.version_label, plan.latest_version) <= 0)
          )
            fail(409, 'VERSION_SUGGESTION_STALE', '版本建议已变化，请重新确认新版本号');
        }
        const intake = await this.context.store.insert('intakes', {
          id: randomUUID(),
          source_id: asset.source_id,
          asset_id: asset.id,
          requested_by: principal.id,
          version_label: metadata.version_label,
          payload_ref,
          filename,
          ...(metadata.keywords ? { keywords: metadata.keywords } : {}),
          ...(kind === 'skill'
            ? { requires_api_key: metadata.requires_api_key ?? asset.requires_api_key === true }
            : {}),
          state: 'received',
          phase: '接收完成，等待校验',
          progress: [{ step: 'received', started_at: now() }],
          source_revision: (await this.context.store.get('sources', asset.source_id))!.revision,
          created_at: now(),
        });
        await this.jobs.enqueue('intake', intake.id, {});
        await this.context.store.audit(principal.id, 'intake.received', intake.id);
        return { intake_id: intake.id, asset_id: asset.id };
      },
    );
  }
  async retry(principal: Principal, id: string) {
    return await this.context.store.tx(async () => {
      const actor = await this.context.identity.principal(principal.id);
      const intake = await this.context.store.get('intakes', id);
      if (!intake) notFound();
      const asset = await this.assets.getAsset(intake.asset_id);
      this.assets.requireMaintenance(actor, asset);
      if (intake.state !== 'failed' || !intake.retryable || intake.binding_id)
        fail(409, 'NOT_RETRYABLE', '此接收不能自动重试，请修正内容或来源');
      const source = await this.context.store.get('sources', intake.source_id);
      if (
        !source ||
        source.state === 'blocked' ||
        source.distribution_revoked_at ||
        asset.lifecycle === 'blocked'
      )
        fail(409, 'CONTENT_UNAVAILABLE', '资源或来源已封禁');
      await this.context.store.put('intakes', {
        ...intake,
        state: 'received',
        error_code: null,
        error_message: null,
        phase: '等待重新处理',
        progress: [{ step: 'received', started_at: now() }],
        finished_at: null,
      });
      const job = await this.jobs.enqueue('intake', intake.id, {});
      return { job_id: job.id, intake_id: intake.id };
    });
  }

  async rescan(principal: Principal, id: string, key: string | undefined) {
    const old = await this.context.store.get('intakes', id);
    if (!old) notFound();
    const a = await this.assets.getAsset(old.asset_id);
    this.assets.requireMaintenance(principal, a);
    if (!old.payload_ref && !old.version_id) fail(409, 'NO_CONTENT', '没有可重新扫描的固定内容');
    const source = (await this.context.store.get('sources', old.source_id))!;
    this.context.identity.require(principal, 'source:share', {
      source: source.id,
      team: source.owner_group_id,
    });
    return await this.idempotency.execute(
      principal,
      'rescan/' + id,
      key,
      digest(canonical({ intake_id: id, ruleset: contentScanRuleset })),
      async () => {
        const currentAsset = await this.assets.getAsset(old.asset_id);
        this.assets.requireMaintenance(principal, currentAsset);
        const currentSource = await this.context.store.get('sources', old.source_id);
        if (
          !currentSource ||
          currentSource.state === 'blocked' ||
          currentSource.distribution_revoked_at
        )
          fail(409, 'SOURCE_BLOCKED', '来源分发授权已撤销');
        this.context.identity.require(principal, 'source:share', {
          source: currentSource.id,
          team: currentSource.owner_group_id,
        });
        const inProgress = (await this.context.store.where('intakes', 'asset_id', a.id)).find(
          (i) =>
            i.rescan_of === old.id &&
            i.processing_ruleset === contentScanRuleset &&
            ['received', 'fetching', 'scanning'].includes(i.state),
        );
        if (inProgress)
          return {
            intake_id: inProgress.id,
            job_id: (await this.context.store.all('jobs')).find(
              (j) => j.aggregate_id === inProgress.id,
            )?.id,
          };
        for (const r of await filterAsync(
          await this.context.store.where('requests', 'asset_id', a.id),
          async (r) =>
            r.state === 'pending' &&
            (await this.context.store.get('scans', r.scan_run_id))?.ruleset_version !==
              contentScanRuleset,
        ))
          await this.context.store.put('requests', {
            ...r,
            state: 'stale',
            stale_reason: 'SCAN_RULESET_CHANGED',
            revision: r.revision + 1,
          });
        const intake = await this.context.store.insert('intakes', {
          ...old,
          id: randomUUID(),
          state: 'received',
          phase: '等待重新扫描固定快照',
          progress: [{ step: 'received', started_at: now() }],
          processing_ruleset: contentScanRuleset,
          rescan_of: old.id,
          historical: true,
          binding_id: null,
          source_revision: currentSource.revision,
          source_generation: null,
          version_id: null,
          scan_run_id: null,
          content_digest: null,
          error_code: null,
          error_message: null,
          requested_by: principal.id,
          created_at: now(),
          finished_at: null,
        });
        const job = await this.jobs.enqueue(
          old.version_id ? 'rescan' : 'intake',
          intake.id,
          old.version_id ? { version_id: old.version_id } : {},
        );
        await this.context.store.audit(principal.id, 'intake.rescan_requested', intake.id, '', {
          original_intake_id: old.id,
        });
        return { intake_id: intake.id, job_id: job.id };
      },
    );
  }
}
