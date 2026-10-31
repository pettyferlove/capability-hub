import { z } from 'zod';

export const cliCredentialsSchema = z
  .object({ url: z.string().url(), token: z.string().regex(/^\S+$/) })
  .strict();
export type CliCredentials = z.infer<typeof cliCredentialsSchema>;

export interface SessionClientInfo {
  browser_name: string | null;
  browser_version: string | null;
  os_name: string | null;
  device_type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
}

export type ScopeType = 'platform' | 'team' | 'source' | 'asset' | 'scenario';

export const usernameSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.@-]*$/)
  .transform((value) => value.toLowerCase());
export const passwordSchema = z.string().min(12, '密码至少 12 位').max(256);
export const setupRequestSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    display_name: z.string().trim().min(1).max(80),
    team_name: z.string().trim().min(1).max(80),
  })
  .strict();
export const setupHttpRequestSchema = setupRequestSchema.extend({
  setup_token: z.string().optional(),
});
export const loginRequestSchema = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(256),
  })
  .strict();
export const changePasswordRequestSchema = z
  .object({
    current_password: z.string().max(256),
    new_password: passwordSchema,
  })
  .strict();
export const issueTokenRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    scope: z.enum(['hub:read', 'hub:contribute']).default('hub:read'),
  })
  .strict();
export const cliLoginRequestSchema = z
  .object({ challenge: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const approveCliLoginRequestSchema = z
  .object({ code: z.string().regex(/^[A-F0-9]{8}$/) })
  .strict();
export const pollCliLoginRequestSchema = z
  .object({
    device_code: z.string().min(1).max(128),
    verifier: z.string().min(32).max(128),
  })
  .strict();

export type SetupRequest = z.input<typeof setupRequestSchema>;
export type LoginRequest = z.input<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.input<typeof changePasswordRequestSchema>;
export type IssueTokenRequest = z.input<typeof issueTokenRequestSchema>;
export type CliLoginRequest = z.input<typeof cliLoginRequestSchema>;
export type ApproveCliLoginRequest = z.input<typeof approveCliLoginRequestSchema>;
export type PollCliLoginRequest = z.input<typeof pollCliLoginRequestSchema>;
