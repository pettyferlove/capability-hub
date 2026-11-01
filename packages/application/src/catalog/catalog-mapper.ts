import type { VersionRecord } from '@capability-hub/domain/models';

/**
 * 审查接口返回内容证据，不返回对象存储定位信息。
 *
 * 白名单拷贝而非整条透传：`files`（内含 `blob_ref`）等对象存储定位整体不在快照里，
 * 只保留版本标识、摘要、清单与元数据；`manifest`/`metadata` 原样返回，所以调用方
 * 不能假定它们已脱敏，需要限制字段时应在使用侧显式挑选。
 */
export function toVersionSnapshot(version: VersionRecord) {
  return {
    id: version.id,
    asset_id: version.asset_id,
    version_label: version.version_label,
    content_digest: version.content_digest,
    artifact_digest: version.artifact_digest,
    manifest: version.manifest,
    metadata: version.metadata,
    availability: version.availability,
    created_at: version.created_at,
  };
}
