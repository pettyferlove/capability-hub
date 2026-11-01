import { z } from 'zod';
import { createHash } from 'node:crypto';
import { AiError } from './errors.js';

/**
 * 单个模型端点的配置。`base_url` 必须是 API 前缀而不是具体操作地址：不允许内嵌凭据、查询或片段，
 * 也不接受以 `/messages`、`/chat/completions`、`/responses` 结尾（这些由 provider 适配器自行拼接）；
 * 明文 HTTP 必须显式打开 `allow_http`。
 * 凭据只以 `credential_ref`（大写环境变量式名称）引用，由 `CredentialResolver` 在调用时解析，
 * 配置本身从不持有密钥。`max_output_tokens` 128–32768（默认 4096），`request_timeout_ms`
 * 1000–120000（默认 60000）——超时是单次请求上限，不含排队与重试。
 */
export const modelProfileSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    label: z.string().min(1).max(100),
    format: z.enum(['openai', 'anthropic']),
    base_url: z.url(),
    model: z.string().min(1).max(200),
    credential_ref: z.string().regex(/^[A-Z][A-Z0-9_]{1,127}$/),
    allow_http: z.boolean().default(false),
    max_output_tokens: z.number().int().min(128).max(32768).default(4096),
    request_timeout_ms: z.number().int().min(1000).max(120000).default(60000),
  })
  .strict()
  .superRefine((profile, ctx) => {
    const url = new URL(profile.base_url);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      (url.protocol === 'http:' && !profile.allow_http) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      /\/(messages|chat\/completions|responses)\/?$/.test(url.pathname)
    )
      ctx.addIssue({
        code: 'custom',
        message: '模型地址必须为受信 API 前缀，HTTP 需显式允许，不接受凭据、查询或操作路径',
      });
  });
/** 解析后的模型配置；该值会被 {@link digest} 固化进执行的 `model_digest`，改动即视为另一套配置。 */
export type ModelProfile = z.infer<typeof modelProfileSchema>;
/**
 * 单个 MCP 端点配置。`url` 同样只接受不带凭据、查询与片段的 HTTP(S) 地址，明文需 `allow_http`；
 * `read_only_tools` 是显式白名单（1–30 项），只有列出的工具会被暴露给模型——不在名单里的工具
 * 既不列目录也不可调用，工具本身还必须声明 `readOnlyHint`。`credential_ref` 缺省表示匿名连接。
 */
export const mcpEndpointSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/),
    url: z.url(),
    credential_ref: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{1,127}$/)
      .optional(),
    allow_http: z.boolean().default(false),
    read_only_tools: z.array(z.string().min(1).max(100)).min(1).max(30),
  })
  .strict()
  .superRefine((endpoint, ctx) => {
    const url = new URL(endpoint.url);
    if (
      !['https:', 'http:'].includes(url.protocol) ||
      (url.protocol === 'http:' && !endpoint.allow_http) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      ctx.addIssue({
        code: 'custom',
        message: 'MCP 需要显式配置的 HTTP(S) 地址，不接受内嵌凭据或查询参数',
      });
  });
/** 解析后的 MCP 端点配置；`read_only_tools` 的取值决定该端点上可用的工具集合。 */
export type McpEndpoint = z.infer<typeof mcpEndpointSchema>;
/**
 * 运行时配额与端点清单。所有上限都是硬上限，超出即拒绝而不是截断：`max_requests` 1–500（默认 96，
 * 单次执行的 provider 调用数）、`max_tools` 1–1000（默认 200，单次执行的工具调用数）、
 * `max_event_bytes` 默认 10 MB（事件流累计字节，耗尽后只放行 `execution.failed`/`cancelled`/
 * `timed_out` 终态事件）、`execution_timeout_ms` 默认 24 小时
 * （`payload.deadline` 的基准，跨进程恢复后仍有效）、`active_timeout_ms` 默认 10 分钟
 * （单轮执行的实际运行时限，每轮重新计）、`max_continuations` 1–20（默认 8，人工交互轮数）。
 * ID 必须唯一；配置了 profiles 时 `default_profile` 必须指向其中之一。
 */
export const aiConfigurationSchema = z
  .object({
    mcp_endpoints: z.array(mcpEndpointSchema).max(20).default([]),
    profiles: z.array(modelProfileSchema).max(20).default([]),
    default_profile: z.string().default(''),
    max_requests: z.number().int().min(1).max(500).default(96),
    max_tools: z.number().int().min(1).max(1000).default(200),
    max_event_bytes: z.number().int().min(65536).max(20_000_000).default(10_000_000),
    execution_timeout_ms: z.number().int().min(1000).max(86_400_000).default(86_400_000),
    active_timeout_ms: z.number().int().min(1000).max(600_000).default(600_000),
    max_continuations: z.number().int().min(1).max(20).default(8),
  })
  .strict()
  .superRefine((config, ctx) => {
    if (
      new Set(config.mcp_endpoints.map((endpoint) => endpoint.id)).size !==
      config.mcp_endpoints.length
    )
      ctx.addIssue({ code: 'custom', message: 'MCP 配置 ID 不能重复' });
    if (new Set(config.profiles.map((p) => p.id)).size !== config.profiles.length)
      ctx.addIssue({ code: 'custom', message: '模型配置 ID 不能重复' });
    if (config.profiles.length && !config.profiles.some((p) => p.id === config.default_profile))
      ctx.addIssue({ code: 'custom', message: '默认模型配置不存在' });
  });
/** 解析后的运行时配置；构造 `AiRuntime` 时会再次解析，因此本类型只表示已通过校验的取值。 */
export type AiConfiguration = z.infer<typeof aiConfigurationSchema>;
/**
 * 规范化 JSON 后取小写十六进制 SHA-256：对象键排序、数组顺序保留，因此同一语义内容在不同进程、
 * 不同键序下得到相同摘要。用于 `definition_digest`/`model_digest`/`request_digest` 等恢复期比对，
 * 不作为安全边界。
 */
export function digest(value: unknown): string {
  const canonical = (v: unknown): string => {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object')
      return (
        '{' +
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, item]) => JSON.stringify(k) + ':' + canonical(item))
          .join(',') +
        '}'
      );
    return JSON.stringify(v) ?? 'null';
  };
  return createHash('sha256').update(canonical(value)).digest('hex');
}
/**
 * 按 ID 取模型配置；缺省或未知 ID 一律抛 `AiError('AI_CONFIGURATION')`，不回落到默认端点，
 * 避免配置漂移被静默掩盖。
 */
export function profileFor(config: AiConfiguration, id: string): ModelProfile {
  const profile = config.profiles.find((p) => p.id === id);
  if (!profile) throw new AiError('AI_CONFIGURATION', '模型配置不可用');
  return profile;
}
