export const categoryLabel = (v: string) =>
  ({ general: '通用', scenario: '场景', uncategorized: '未分类' })[v] ?? v;
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
export const bytesLabel = (v: number) =>
  v < 1024
    ? `${v} B`
    : v < 1024 * 1024
      ? `${(v / 1024).toFixed(1)} KB`
      : `${(v / 1024 / 1024).toFixed(1)} MB`;
export const dateLabel = (v: string | number) =>
  new Date(v).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
