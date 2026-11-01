import type { AssetKind } from '../content.js';
import type { ContentMetadata, Manifest, ManifestFile } from '../content.js';
import type { IsoDateTime, VersionedRecord } from './base.js';

/**
 * 资产（用户可见的资源实体）。`slug` 一经创建即用于公开链接，改名会断开既有链接，因此不随发布变更。
 */
export interface AssetRecord extends VersionedRecord {
  /** 全小写 kebab-case，1–64 字符，全局唯一；出现在公开路径里。 */
  slug: string;
  kind: AssetKind;
  /** 使用前需要调用方自备 API Key；改变此标记会作废待审的发布请求。 */
  requires_api_key?: boolean;
  /** 内容来源；上传型与 Git 型来源的取名与同步方式不同。 */
  source_id: string;
  /** 维护团队，同时是默认分发受众与 `asset:maintain` 的作用域依据。 */
  owner_group_id: string;
  /** `deprecated` 需要给出原因并可选替代资产；`blocked` 需 `asset:lifecycle` 权限才能设置或解除。 */
  lifecycle: 'active' | 'deprecated' | 'blocked';
  /** 当前对外发布记录；`null` 表示尚未发布，公开页不可见。 */
  current_release_id: string | null;
  created_at: IsoDateTime;
  /** 最近一次状态变更的原因，含 `deprecated` 与 `blocked` 两种场景。 */
  deprecation_reason?: string;
  /** 弃用时的替代资产，必须是可读的已发布资产，且不能指向自身。 */
  replacement_asset_id?: string | null;
  /** 同步时在来源里找不到该路径的时间；非空说明来源已删，需人工处理。 */
  source_missing_at?: IsoDateTime | null;
}

/**
 * 版本内的文件索引：在清单条目之外记录正文所在的 blob 引用，
 * `blob_ref` 是内容的 SHA-256，多个版本引用同一份字节时不会重复存。
 */
export interface StoredFile extends ManifestFile {
  blob_ref: string;
}

/**
 * 内容版本，创建后不可变（只有 `availability` 会变），因此可以从它复现当时发布的内容与扫描结论。
 */
export interface VersionRecord {
  id: string;
  asset_id: string;
  /** 版本标签，须是固定 semver（`isFixedVersionLabel`）；同资产内不同内容不得复用同一标签。 */
  version_label: string;
  /** 来源 id 与来源内位置快照，用于追溯这份内容当时从哪来。 */
  origin_source_id: string;
  origin_ref: string;
  origin_commit: string;
  origin_path: string;
  /** 产出该版本的接收记录 id，是回溯上传/Sync 过程的入口。 */
  intake_id: string;
  /** 清单 `sha256:` 摘要；内容相同即摘要相同，用于去重与「同版本不同内容」判定。 */
  content_digest: string;
  /** 打包后 ZIP 的 `sha256:` 摘要，安装端下载后据此校验字节。 */
  artifact_digest: string;
  /** 清单与归档在 blob 存储中的键（内容寻址），不是可读路径。 */
  manifest_ref: string;
  artifact_ref: string;
  manifest: Manifest;
  /** 文件索引，含 blob 定位；对外响应会剥离 `blob_ref`。 */
  files: StoredFile[];
  metadata: ContentMetadata;
  /** `unreleased` 只能由发布流程转为 `released`；`revoked` 为终态，不可再次发布。 */
  availability: 'unreleased' | 'released' | 'revoked';
  created_at: IsoDateTime;
}

/**
 * 用户对某个版本的推荐（「有用」标记）。同一用户对同一版本至多一条：推荐是幂等的开关，
 * 取消推荐直接删除记录，因此计数就是本表的行数。
 */
export interface RecommendationRecord {
  id: string;
  user_id: string;
  version_id: string;
  created_at: IsoDateTime;
}

/**
 * 适用场景字典，供发布策略的 `scenario_ids` 引用；停用后不可再被选入新策略，
 * 已冻结在历史发布记录里的引用不受影响。
 */
export interface ScenarioRecord {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

/**
 * 使用者提交的反馈证据。提交者的判断不会直接改变资源状态，处理结论由维护者给出；
 * 幂等键随请求体提交（不是 `Idempotency-Key` 头），同键异内容即 409。
 */
export interface AssetFeedbackRecord {
  id: string;
  asset_id: string;
  /** 反馈针对的版本；提交者必须对该版本可读。 */
  version_id: string;
  submitted_by: string;
  /** 调用方提供的幂等键，≤ 200 字符；与 `submitted_by` 一起唯一，用于重放保护。 */
  request_key: string;
  /** 反馈内容的摘要，键相同但摘要不同即判定为键复用并拒绝。 */
  request_hash: string;
  kind: 'defect' | 'capability_gap' | 'suggestion';
  title: string;
  scenario: string;
  expected: string;
  actual: string;
  location: string;
  reproduction: string;
  evidence: string;
  suggestion: string;
  /** 提交者认为该问题阻塞使用，仅供维护者排期参考。 */
  blocking: boolean;
  /** 置为 `resolved`/`declined` 时必须同时给出 `resolution`。 */
  status: 'pending' | 'in_progress' | 'resolved' | 'declined';
  /** 处理说明，结束处理时不可为空。 */
  resolution: string;
  /** 修复版本，须属于同一资产且状态为 `resolved`；对无权限的读者会回填 `null`。 */
  fixed_version_id: string | null;
  /** 最后一位维护者 id；提交时为空。 */
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  /** 乐观锁：更新请求携带的 `revision` 不匹配即 409（走请求体，不走 `If-Match`）。 */
  revision: number;
}
