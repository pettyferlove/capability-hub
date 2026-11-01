import type { Applicability } from '@capability-hub/domain/content';
import type { AssetKind } from '@capability-hub/domain/content';
import type { Policy } from '@capability-hub/domain/policy';

/**
 * 单个同步目标的策略：复用发布策略字段，并额外声明路径与资源标识。
 * 创建来源时由 HTTP body 提供，更新时可能从库中回填，因此可选标记不代表可省略。
 */
export interface SourceTarget extends Policy {
  /** 目标资产 slug，与绑定一一对应；已存在则 409/`SLUG_CONFLICT`。 */
  slug: string;
  kind: AssetKind;
  /** 来源仓库内的相对路径，1–240 字符；规范化后不得与其他目标冲突。 */
  path: string;
  applies_to?: Applicability;
  /** 更新来源时用于指认既有绑定；创建时忽略。 */
  binding_id?: string;
  /** 仅更新时由库回填，客户端传入不参与定位。 */
  asset_id?: string;
  /** `false` 表示保留绑定但不参与同步；省略按启用处理。 */
  enabled?: boolean;
}

/**
 * 创建 Git 来源的输入，来自 HTTP 的 JSON body（`createSourceRequestSchema` 解析）；
 * 调用者需在 `owner_group_id` 上持有 `source:create`，并自行拥有所选凭据。
 */
export interface CreateSourceCommand {
  /**
   * ≤2048 字符，只接受 `https://`、`ssh://` 或 `user@host:path` 形式；
   * 地址与分支的可达性由 `GitRepository.validate`/`branch` 在事务外先行确认。
   */
  repository_url: string;
  provider: 'generic-git';
  /** ≤255 字符，必须在远端存在，否则 422 由 git 适配器给出。 */
  branch: string;
  /**
   * 个人 Git 凭据；SSH 仓库必填（否则 422/`SSH_CREDENTIAL_REQUIRED`），
   * 引用他人凭据即 403/`CREDENTIAL_FORBIDDEN`。
   */
  credential_ref?: string;
  owner_group_id: string;
  /**
   * 1–50 个目标：重复路径 422/`DUPLICATE_PATH`，启用目标之间父子路径重叠
   * 422/`OVERLAPPING_PATH`，每个目标的策略还要通过发布策略校验。
   */
  targets: Omit<SourceTarget, 'binding_id' | 'asset_id' | 'enabled'>[];
}

/**
 * 修改 Git 来源的输入，来自 HTTP 的 JSON body（`updateSourceRequestSchema` 解析），
 * 需 `If-Match` 乐观锁（缺 428、不符 412）与 `source:manage` 权限。
 */
export interface UpdateSourceCommand {
  branch?: string;
  /**
   * `null` 表示清除凭据，SSH 仓库清除即 422/`SSH_CREDENTIAL_REQUIRED`；
   * 换凭据会让进行中的同步按修订号失效。
   */
  credential_ref?: string | null;
  /** `paused` 后不再产生新的同步作业，已有作业不受影响。 */
  state?: 'active' | 'paused';
  /**
   * 全量目标列表：必须覆盖全部既有绑定（缺项、重复或未知 `binding_id`
   * → 422/`TARGET_SET_INCOMPLETE`），
   * 停用某个目标要显式传 `enabled: false`；既有目标的 `slug`/`kind`/`asset_id` 不可改
   * （422/`BINDING_IMMUTABLE`），非 `paused` 状态至少保留一个启用目标
   * （422/`ACTIVE_TARGET_REQUIRED`）。省略该字段表示不动现有目标；一旦提交，
   * 相关资产的待审发布请求会因 `SOURCE_CONFIG_CHANGED` 失效。
   */
  targets?: SourceTarget[];
}
