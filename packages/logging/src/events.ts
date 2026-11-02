/**
 * 浏览器入口只允许上报这四类事件；服务端按此白名单落库，新增取值必须同时更新两侧，
 * 未登记的来源错误不得借道旁路记录。
 */
export const browserEvents = [
  'runtime.error',
  'runtime.rejection',
  'react.error',
  'http.failed',
] as const;

/** 浏览器上报的事件名，取值来自 {@link browserEvents}；不在其中的事件会被服务端拒绝。 */
export type BrowserEvent = (typeof browserEvents)[number];

/** 固定页面名可写入日志，其余地址统一归入资源类别。 */
export const browserLogPages = [
  '/',
  '/discover',
  '/publish',
  '/review',
  '/connect',
  '/account',
  '/operations',
  '/resource',
] as const;

/**
 * 一条浏览器诊断记录。字段全部是结构化枚举或受限形态，正文类内容不再被二次清洗，
 * 因此进入队列前必须已完成脱敏。
 */
export interface BrowserLogEntry {
  event: BrowserEvent;
  /** `http.failed` 记 warn，其余记 error；不影响上报与否。 */
  level: 'warn' | 'error';
  /** 客户端毫秒时间戳，时钟不可信，只能用于展示排序，不能当作因果顺序。 */
  time: number;
  /** 仅限固定路由名（无匹配路径统一记为 `/resource`），不含资源标识与查询参数。 */
  page: string;
  /** UUID 形态才会上报，其余（含路径、查询串）一律丢弃。 */
  request_id?: string;
  status?: number;
  /** 大写下划线错误码，长度上限 80；不符合形态的值被丢弃。 */
  code?: string;
  /** 只保留错误类型与调用栈，不含 message。 */
  error?: { type: string; stack?: string };
}

/**
 * 一次上报批次。同一 `session_id` 的条目才会合并，发送端把单批控制在 30 KiB、10 条以内，
 * 服务端不应假定批次完整覆盖会话。
 */
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

/** 递归保留的错误视图；`cause` 最多下钻 2 层，更深的链路被丢弃以免日志膨胀。 */
export interface SafeError {
  type: string;
  code?: string;
  stack?: string;
  cause?: SafeError;
}

/**
 * 把任意异常收敛成可落盘视图：丢弃 `message`（可能含 SQL、输入或凭据），只留名称、错误码
 * 与调用栈。`code` 截断到 80 字符，`stack` 只保留 `at` 行、最多 12 行、4000 字符。
 */
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

/**
 * 递归清洗任意值后落盘：命中敏感键名（password/token/cookie/credential 等）的字段整值替换为
 * `[REDACTED]`，字符串走 {@link safeText}。边界为 8 层深度、100 个数组元素、100 个对象字段；
 * 超深记 `[depth]`，循环引用记 `[circular]`，函数/符号记 `[unsupported]`。
 */
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
