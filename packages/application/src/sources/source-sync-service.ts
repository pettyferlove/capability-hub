import type { GitSourceRecord, JobRecord, SyncTargetResult } from '@capability-hub/domain/models';
import { contentScanRuleset } from '@capability-hub/domain/content';
import { fail, HubError, notFound } from '@capability-hub/domain/errors';
import { randomUUID } from 'node:crypto';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from '../catalog/asset-access-service.js';
import type { GitCredentialService } from '../credentials/git-credential-service.js';
import type { GitRepository } from '../ports/index.js';
import type { JobQueue } from '../jobs/job-queue.js';
import type { IntakeProcessor } from '../intake/intake-processor.js';

/** 固定 Git 提交、凭据修订和租约后，逐目标生成接收证据。 */
export class SourceSyncService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly assets: AssetAccessService,
    private readonly processor: IntakeProcessor,
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
    return source;
  }
  /**
   * 执行 `source_sync` 作业：固定 Git 提交与凭据修订后，对冻结时启用的每个目标
   * 生成接收证据。可安全重试——同提交、同来源 revision、同规则集（
   * `contentScanRuleset`）且已终结的 intake 会直接复用（`reused: true`），不重复
   * 生成版本。所有写入都经 {@link JobQueue.withLease} 在「租约校验 + 事务」内完成，
   * 租约丢失 → 409 `LEASE_LOST`。前置条件不满足 → 409 `SOURCE_CONFIG_CHANGED`
   * （来源暂停/封锁或 revision 与作业输入不符）或 409 `JOB_INPUT_INVALID`（缺
   * `requested_by`）；同步途中凭据 revision 与 snapshot 不一致 → 409
   * `CREDENTIAL_CHANGED`。单目标异常本地化为 `failed`（`SOURCE_CONFIG_CHANGED` 记为
   * `cancelled`），其余目标继续；成功时来源置 `active`、写 `last_success_at`、清
   * `last_error_code` 并延后 5 分钟轮询，同时按 `TARGET_MISSING` 维护资产
   * `source_missing_at`。外层错误才把来源标记失败：认证类错误置 `auth_error`，其余
   * 只记 `last_error_code`；错误一律重新抛出，`snapshot` 在 finally 中关闭。
   */
  async process(job: Extract<JobRecord, { kind: 'source_sync' }>) {
    const source = await this.getSourceRecord(job.aggregate_id);
    if (
      source.state === 'paused' ||
      source.state === 'blocked' ||
      source.revision !== job.input.source_revision
    )
      fail(409, 'SOURCE_CONFIG_CHANGED', '来源配置已变化');
    if (!job.input.requested_by) fail(409, 'JOB_INPUT_INVALID', '同步作业缺少发起人');
    const frozen = (await this.store.all('bindings')).filter(
      (b) => b.source_id === source.id && !b.retired_at && b.enabled,
    );
    let snapshot: Awaited<ReturnType<typeof this.git.snapshot>> | undefined;
    try {
      snapshot = await this.git.snapshot(source);
      const checkCredential = async () => {
        if (
          snapshot?.credential_revision !== undefined &&
          (await this.credentials.active(source.credential_ref!)).revision !==
            snapshot.credential_revision
        )
          fail(409, 'CREDENTIAL_CHANGED', 'Git 凭据已变化，请重新同步');
      };
      const commit = snapshot.commit;
      const generation = await this.jobs.withLease(job, async () => {
        await checkCredential();
        const latest = await this.getSourceRecord(source.id);
        if (latest.revision !== source.revision)
          fail(409, 'SOURCE_CONFIG_CHANGED', '来源配置已变化');
        const gen =
          latest.last_observed_commit === commit &&
          latest.last_observed_revision === source.revision
            ? latest.generation
            : latest.generation + 1;
        await this.store.put('sources', {
          ...latest,
          generation: gen,
          last_observed_commit: commit,
          last_observed_revision: source.revision,
        });
        return gen;
      });
      const results: SyncTargetResult[] = [];
      for (const binding of frozen) {
        await this.jobs.assertLease(job);
        await checkCredential();
        const a = await this.assets.getAsset(binding.asset_id);
        const repeated = (await this.store.where('intakes', 'asset_id', a.id)).find(
          (i) =>
            i.binding_id === binding.id &&
            i.source_revision === source.revision &&
            i.origin_commit === commit &&
            i.processing_ruleset === contentScanRuleset &&
            ['ready', 'failed'].includes(i.state) &&
            !i.retryable,
        );
        if (repeated) {
          results.push({
            id: binding.id,
            binding_id: binding.id,
            intake_id: repeated.id,
            state: repeated.state,
            version_id: repeated.version_id,
            error_code: repeated.error_code ?? null,
            reused: true,
          });
          continue;
        }
        const intake = await this.jobs.withLease(
          job,
          async () =>
            await this.store.insert('intakes', {
              id: randomUUID(),
              source_id: source.id,
              binding_id: binding.id,
              source_sync_job_id: job.id,
              asset_id: a.id,
              requested_by: job.input.requested_by,
              origin_ref: source.branch,
              origin_commit: commit,
              origin_path: binding.path,
              source_revision: source.revision,
              source_generation: generation,
              version_label: `git.${commit}.s${source.id}.r${source.revision}`,
              state: 'fetching',
              phase: '读取固定提交',
              progress: [{ step: 'fetching', started_at: new Date().toISOString() }],
              processing_ruleset: contentScanRuleset,
              created_at: new Date().toISOString(),
            }),
        );
        try {
          const files = await snapshot.read(binding.path, a.kind);
          await checkCredential();
          const result = await this.processor.process(intake, job, files);
          results.push({
            id: binding.id,
            binding_id: binding.id,
            intake_id: intake.id,
            state: result.state,
            version_id: result.version_id,
            error_code: result.error_code ?? null,
          });
        } catch (e) {
          const error =
            e instanceof HubError
              ? e
              : new HubError(
                  500,
                  'INTAKE_PROCESSING_FAILED',
                  '目标暂时无法处理，请重新同步',
                  {},
                  true,
                );
          const state = error.code === 'SOURCE_CONFIG_CHANGED' ? 'cancelled' : 'failed';
          await this.jobs.withLease(job, async () => {
            await this.store.put('intakes', {
              ...(await this.store.get('intakes', intake.id))!,
              state,
              phase: state === 'cancelled' ? '已取消' : '处理失败',
              error_code: error.code,
              error_message: error.message,
              retryable: error.retryable,
              finished_at: new Date().toISOString(),
            });
          });
          results.push({
            id: binding.id,
            binding_id: binding.id,
            intake_id: intake.id,
            state,
            error_code: error.code,
          });
        }
      }
      await this.jobs.withLease(job, async (currentJob) => {
        const current = await this.getSourceRecord(source.id);
        await checkCredential();
        if (current.revision !== source.revision)
          fail(409, 'SOURCE_CONFIG_CHANGED', '来源配置已变化');
        await this.store.put('sources', {
          ...current,
          state: 'active',
          last_success_at: new Date().toISOString(),
          last_error_code: null,
          next_poll_at: Date.now() + 300000,
        });
        for (const result of results) {
          const asset = await this.assets.getAsset(
            frozen.find((b) => b.id === result.binding_id)!.asset_id,
          );
          if (result.error_code === 'TARGET_MISSING')
            await this.store.put('assets', {
              ...asset,
              source_missing_at: new Date().toISOString(),
            });
          else if (!result.error_code && asset.source_missing_at)
            await this.store.put('assets', { ...asset, source_missing_at: null });
        }
        await this.store.put('jobs', {
          ...currentJob,
          result: { origin_commit: commit, source_revision: source.revision, targets: results },
        });
      });
      return { origin_commit: commit, targets: results };
    } catch (e) {
      const error =
        e instanceof HubError
          ? e
          : new HubError(500, 'SOURCE_SYNC_FAILED', '来源同步暂时失败', {}, true);
      await this.jobs.withLease(job, async () => {
        const current = await this.getSourceRecord(source.id);
        if (current.revision === source.revision)
          await this.store.put('sources', {
            ...current,
            ...([
              'GIT_AUTH_ERROR',
              'CREDENTIAL_UNAVAILABLE',
              'CREDENTIAL_MISMATCH',
              'CREDENTIAL_DECRYPTION',
              'SSH_CREDENTIAL_REQUIRED',
            ].includes(error.code)
              ? { state: 'auth_error' }
              : {}),
            last_error_code: error.code ?? 'GIT_FETCH_FAILED',
            next_poll_at: Date.now() + 300000,
          });
      });
      throw error;
    } finally {
      await snapshot?.close();
    }
  }
}
