import { z } from 'zod';

export const auditCategories = {
  identity: '账号与权限',
  publication: '发布与审核',
  content: '资源使用',
  source: '来源与扫描',
  operations: '平台运维',
  other: '其他事件',
} as const;
export type AuditCategory = keyof typeof auditCategories;
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
export interface AuditActorSnapshot {
  kind: 'user' | 'anonymous' | 'system' | 'unknown';
  name: string;
  username?: string;
}
export interface AuditSubjectSnapshot {
  kind: AuditSubjectKind;
  name: string;
  detail: string;
  asset_id?: string;
  version_id?: string;
  request_id?: string;
}

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
