import { z } from 'zod';
import { createHash } from 'node:crypto';
import { AiError } from './errors.js';

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
export type ModelProfile = z.infer<typeof modelProfileSchema>;
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
export type McpEndpoint = z.infer<typeof mcpEndpointSchema>;
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
export type AiConfiguration = z.infer<typeof aiConfigurationSchema>;
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
export function profileFor(config: AiConfiguration, id: string): ModelProfile {
  const profile = config.profiles.find((p) => p.id === id);
  if (!profile) throw new AiError('AI_CONFIGURATION', '模型配置不可用');
  return profile;
}
