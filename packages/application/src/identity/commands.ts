import { z } from 'zod';

/** 本地建号与目录登录共用用户名边界，避免同名账号按不同规则归一化。 */
export const usernameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/)
  .transform((value) => value.toLowerCase());

/**
 * 首次初始化输入，来自 HTTP 的 JSON body（`setupRequestSchema` 解析），
 * 只在系统尚无任何用户时可调用，否则 409/`ALREADY_INITIALIZED`。
 */
export interface SetupCommand {
  /** 3–64 位，契约层已转为小写；落库后大小写不再区分。 */
  username: string;
  /** 12–256 位；只保存 scrypt 哈希，明文不落库也不进审计。 */
  password: string;
  /** 1–80 字符，仅用于展示。 */
  display_name: string;
  /** 1–80 字符；初始化时同时创建该团队并授予调用者平台 `admin` 与该团队 `maintainer`。 */
  team_name: string;
}

/**
 * 访问令牌签发输入，来自 HTTP 的 JSON body（`issueTokenRequestSchema` 解析）；
 * 明文令牌只在签发响应里出现一次，存储侧只保留 SHA-256。
 */
export interface IssueTokenCommand {
  /** 1–80 字符，用于在令牌列表里区分用途。 */
  name: string;
  /** 默认 `hub:read`；`hub:contribute` 决定是否可在 MCP 中调用贡献工具。 */
  scope?: 'hub:read' | 'hub:contribute';
}

/**
 * CLI 登录发起的输入，来自 CLI 的 HTTP 请求体（`cliLoginRequestSchema` 解析）；
 * 挑战值由 CLI 本地生成，服务端不保存 verifier 明文。
 */
export interface CliLoginCommand {
  /** PKCE 风格的 64 位小写十六进制挑战，轮询时用 verifier 复核。 */
  challenge: string;
}

/**
 * 网页批准 CLI 登录的输入，来自 HTTP 的 JSON body（`approveCliLoginRequestSchema` 解析）。
 */
export interface ApproveCliLoginCommand {
  /**
   * 8 位大写十六进制用户码；仅 `pending` 且未过期（10 分钟）时可批准，
   * 否则 400/`CLI_LOGIN_EXPIRED`。
   */
  code: string;
}

/**
 * CLI 轮询取令牌的输入，来自 CLI 的 HTTP 请求体（`pollCliLoginRequestSchema` 解析）；
 * 每次轮询都在事务内消费授权，成功后状态变为 `consumed`，重复轮询 409/`CLI_LOGIN_USED`。
 */
export interface PollCliLoginQuery {
  /** 发起时下发的设备码，存储侧以其 SHA-256 作主键。 */
  device_code: string;
  /** 对应 `challenge` 的 verifier；不匹配按过期处理（400/`CLI_LOGIN_EXPIRED`）。 */
  verifier: string;
}
