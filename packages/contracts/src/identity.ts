import { z } from 'zod';

/** CLI 凭据文件：`url` 为 Hub 根地址，令牌不允许含任何空白字符。 */
export const cliCredentialsSchema = z
  .object({ url: z.url(), token: z.string().regex(/^\S+$/) })
  .strict();
/** {@link cliCredentialsSchema} 解析后的输出侧类型。 */
export type CliCredentials = z.infer<typeof cliCredentialsSchema>;

/**
 * 登录时由 User-Agent 解析出的展示信息，只用于会话列表，不作为设备身份或认证依据。
 * 浏览器与系统都识别不出时整体为 `null`，因此 `SessionResponse.client` 是可空字段。
 */
export interface SessionClientInfo {
  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

/**
 * 角色授予的作用域层级；`platform` 的 `scope_id` 必须为空串，其余层级须指向已存在的实体。
 */
export type ScopeType = 'platform' | 'team' | 'source' | 'asset' | 'scenario';

/**
 * 用户名：3–64 字符，须以字母或数字开头，随后允许 `_ . @ -`；解析后统一转小写，
 * 因此大小写不同的输入视为同一账号。
 */
export const usernameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/)
  .transform((value) => value.toLowerCase());
/** 密码：12–256 字符，不做去空白处理，长度按原始字符计算。 */
export const passwordSchema = z.string().min(12, '密码至少 12 位').max(256);
/** 首次初始化请求；严格模式拒绝未知字段，用户名经 {@link usernameSchema} 归一化。 */
export const setupRequestSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    display_name: z.string().trim().min(1).max(80),
    team_name: z.string().trim().min(1).max(80),
  })
  .strict();
/** HTTP 初始化请求：在 {@link setupRequestSchema} 基础上追加一次性 `setup_token`，仅在要求时校验。 */
export const setupHttpRequestSchema = setupRequestSchema.extend({
  setup_token: z.string().optional(),
});
/** 登录请求：只限制长度不做归一化，用户名大小写由账号侧统一处理。 */
export const loginRequestSchema = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(256),
  })
  .strict();
/** 修改密码请求：`current_password` 允许为空串以便错误密码返回 401 而非 400。 */
export const changePasswordRequestSchema = z
  .object({
    current_password: z.string().max(256),
    new_password: passwordSchema,
  })
  .strict();
/** 签发令牌请求：`scope` 默认 `hub:read`，提权到 `hub:contribute` 须显式指定。 */
export const issueTokenRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scope: z.enum(['hub:read', 'hub:contribute']).default('hub:read'),
  })
  .strict();
/** CLI 登录发起请求：`challenge` 为 64 位小写十六进制的 PKCE 挑战。 */
export const cliLoginRequestSchema = z
  .object({ challenge: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
/** CLI 登录确认请求：`code` 为 8 位大写十六进制的用户确认码。 */
export const approveCliLoginRequestSchema = z
  .object({ code: z.string().regex(/^[A-F0-9]{8}$/) })
  .strict();
/** CLI 登录轮询请求：`verifier` 为 32–128 字符的 PKCE 原文，须与发起时的挑战配对。 */
export const pollCliLoginRequestSchema = z
  .object({
    device_code: z.string().min(1).max(128),
    verifier: z.string().min(32).max(128),
  })
  .strict();

/** {@link setupRequestSchema} 的输入侧类型；用户名此时仍是原始大小写。 */
export type SetupRequest = z.input<typeof setupRequestSchema>;
/** {@link loginRequestSchema} 的输入侧类型。 */
export type LoginRequest = z.input<typeof loginRequestSchema>;
/** {@link changePasswordRequestSchema} 的输入侧类型。 */
export type ChangePasswordRequest = z.input<typeof changePasswordRequestSchema>;
/** {@link issueTokenRequestSchema} 的输入侧类型，`scope` 可省略。 */
export type IssueTokenRequest = z.input<typeof issueTokenRequestSchema>;
/** {@link cliLoginRequestSchema} 的输入侧类型。 */
export type CliLoginRequest = z.input<typeof cliLoginRequestSchema>;
/** {@link approveCliLoginRequestSchema} 的输入侧类型。 */
export type ApproveCliLoginRequest = z.input<typeof approveCliLoginRequestSchema>;
/** {@link pollCliLoginRequestSchema} 的输入侧类型。 */
export type PollCliLoginRequest = z.input<typeof pollCliLoginRequestSchema>;
