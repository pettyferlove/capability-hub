import type { Finding } from '../content.js';
import type { IsoDateTime } from './base.js';
import type { McpSharedKeyRecord } from './catalog.js';

/**
 * 接收记录的状态机：`received → fetching → scanning → ready`，失败落在 `failed`（可按 `retryable` 重试），
 * `cancelled` 为人工终止。`ready` 只表示内容已就绪待提交审核，不代表已发布。
 */
export type IntakeState = 'received' | 'fetching' | 'scanning' | 'ready' | 'failed' | 'cancelled';

/**
 * 处理阶段的时间戳，用于展示进度与排查卡在哪一步；阶段只能前进，重试会重建记录而不是改写历史。
 */
export interface IntakeProgress {
  step: 'received' | 'fetching' | 'scanning' | 'snapshot';
  started_at: IsoDateTime;
}

/**
 * 一次内容接收（上传或来源同步拉取）的完整证据链，串联来源、扫描、版本与发布申请。
 * 记录会持续追加字段直到终结，所以可空字段很多；关键不变量是 `version_id` 一旦写入就不再改变。
 */
export interface IntakeRecord {
  id: string;
  source_id: string;
  asset_id: string;
  /** 发起人 id；来源同步产生时是同步作业的请求者。 */
  requested_by: string;
  version_label: string;
  /** 发起时的来源修订号；处理时必须仍相等，否则 409 `SOURCE_CONFIG_CHANGED`。 */
  source_revision: number;
  state: IntakeState;
  /** 面向用户的中文阶段说明，仅供展示；机器判断请用 `state`。 */
  phase: string;
  /** 至少一条，按阶段顺序追加，用于还原耗时。 */
  progress: IntakeProgress[];
  created_at: IsoDateTime;
  /** 上传内容在 blob 存储中的键（内容寻址摘要）；Git 类型没有该字段。 */
  payload_ref?: string;
  filename?: string;
  keywords?: string[];
  requires_api_key?: boolean;
  /** 候选密钥独立于归档，批准后才对该资产的安装配置生效。 */
  pending_mcp_key?: McpSharedKeyRecord & { base_revision: number };
  /** 由来源绑定触发时指向该绑定；非绑定路径为空，为空也意味着不能按绑定重试。 */
  binding_id?: string | null;
  source_sync_job_id?: string;
  /** 发起时的来源代次；处理时来源代次已前进则放弃本次（409 `SOURCE_GENERATION_CHANGED`）。 */
  source_generation?: number | null;
  origin_ref?: string;
  origin_commit?: string;
  origin_path?: string;
  /** 处理后产出的版本；为空表示尚未进入版本表。 */
  version_id?: string | null;
  content_digest?: string | null;
  scan_run_id?: string | null;
  /** 处理时使用的扫描规则集版本，用于判断是否需要重新扫描。 */
  processing_ruleset?: string;
  finished_at?: IsoDateTime | null;
  /** 若本记录是对旧记录的重扫，指向被重扫的接收记录。 */
  rescan_of?: string;
  /** 历史导入：跳过「来源配置未变」类复核，按当时的证据成立。 */
  historical?: boolean;
  error_code?: string | null;
  error_message?: string | null;
  /** 失败是否值得重试；已绑定来源的失败不在此重试，需要重新同步。 */
  retryable?: boolean;
}

/**
 * 一次静态扫描的结论快照，与版本一一对应地保留下来：
 * 审核时比对 `ruleset_version`，规则集不同即要求重新扫描（409 `SCAN_REQUIRED`）。
 */
export interface ScanRecord {
  id: string;
  version_id: string;
  /** 扫描时使用的规则集版本标识，形如 `2026-10-31.2`。 */
  ruleset_version: string;
  scanner_version: string;
  state: 'passed' | 'blocked';
  findings: Finding[];
  finished_at: IsoDateTime;
}
