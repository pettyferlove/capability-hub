import { join } from 'node:path';
import { CommanderError } from 'commander';
import { ZodError } from 'zod';
import {
  hubFeedbackLastFailureSchema,
  type HubFeedbackLastFailure,
} from '@capability-hub/contracts';
import { HubError } from '@capability-hub/domain/errors';
import { HubApiError, httpOrigin, redactCredentials } from './api-client.js';
import { CliCancelled } from './cli-ui.js';
import { loadPrivateJson, savePrivateJson } from './private-json.js';

const filename = 'last-failure.json';
const maxBytes = 16 * 1024;
const resourceName = /^[a-z0-9][a-z0-9._-]{0,239}$/;

function diagnosticMessage(message: string): string {
  return redactCredentials(message)
    .replace(/\b(?:https?|ftp):\/\/[^\s<>"']+/gi, '[地址已隐藏]')
    .replace(/(?:[A-Za-z]:[\\/]|\\\\|\/|\.\.?[\\/])[^\s<>"']+/g, '[路径已隐藏]')
    .replace(/\b[A-Z_][A-Z0-9_]*\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/g, '[配置已隐藏]')
    .slice(0, 500);
}

function safeArguments(values: readonly string[]): string[] {
  return values
    .filter((value) => resourceName.test(value) && redactCredentials(value) === value)
    .slice(0, 10);
}

export async function readLastFailure(
  directory: string,
): Promise<HubFeedbackLastFailure | undefined> {
  try {
    const result = hubFeedbackLastFailureSchema.safeParse(
      await loadPrivateJson(join(directory, filename)),
    );
    if (!result.success) return undefined;
    return {
      ...result.data,
      arguments: safeArguments(result.data.arguments),
      message: diagnosticMessage(result.data.message),
    };
  } catch {
    return undefined;
  }
}

export async function recordLastFailure(
  directory: string,
  context: {
    command: string;
    options: readonly string[];
    arguments: readonly string[];
    origin?: string;
  },
  error: unknown,
): Promise<void> {
  if (error instanceof CommanderError) return;
  try {
    const api = error instanceof HubApiError ? error : undefined;
    const code = error instanceof HubError || error instanceof HubApiError ? error.code : undefined;
    const { shape } = hubFeedbackLastFailureSchema;
    const result = hubFeedbackLastFailureSchema.safeParse({
      at: new Date().toISOString(),
      command: context.command,
      options: [
        ...new Set(context.options.filter((value) => /^--[a-z0-9-]{1,40}$/.test(value))),
      ].slice(0, 40),
      arguments: safeArguments(context.arguments),
      exit_code: error instanceof CliCancelled ? 130 : 1,
      status: shape.status.safeParse(api?.status).data,
      code: shape.code.safeParse(code && redactCredentials(code) === code ? code : undefined).data,
      request_id: shape.request_id.safeParse(api?.requestId).data,
      message: diagnosticMessage(
        error instanceof ZodError
          ? '数据格式无效'
          : error instanceof SyntaxError
            ? '数据解析失败'
            : error instanceof Error
              ? error.message
              : 'CLI 执行失败',
      ),
      hub_origin: api?.origin ?? httpOrigin(context.origin),
    });
    if (!result.success || Buffer.byteLength(JSON.stringify(result.data)) > maxBytes) return;
    await savePrivateJson(join(directory, filename), result.data);
  } catch {
    // 诊断写入失败不能替换原命令错误。
  }
}
