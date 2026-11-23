import { z } from 'zod';

export const hubFeedbackKinds = {
  bug: '功能异常',
  ux: '体验问题',
  suggestion: '功能建议',
  question: '使用咨询',
} as const;
export const hubFeedbackSurfaces = {
  web: '网页',
  cli: 'CLI',
  mcp: 'Agent 接入',
  other: '其他',
} as const;
export const hubFeedbackAreas = {
  discover: '发现与安装',
  publish: '发布',
  review: '审核',
  connect: '接入 Agent',
  account: '账号与权限',
  operations: '运营中心',
  other: '其他',
} as const;
export const hubFeedbackStatuses = {
  pending: '待处理',
  in_progress: '处理中',
  needs_info: '待补充',
  resolved: '已解决',
  declined: '不采纳',
} as const;
export const hubFeedbackDeclineReasons = {
  duplicate: '重复',
  cannot_reproduce: '无法复现',
  not_hub_issue: '非平台问题',
  wont_do: '暂不计划',
} as const;

export const hubFeedbackLimits = {
  imageBytes: 5 * 1024 * 1024,
  textBytes: 1024 * 1024,
  uploadBytes: 12 * 1024 * 1024,
  uploadFiles: 5,
  metadataBytes: 64 * 1024,
} as const;

const kind = z.enum(Object.keys(hubFeedbackKinds) as (keyof typeof hubFeedbackKinds)[]);
const surface = z.enum(Object.keys(hubFeedbackSurfaces) as (keyof typeof hubFeedbackSurfaces)[]);
const area = z.enum(Object.keys(hubFeedbackAreas) as (keyof typeof hubFeedbackAreas)[]);
export const hubFeedbackStatusSchema = z.enum(
  Object.keys(hubFeedbackStatuses) as (keyof typeof hubFeedbackStatuses)[],
);
const status = hubFeedbackStatusSchema;
const declineReason = z.enum(
  Object.keys(hubFeedbackDeclineReasons) as (keyof typeof hubFeedbackDeclineReasons)[],
);
const attachmentKind = z.enum(['screenshot', 'image', 'text', 'json']);
const channel = z.enum(['web', 'cli']);
const feedbackNumber = z.number().int().positive().max(2147483647);
const code = z.string().regex(/^[A-Za-z0-9_]{1,80}$/);
const version = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/)
  .max(80);
const webBuild = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/);
const method = z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const httpStatus = z.number().int().min(0).max(599);

export const hubFeedbackFailedRequestSchema = z.strictObject({
  at: z.iso.datetime(),
  method,
  path: z
    .string()
    .max(500)
    .regex(/^\/(?:api|auth)(?:\/[A-Za-z0-9._~%-]+)*\/?$/),
  status: httpStatus,
  code,
  request_id: z.uuid().optional(),
});

const webDiagnostics = z.strictObject({
  kind: z.literal('web'),
  page: z
    .enum([
      'discover',
      'publish',
      'review',
      'connect',
      'account',
      'login',
      'operations',
      'not-found',
    ])
    .optional(),
  query: z
    .strictObject({
      tab: z
        .enum([
          'profile',
          'credentials',
          'security',
          'identity',
          'roles',
          'feedback',
          'overview',
          'agents',
          'usage',
          'runtime',
          'audit',
          'files',
          'installation',
          'versions',
          'upload',
          'git',
          'manage',
        ])
        .optional(),
      view: z.enum(['teams', 'scenarios', 'definitions', 'analytics']).optional(),
      state: z.enum(['pending', 'approved', 'rejected', 'cancelled', 'stale']).optional(),
      request: z.uuid().optional(),
      execution: z.uuid().optional(),
      feedback: z.uuid().optional(),
    })
    .optional(),
  web_build: webBuild.optional(),
  hub_version: version.optional(),
  asset_slug: z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,160}$/)
    .optional(),
  viewport: z
    .strictObject({
      width: z.number().int().nonnegative().max(32768),
      height: z.number().int().nonnegative().max(32768),
    })
    .optional(),
  device_pixel_ratio: z.number().positive().max(32).optional(),
  theme: z.enum(['light', 'dark']).optional(),
  palette: z.enum(['cobalt', 'azurite', 'malachite', 'ochre', 'amethyst']).optional(),
  reduced_motion: z.boolean().optional(),
  language: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,60}$/)
    .optional(),
  timezone: z
    .string()
    .regex(/^[A-Za-z0-9_+\-/]{1,80}$/)
    .optional(),
  online: z.boolean().optional(),
  failed_requests: z.array(hubFeedbackFailedRequestSchema).max(10).optional(),
  page_errors: z
    .array(
      z.strictObject({
        event: z.enum(['react.error', 'runtime.error', 'runtime.rejection']),
        type: z.string().min(1).max(80),
        stack: z
          .string()
          .max(2000)
          .regex(/^(?:[ \t]*at [^\r\n]*(?:\n|$))*$/)
          .optional(),
      }),
    )
    .max(5)
    .optional(),
  telemetry_session_id: z.uuid().optional(),
});

const origin = z
  .url()
  .max(500)
  .refine((value) => {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) && parsed.origin === value;
  });

export const hubFeedbackLastFailureSchema = z.strictObject({
  at: z.iso.datetime(),
  command: z.string().regex(/^[a-z-]{1,32}(?: [a-z-]{1,32})?$/),
  options: z.array(z.string().regex(/^--[a-z0-9-]{1,40}$/)).max(40),
  arguments: z.array(z.string().max(240)).max(10),
  exit_code: z.number().int().min(1).max(255),
  status: httpStatus.optional(),
  code: code.optional(),
  request_id: z.uuid().optional(),
  message: z.string().max(500),
  hub_origin: origin.optional(),
});

const cliDiagnostics = z.strictObject({
  kind: z.literal('cli'),
  cli_version: version.optional(),
  node_version: version.optional(),
  platform: z
    .string()
    .regex(/^[a-z0-9]{1,20}$/)
    .optional(),
  arch: z
    .string()
    .regex(/^[a-z0-9]{1,20}$/)
    .optional(),
  os_release: z.string().max(160).optional(),
  interactive: z.boolean().optional(),
  ci: z.boolean().optional(),
  yes: z.boolean().optional(),
  credential_type: z.enum(['login', 'env']).optional(),
  hub_origin: origin.optional(),
  last_failure: hubFeedbackLastFailureSchema.optional(),
});

export const hubFeedbackDiagnosticsSchema = z
  .strictObject({
    client: z.discriminatedUnion('kind', [webDiagnostics, cliDiagnostics]),
  })
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 24 * 1024,
    '诊断信息不能超过 24 KiB',
  );

const files = z
  .array(
    z.strictObject({
      part: z
        .number()
        .int()
        .min(0)
        .max(hubFeedbackLimits.uploadFiles - 1),
      kind: attachmentKind,
      name: z.string().min(1).max(1024),
    }),
  )
  .max(hubFeedbackLimits.uploadFiles)
  .default([]);

export const hubFeedbackCreateRequestSchema = z.strictObject({
  kind,
  surface,
  area: area.nullable().default(null),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(5000),
  steps: z.string().trim().max(3000).default(''),
  expected: z.string().trim().max(2000).default(''),
  blocking: z.boolean().default(false),
  diagnostics: hubFeedbackDiagnosticsSchema.nullable().default(null),
  files,
});

const comment = { body: z.string().trim().min(1).max(5000), files };
export const hubFeedbackCommentRequestSchema = z.strictObject(comment);
export const hubFeedbackHandlerCommentRequestSchema = z.strictObject({
  ...comment,
  visibility: z.enum(['public', 'internal']),
});

export const hubFeedbackUpdateRequestSchema = z
  .strictObject({
    status: status.optional(),
    decline_reason: declineReason.optional(),
    duplicate_of: feedbackNumber.optional(),
    assignee_id: z.uuid().nullable().optional(),
    message: z.string().trim().max(5000).optional(),
  })
  .refine(
    (value) => value.status !== undefined || value.assignee_id !== undefined,
    '请选择处理动作',
  );

export const hubFeedbackRedactionRequestSchema = z.discriminatedUnion('target', [
  z.strictObject({ target: z.literal('description') }),
  z.strictObject({ target: z.literal('event'), event_id: z.uuid() }),
]);

const pagination = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
};
const view = z.enum(['open', 'closed', 'all']);
export const hubFeedbackListQuerySchema = z.strictObject({
  ...pagination,
  status: view.default('open'),
});
export const hubFeedbackQueueQuerySchema = z.strictObject({
  ...pagination,
  status: z.union([view, status]).default('open'),
  kind: kind.optional(),
  surface: surface.optional(),
  area: area.optional(),
  channel: channel.optional(),
  assignee: z.union([z.enum(['me', 'none']), z.uuid()]).optional(),
  awaiting: z.literal('1').optional(),
  q: z.string().trim().max(200).optional(),
});

/** 请求紧凑回执，不把完整反馈时间线放进写操作的响应。 */
export const hubFeedbackReceiptQuerySchema = z.strictObject({ view: z.literal('receipt') });

/** `after` 是排他的可见事件游标，省略时包含首帖及第一页事件。 */
export const hubFeedbackTimelineQuerySchema = z.strictObject({
  view: z.literal('timeline'),
  after: z
    .string()
    .regex(/^(?:0|[1-9]\d*)$/)
    .transform(Number)
    .pipe(z.int().nonnegative())
    .default(0),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

export const hubFeedbackRefSchema = z.union([
  z.uuid(),
  z
    .string()
    .regex(/^[1-9]\d{0,9}$/)
    .transform(Number)
    .pipe(feedbackNumber),
]);

export type HubFeedbackKind = z.infer<typeof kind>;
export type HubFeedbackSurface = z.infer<typeof surface>;
export type HubFeedbackArea = z.infer<typeof area>;
export type HubFeedbackStatus = z.infer<typeof status>;
export type HubFeedbackDeclineReason = z.infer<typeof declineReason>;
export type HubFeedbackChannel = z.infer<typeof channel>;
export type HubFeedbackAttachmentKind = z.infer<typeof attachmentKind>;
export type HubFeedbackDiagnostics = z.infer<typeof hubFeedbackDiagnosticsSchema>;
export type HubFeedbackFailedRequest = z.infer<typeof hubFeedbackFailedRequestSchema>;
export type HubFeedbackLastFailure = z.infer<typeof hubFeedbackLastFailureSchema>;
export type HubFeedbackCreateRequest = z.input<typeof hubFeedbackCreateRequestSchema>;
export type HubFeedbackUpdateRequest = z.input<typeof hubFeedbackUpdateRequestSchema>;
export type HubFeedbackRedactionRequest = z.infer<typeof hubFeedbackRedactionRequestSchema>;
