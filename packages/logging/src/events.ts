export const browserEvents = [
  'runtime.error',
  'runtime.rejection',
  'react.error',
  'http.failed',
] as const;
export type BrowserEvent = (typeof browserEvents)[number];
export interface BrowserLogEntry {
  event: BrowserEvent;
  level: 'warn' | 'error';
  time: number;
  page: string;
  request_id?: string;
  status?: number;
  code?: string;
  error?: { type: string; stack?: string };
}
export interface BrowserLogBatch {
  session_id: string;
  entries: BrowserLogEntry[];
}

const sensitiveKey =
  /password|passwd|secret|token|authorization|cookie|credential|passphrase|encrypted|private.?key|setup.?key|api.?key|access.?key|code.?verifier/i;
/** 诊断字符串中的 URL 也移除账号、查询参数和片段。 */
export function safeText(value: string, limit = 2000): string {
  return value
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)]+/gi, (value) => {
      try {
        const url = new URL(value);
        return url.protocol + '//' + url.host + url.pathname;
      } catch {
        return '[url]';
      }
    })
    .replace(/(Bearer|Basic)\s+[^\s,;]+/gi, '$1 [REDACTED]')
    .replace(
      /\b(password|secret|token|authorization|cookie|passphrase|api[_-]?key|access[_-]?key)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s&;,]+)/gi,
      '$1=[REDACTED]',
    )
    .slice(0, limit);
}
export interface SafeError {
  type: string;
  code?: string;
  stack?: string;
  cause?: SafeError;
}
export function safeError(error: unknown, depth = 0): SafeError {
  if (!(error instanceof Error)) return { type: 'UnknownError' };
  const code =
    'code' in error && typeof error.code === 'string' ? safeText(error.code, 80) : undefined;
  return {
    type: safeText(error.name, 80),
    ...('cause' in error && error.cause instanceof Error && depth < 2
      ? { cause: safeError(error.cause, depth + 1) }
      : {}),
    ...(code ? { code } : {}),
    // 异常消息可能包含 SQL、输入或凭据，只保留调用位置。
    stack: safeText(
      (error.stack ?? '')
        .split('\n')
        .filter((line) => /^\s*at /.test(line))
        .slice(0, 12)
        .join('\n'),
      4000,
    ),
  };
}
export function sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (depth > 8) return '[depth]';
  if (value instanceof Error) return safeError(value);
  if (typeof value === 'string') return safeText(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return '[unsupported]';
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value))
    return value.slice(0, 100).map((item) => sanitize(item, depth + 1, seen));
  try {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          sensitiveKey.test(key) ? '[REDACTED]' : sanitize(item, depth + 1, seen),
        ]),
    );
  } catch {
    return '[unserializable]';
  }
}
