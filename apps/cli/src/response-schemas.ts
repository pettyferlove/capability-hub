import { z } from 'zod';
import {
  assetSlugSchema,
  hubFeedbackCreateRequestSchema,
  hubFeedbackDiagnosticsSchema,
  hubFeedbackStatusSchema,
  hubFeedbackUpdateRequestSchema,
  manifestSchema,
} from '@capability-hub/contracts';

const id = z.uuid();
const text = z.string();
const digest = text.regex(/^sha256:[a-f0-9]{64}$/);
const option = z.looseObject({ option_id: text, supported: z.boolean() });

/** 资源摘要。用 loose 解析：多出的字段忽略，缺字段才算协议不兼容。 */
export const assetSchema = z.looseObject({
  asset_id: id,
  slug: assetSlugSchema,
  kind: z.enum(['skill', 'mcp']),
  description: text,
  lifecycle: z.enum(['active', 'deprecated', 'blocked']).optional(),
  deprecation_reason: text.optional(),
  replacement_asset_id: id.nullish(),
  replacement_asset_slug: assetSlugSchema.nullish(),
  current_release: z.looseObject({ version_id: id, version_label: text }),
  installation_options: z.array(option),
});

/** 搜索响应；`total` 是命中总数，`items` 可能被分页截断。 */
export const searchSchema = z.looseObject({
  items: z.array(assetSchema),
  total: z.number().int().nonnegative(),
});

/** 版本列表，按 Hub 返回顺序使用；CLI 只按 `version_label` 精确匹配。 */
export const versionsSchema = z.array(z.looseObject({ version_id: id, version_label: text }));

/** 安装项列表（含未支持的项），供 CLI 判断是否必须显式 `--option`。 */
export const optionsSchema = z.object({ installation_options: z.array(option) });

/** 生成好的客户端配置文本与所需变量说明，由 CLI 原样打印、不落盘。 */
export const configurationSchema = z.object({
  text,
  target_file: text,
  notes: z.array(text),
  required_variables: z.array(z.object({ instruction: text })),
});

/** 版本清单与两个摘要；摘要用于安装前后比对，`release_id` 尚未发布时为 null。 */
export const manifestResponseSchema = z.object({
  manifest: manifestSchema,
  content_digest: digest,
  artifact_digest: digest,
  release_id: id.nullable(),
});

/** 查验固定版本可用性时无需解码文件清单。 */
export const versionIdentitySchema = z.object({ version_id: id, asset_id: id });

const latestReleaseSchema = z.object({
  version_id: id,
  version_label: text,
  published_at: z.iso.datetime(),
});

/** 票据绑定已发布版本；归档被消费后仍可读取清单。 */
export const installTicketSchema = manifestResponseSchema.extend({
  hub_url: z.url(),
  asset_id: id,
  slug: assetSlugSchema,
  version_id: id,
  version_label: text,
  release_id: id,
  expires_at: z.iso.datetime(),
  latest_release: latestReleaseSchema.nullish(),
  archive_available: z.boolean(),
});

/** 设备码登录首步：`expires_in` 上限 600 秒，CLI 用它决定轮询截止时间。 */
export const loginResponseSchema = z.object({
  verification_uri: z.url(),
  user_code: text.regex(/^[A-F0-9]{8}$/),
  device_code: text.regex(/^[A-Za-z0-9_-]{43}$/),
  expires_in: z.number().int().positive().max(600),
});

/** 轮询结果：只有 `complete` 才携带令牌，`pending` 时 CLI 继续等待。 */
export const pollResponseSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('complete'), token: text.regex(/^\S+$/) }),
]);

const feedbackNumber = z.number().int().positive().max(2147483647);
const feedbackItemSchema = z.object({
  id,
  number: feedbackNumber,
  kind: hubFeedbackCreateRequestSchema.shape.kind,
  surface: hubFeedbackCreateRequestSchema.shape.surface,
  area: hubFeedbackCreateRequestSchema.shape.area.unwrap(),
  channel: z.enum(['web', 'cli']),
  title: text,
  blocking: z.boolean(),
  status: hubFeedbackStatusSchema,
  created_at: z.iso.datetime(),
  last_activity_at: z.iso.datetime(),
  revision: z.number().int().positive(),
  unread: z.boolean(),
  awaiting_reply: z.boolean(),
});

const feedbackAttachmentSchema = z.object({
  id,
  event_id: id.nullable(),
  kind: z.enum(['screenshot', 'image', 'json', 'text']),
  media_type: z.enum(['image/png', 'image/jpeg', 'image/webp', 'application/json', 'text/plain']),
  name: text,
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  removed_at: z.iso.datetime().nullable(),
  can_remove: z.boolean(),
});

const feedbackEventSchema = z.object({
  id,
  sequence: z.number().int().positive(),
  actor_role: z.enum(['submitter', 'handler', 'system']),
  actor_name: text.nullable(),
  kind: z.enum(['comment', 'status', 'assignment', 'attachment_removed', 'redaction']),
  visibility: z.literal('public'),
  body: text,
  status_from: hubFeedbackStatusSchema.nullable(),
  status_to: hubFeedbackStatusSchema.nullable(),
  decline_reason: hubFeedbackUpdateRequestSchema.shape.decline_reason.unwrap().nullable(),
  attachment_ids: z.array(id),
  redacted_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
});

export const feedbackListSchema = z.object({
  items: z.array(feedbackItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

// 旧 Hub 忽略 view，返回没有 next_after 和 view 的完整详情。
const feedbackDetailSchema = feedbackItemSchema.extend({
  view: z.undefined().optional(),
  description: text,
  steps: text,
  expected: text,
  diagnostics: hubFeedbackDiagnosticsSchema.nullable(),
  description_redacted_at: z.iso.datetime().nullable(),
  closed_at: z.iso.datetime().nullable(),
  decline_reason: feedbackEventSchema.shape.decline_reason,
  events: z.array(feedbackEventSchema),
  attachments: z.array(feedbackAttachmentSchema),
});

export const feedbackPageSchema = feedbackDetailSchema.extend({
  next_after: z.int().positive().nullable().optional(),
});

export const feedbackReceiptSchema = z.union([
  feedbackDetailSchema
    .pick({ id: true, number: true, status: true, revision: true, unread: true, attachments: true })
    .extend({ view: z.literal('receipt') }),
  feedbackDetailSchema,
]);

export const feedbackSummarySchema = z.object({
  unread: z.number().int().nonnegative(),
  open: z.number().int().nonnegative(),
});
