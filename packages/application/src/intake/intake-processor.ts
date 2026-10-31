import { contentScanRuleset } from '@capability-hub/domain/content';
import type { ContentFile } from '@capability-hub/domain/content';
import type { IntakeRecord, JobRecord } from '@capability-hub/domain/models';
import { canonical, digest, sha256 } from '@capability-hub/domain/canonical';
import { fail } from '@capability-hub/domain/errors';
import { randomUUID } from 'node:crypto';
import type { JobQueue } from '../jobs/job-queue.js';
import type { IntakeScanner } from '../ports/index.js';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from '../catalog/asset-access-service.js';

const now = () => new Date().toISOString();

/** 扫描与写入内容在事务外完成；提交候选版本前再次检查来源、资源与作业租约。 */
export class IntakeProcessor {
  constructor(
    private readonly context: ApplicationContext,
    private readonly assets: AssetAccessService,
    private readonly jobs: JobQueue,
    private readonly scan: IntakeScanner,
  ) {}
  async process(intake: IntakeRecord, job: JobRecord, provided?: ContentFile[]) {
    const a = await this.assets.getAsset(intake.asset_id);
    intake = await this.jobs.withLease(job, async () => {
      return await this.context.store.put('intakes', {
        ...intake,
        state: 'scanning',
        phase: '规范化与静态扫描',
        progress: [
          ...intake.progress.filter((entry) => ['received', 'fetching'].includes(entry.step)),
          { step: 'scanning', started_at: now() },
        ],
        processing_ruleset: contentScanRuleset,
      });
    });
    if (!provided && !intake.payload_ref) fail(409, 'NO_CONTENT', '没有可扫描的固定内容');
    const { inspected, zip } = await this.scan({
      kind: a.kind,
      slug: a.slug,
      ...(provided
        ? { files: provided }
        : { bytes: await this.context.blobs.read(intake.payload_ref!) }),
    });
    intake = await this.jobs.withLease(
      job,
      async () =>
        await this.context.store.put('intakes', {
          ...intake,
          phase: '保存固定快照与检查证据',
          progress: [...intake.progress, { step: 'snapshot', started_at: now() }],
        }),
    );
    const artifact_ref = await this.context.blobs.put(zip);
    const manifest_ref = await this.context.blobs.put(Buffer.from(canonical(inspected.manifest)));
    const files = await Promise.all(
      inspected.files.map(async (f) => ({
        path: f.path,
        blob_ref: await this.context.blobs.put(f.bytes),
        sha256: sha256(f.bytes),
        size: f.bytes.length,
        executable: f.executable,
      })),
    );
    return await this.jobs.withLease(job, async () => {
      const current = await this.assets.getAsset(a.id);
      if (current.lifecycle === 'blocked') fail(409, 'ASSET_BLOCKED', '资产已封禁');
      const source = (await this.context.store.get('sources', intake.source_id))!;
      const binding = intake.binding_id
        ? await this.context.store.get('bindings', intake.binding_id)
        : undefined;
      if (
        source.revision !== intake.source_revision ||
        source.state === 'blocked' ||
        source.distribution_revoked_at ||
        (!intake.historical && current.source_id !== intake.source_id) ||
        (intake.binding_id &&
          (source.state !== 'active' ||
            !binding?.enabled ||
            binding.retired_at ||
            binding.asset_id !== current.id ||
            binding.source_id !== source.id))
      )
        fail(409, 'SOURCE_CONFIG_CHANGED', '来源配置已变化');
      if (intake.source_generation && source.generation !== intake.source_generation)
        fail(409, 'SOURCE_GENERATION_CHANGED', '较新的同步已开始');
      const sameLabel = (await this.context.store.all('versions')).find(
        (v) => v.asset_id === a.id && v.version_label === intake.version_label,
      );
      if (sameLabel && sameLabel.content_digest !== inspected.content_digest)
        fail(409, 'VERSION_CONTENT_CONFLICT', '同版本已经存在不同内容');
      let version = sameLabel;
      if (!version && intake.binding_id)
        version = (await this.context.store.all('versions'))
          .filter(
            (v) =>
              v.asset_id === a.id &&
              v.content_digest === inspected.content_digest &&
              v.availability !== 'revoked',
          )
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (!version)
        version = await this.context.store.insert('versions', {
          id: randomUUID(),
          asset_id: a.id,
          version_label: intake.version_label,
          origin_source_id: intake.source_id,
          origin_ref: intake.origin_ref ?? '',
          origin_commit: intake.origin_commit ?? '',
          origin_path: intake.origin_path ?? '',
          intake_id: intake.id,
          content_digest: inspected.content_digest,
          manifest: inspected.manifest,
          manifest_ref,
          artifact_ref,
          artifact_digest: digest(zip),
          files,
          metadata: inspected.metadata,
          availability: 'unreleased',
          created_at: now(),
        });
      if (version.availability === 'revoked')
        fail(409, 'VERSION_REVOKED', '版本已撤销，请使用新版本');
      const scan = await this.context.store.insert('scans', {
        id: randomUUID(),
        version_id: version.id,
        ruleset_version: contentScanRuleset,
        scanner_version: '1',
        state: inspected.state,
        findings: inspected.findings,
        finished_at: now(),
      });
      const result = await this.context.store.put('intakes', {
        ...intake,
        version_id: version.id,
        content_digest: version.content_digest,
        scan_run_id: scan.id,
        state: 'ready',
        phase: '可提交审核',
        processing_ruleset: contentScanRuleset,
        error_message: null,
        retryable: false,
        error_code: null,
        finished_at: now(),
      });
      if (intake.binding_id) {
        const b = (await this.context.store.get('bindings', intake.binding_id))!;
        await this.context.store.put('bindings', { ...b, last_intake_id: intake.id });
      }
      await this.context.store.audit(
        'system',
        'intake.' + result.state,
        intake.id,
        result.error_message ?? '',
        {
          requested_by: intake.requested_by,
          ...(result.error_code ? { error_code: result.error_code } : {}),
        },
      );
      return result;
    });
  }
}
