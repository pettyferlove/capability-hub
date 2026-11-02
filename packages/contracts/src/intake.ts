import { z } from 'zod';
import { keywordsSchema, assetKindSchema, assetSlugSchema, uuidSchema } from './primitives.js';
import { versionLabelPattern, isFixedVersionLabel } from './version-labels.js';

const versionLabel = z
  .string()
  .min(1)
  .max(128)
  .regex(versionLabelPattern)
  .refine(isFixedVersionLabel, '版本号超出支持范围');

/** 表单和维护接口只接受请求头名称，不接受整行请求头。 */
export const mcpHeaderNamePattern = /^[A-Za-z0-9][A-Za-z0-9.\-_]{0,127}$/;

/** 共享密钥作为固定 HTTP 请求头交付，各客户端均须把它当作字面值。 */
export const mcpSharedKeyValueSchema = z
  .string()
  .min(1)
  .max(4096)
  .regex(/^[!-~]+$/, '密钥须为不含空格的可打印 ASCII 字符')
  .refine(
    (value) => !/^!|\$\{|\$[A-Za-z_]|\{(?:env|file):|%[A-Za-z_][A-Za-z0-9_]*%/.test(value),
    '密钥不能包含客户端会展开的命令或变量表达式',
  );

/** 值为 null 时移除该地址和请求头的共享密钥。 */
export const mcpSharedKeyUpdateRequestSchema = z
  .strictObject({
    url: z.url({ protocol: /^https?$/ }).max(4096),
    name: z.string().regex(mcpHeaderNamePattern),
    scheme: z.literal('bearer').optional(),
    value: mcpSharedKeyValueSchema.nullable(),
    confirm_sharing: z.literal(true).optional(),
  })
  .refine((input) => input.value === null || input.confirm_sharing === true, {
    path: ['confirm_sharing'],
    message: '请确认共享凭据的领取范围',
  });

/**
 * 导入列表可见状态全集（含审核结论），也用作筛选参数 `state` 的取值来源。
 * 与处理机的 {@link IntakeState} 不同，这里表达的是列表上「用户看到的业务状态」。
 */
export const intakeStatuses = [
  'processing',
  'ready',
  'pending',
  'approved',
  'failed',
  'rejected',
  'stale',
  'cancelled',
  'deprecated',
  'blocked',
] as const;

/** {@link intakeStatuses} 的成员类型。 */
export type IntakeStatus = (typeof intakeStatuses)[number];

/**
 * 导入列表查询：`page` 以字符串传入（1–9999999），转成数字后用于分页；
 * `page_size` 只接受 5/10/20/50 默认 5，`q` 去空白后 ≤200 字符，`state` 默认 `all`。
 */
export const intakeListQuerySchema = z
  .object({
    page: z
      .string()
      .regex(/^[1-9]\d{0,6}$/)
      .default('1')
      .transform(Number),
    page_size: z.enum(['5', '10', '20', '50']).default('5').transform(Number),
    q: z.string().trim().max(200).default(''),
    state: z.enum(['all', ...intakeStatuses]).default('all'),
  })
  .strict();

/**
 * 上传新版本请求，按 `target` 判别分支：`new` 需给出所属组、slug 与类型，
 * `existing` 只给资产 id。版本号必须是固定 SemVer（≤128）；`version_mode` 为 `automatic`
 * 时仍会复核一次版本建议，建议已过期则返回冲突而不是接受旧建议。
 */
export const uploadIntakeRequestSchema = z
  .discriminatedUnion('target', [
    z
      .object({
        target: z.literal('new'),
        owner_group_id: uuidSchema,
        slug: assetSlugSchema,
        kind: assetKindSchema,
        keywords: keywordsSchema.optional(),
        requires_api_key: z.boolean().optional(),
        shared_mcp_key: mcpSharedKeyValueSchema.optional(),
        confirm_sharing: z.literal(true).optional(),
        version_label: versionLabel,
      })
      .strict(),
    z
      .object({
        target: z.literal('existing'),
        asset_id: uuidSchema,
        keywords: keywordsSchema.optional(),
        requires_api_key: z.boolean().optional(),
        shared_mcp_key: mcpSharedKeyValueSchema.optional(),
        confirm_sharing: z.literal(true).optional(),
        version_label: versionLabel,
        version_mode: z.enum(['automatic', 'manual']).default('manual'),
      })
      .strict(),
  ])
  .refine((input) => input.shared_mcp_key === undefined || input.confirm_sharing === true, {
    path: ['confirm_sharing'],
    message: '请确认共享凭据的领取范围',
  });

/** 单个导入的处理机状态，按接收、拉取、扫描的顺序推进，`ready` 之后进入发布流程。 */
export type IntakeState = 'received' | 'fetching' | 'scanning' | 'ready' | 'failed' | 'cancelled';

/** {@link uploadIntakeRequestSchema} 的输入侧类型；`requires_api_key`、`version_mode` 等可省略。 */
export type UploadIntakeRequest = z.input<typeof uploadIntakeRequestSchema>;

/**
 * 导入进度：`progress` 至少一步，按 `started_at` 记录各阶段开始时间；
 * `finished_at` 与错误字段仅在处理结束后填充，未结束时为 `null`。
 */
export const intakeProgressResponseSchema = z.strictObject({
  id: uuidSchema,
  state: z.enum(['received', 'fetching', 'scanning', 'ready', 'failed', 'cancelled']),
  phase: z.string(),
  progress: z
    .array(
      z.strictObject({
        step: z.enum(['received', 'fetching', 'scanning', 'snapshot']),
        started_at: z.iso.datetime(),
      }),
    )
    .min(1),
  finished_at: z.iso.datetime().nullable(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
});

/** {@link intakeProgressResponseSchema} 的输出侧类型，供轮询接口返回。 */
export type IntakeProgressResponse = z.infer<typeof intakeProgressResponseSchema>;
