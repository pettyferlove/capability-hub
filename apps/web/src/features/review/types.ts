/**
 * 审核请求里 `diff` 的单项，对应契约 `ChangeFileResponse`（`@capability-hub/contracts/http`）。
 * 客户端按 `status` 为 `added`/`modified`/`removed`/`unchanged` 做分组统计与高亮，
 * 服务端新增其它状态时只会被当成「非 unchanged」的显式变更，不会丢失。
 */
export type ChangeFile = { path: string; status: string; sha256: string; size: number };
