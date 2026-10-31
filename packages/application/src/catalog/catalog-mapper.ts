import type { VersionRecord } from '@capability-hub/domain/models';

/** 审查接口返回内容证据，不返回对象存储定位信息。 */
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
