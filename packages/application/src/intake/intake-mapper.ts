import type { IntakeRecord } from '@capability-hub/domain/models';

/**
 * 把接收记录投影成对外的详情字段白名单：只逐项挑出可公开的字段，
 * `payload_ref`（上传字节的 blob 句柄）与 `requires_api_key` 等内部字段不外泄，
 * `progress` 也只保留步骤与开始时间。
 */
export function toIntakeDetails(intake: IntakeRecord) {
  return {
    id: intake.id,
    source_id: intake.source_id,
    asset_id: intake.asset_id,
    requested_by: intake.requested_by,
    version_label: intake.version_label,
    source_revision: intake.source_revision,
    state: intake.state,
    phase: intake.phase,
    progress: intake.progress.map(({ step, started_at }) => ({ step, started_at })),
    created_at: intake.created_at,
    filename: intake.filename,
    keywords: intake.keywords,
    binding_id: intake.binding_id,
    source_sync_job_id: intake.source_sync_job_id,
    source_generation: intake.source_generation,
    origin_ref: intake.origin_ref,
    origin_commit: intake.origin_commit,
    origin_path: intake.origin_path,
    version_id: intake.version_id,
    content_digest: intake.content_digest,
    scan_run_id: intake.scan_run_id,
    processing_ruleset: intake.processing_ruleset,
    finished_at: intake.finished_at,
    rescan_of: intake.rescan_of,
    historical: intake.historical,
    error_code: intake.error_code,
    error_message: intake.error_message,
    retryable: intake.retryable,
  };
}
