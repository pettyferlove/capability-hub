import { z } from 'zod';

/** 审计分类字典：键为线协议取值，值为界面分组名；未登记的 action 归入 `other`。 */
export const auditCategories = {
  identity: '账号与权限',
  publication: '发布与审核',
  content: '资源使用',
  source: '来源与扫描',
  operations: '平台运维',
  other: '其他事件',
} as const;
/** {@link auditCategories} 的键集合。 */
export type AuditCategory = keyof typeof auditCategories;
/** 审计主体类型；`unknown` 表示事件里只留下 id、无法还原实体。 */
export type AuditSubjectKind =
  | 'user'
  | 'group'
  | 'role'
  | 'grant'
  | 'membership'
  | 'token'
  | 'session'
  | 'cli'
  | 'connection'
  | 'asset'
  | 'version'
  | 'intake'
  | 'publication'
  | 'source'
  | 'credential'
  | 'scenario'
  | 'instance'
  | 'unknown';
/** 事件发生时的操作者快照；账号改名后历史事件仍显示当时记录的名称。 */
export interface AuditActorSnapshot {
  kind: 'user' | 'anonymous' | 'system' | 'unknown';
  name: string;
  username?: string;
}
/** 事件发生时的主体快照；主体记录被删时字段退化为占位值。 */
export interface AuditSubjectSnapshot {
  kind: AuditSubjectKind;
  name: string;
  detail: string;
  asset_id?: string;
  version_id?: string;
  request_id?: string;
}

/**
 * 审计检索：`from`/`to` 为带时区偏移的 ISO 时间，且开始不得晚于结束（否则该字段报错）；
 * `page` 以字符串传入（1–9999999），`page_size` 只接受 5/10/20/50 默认 20。
 * 各筛选项默认 `all`，`q` 去空白后 ≤200 字符。
 */
export const auditLogQuerySchema = z
  .object({
    q: z.string().trim().max(200).default(''),
    category: z
      .enum(['all', 'identity', 'publication', 'content', 'source', 'operations', 'other'])
      .default('all'),
    result: z.enum(['all', 'success', 'failure']).default('all'),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    page: z
      .string()
      .regex(/^[1-9]\d{0,6}$/)
      .default('1')
      .transform(Number),
    page_size: z.enum(['5', '10', '20', '50']).default('20').transform(Number),
  })
  .strict()
  .refine((query) => !query.from || !query.to || Date.parse(query.from) <= Date.parse(query.to), {
    message: '开始时间不能晚于结束时间',
    path: ['to'],
  });
