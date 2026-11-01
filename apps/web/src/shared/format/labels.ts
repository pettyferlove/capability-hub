import type { PublicUserResponse } from '@capability-hub/contracts/http';

/** 同名账号的授权和成员关系独立，管理操作需显示来源。 */
export const accountLoginLabel = (user: Pick<PublicUserResponse, 'username' | 'auth_provider'>) =>
  `${user.username} · ${user.auth_provider === 'ldap' ? 'LDAP 账号' : '本地账号'}`;

/**
 * 分类名；未知取值原样返回而不是回退到「未分类」——后端新增分类时界面会直接露出该标识，
 * 便于发现遗漏，也避免把两种不同分类显示成同一文案。
 */
export const categoryLabel = (v: string) =>
  ({ general: '通用', scenario: '场景', uncategorized: '未分类' })[v] ?? v;

/**
 * 状态名；同一张表覆盖资产、版本、发布申请、来源、后台任务等多条状态机（取值空间是并集），
 * 未知值原样显示而不落到「未知」，这样新状态上线时界面会暴露出英文枚举而不是被就地吞掉。
 */
export const stateLabel = (v: string) =>
  ({
    received: '已接收',
    fetching: '拉取中',
    scanning: '扫描中',
    ready: '待提交审核',
    failed: '处理失败',
    cancelled: '已撤回',
    pending: '待审核',
    approved: '已通过',
    unreleased: '未发布',
    released: '已发布',
    revoked: '已撤销',
    deprecated: '已弃用',
    rejected: '已退回',
    stale: '已失效',
    active: '活动',
    paused: '已暂停',
    auth_error: '认证失败',
    blocked: '已阻断',
    queued: '排队中',
    running: '处理中',
    succeeded: '已完成',
  })[v] ?? v;

/**
 * 字节数展示：1024 进制，不足 1 KiB 显示整数 `B`，其余保留一位小数并换成 KB/MB。
 * 没有 GB 分支，更大的值继续以 MB 表示（如 `2048.0 MB`），需要换单位时请另写一个函数。
 */
export const bytesLabel = (v: number) =>
  v < 1024
    ? `${v} B`
    : v < 1024 * 1024
      ? `${(v / 1024).toFixed(1)} KB`
      : `${(v / 1024 / 1024).toFixed(1)} MB`;

/**
 * 时间展示：固定 `zh-CN`、两位数月/日 + 24 小时制的时:分，**不含年份**且不做相对时间，
 * 因此它不适合跨年对比或需要精确时刻的场景（那些场景请自己格式化）。
 */
export const dateLabel = (v: string | number) =>
  new Date(v).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
