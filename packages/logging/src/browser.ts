import pino from 'pino';
import {
  safeError,
  type BrowserEvent,
  type BrowserLogBatch,
  type BrowserLogEntry,
} from './events.js';
export interface BrowserLoggingOptions {
  endpoint?: string;
  sessionId?: string;
  send?: (batch: BrowserLogBatch) => Promise<void>;
}

/** 收集器失败时丢弃当前批次，避免重试或递归报告引发额外负载。 */
export function createBrowserLogTransport(
  send: (batch: BrowserLogBatch) => Promise<void>,
  sessionId: string,
) {
  const queue: BrowserLogEntry[] = [];
  let pending: Promise<void> | undefined;
  let windowStart = Date.now(),
    count = 0;
  return {
    enqueue(entry: BrowserLogEntry) {
      if (Date.now() - windowStart >= 60000) {
        windowStart = Date.now();
        count = 0;
      }
      if (count++ >= 30 || queue.length >= 30) return;
      queue.push(entry);
    },
    flush: (): Promise<void> => {
      if (pending) return pending;
      if (!queue.length) return Promise.resolve();
      const entries: BrowserLogEntry[] = [];
      while (queue.length && entries.length < 10) {
        const entry = queue[0];
        const bytes = new TextEncoder().encode(
          JSON.stringify({ session_id: sessionId, entries: [...entries, entry] }),
        ).byteLength;
        if (bytes > 30 * 1024) {
          if (!entries.length) queue.shift();
          break;
        }
        entries.push(queue.shift()!);
      }
      if (!entries.length) return Promise.resolve();
      pending = Promise.resolve()
        .then(() => send({ session_id: sessionId, entries }))
        .catch(() => {})
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
  };
}

export function installBrowserLogging(options: BrowserLoggingOptions = {}) {
  const endpoint = options.endpoint ?? '/telemetry/browser';
  const transport = createBrowserLogTransport(
    options.send ??
      (async (batch) => {
        await fetch(endpoint, {
          method: 'POST',
          credentials: 'omit',
          keepalive: true,
          signal: AbortSignal.timeout(5000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        });
      }),
    options.sessionId ?? crypto.randomUUID(),
  );
  const logger = pino({
    level: 'warn',
    browser: {
      asObject: true,
      write: () => {},
      transmit: {
        level: 'warn',
        send: (_level, event) => {
          const entry = event.messages[0] as BrowserLogEntry;
          transport.enqueue(entry);
        },
      },
    },
  });
  const report = (
    event: BrowserEvent,
    detail: { error?: unknown; requestId?: string; status?: number; code?: string } = {},
  ) => {
    const captured = detail.error !== undefined ? safeError(detail.error) : undefined;
    const entry: BrowserLogEntry = {
      event,
      level: event === 'http.failed' ? 'warn' : 'error',
      time: Date.now(),
      // 只记录固定页面名，排除资源标识和查询内容。
      page: ['/', '/discover', '/publish', '/review', '/sources', '/connect', '/account'].includes(
        location.pathname,
      )
        ? location.pathname
        : '/resource',
      ...(captured ? { error: { type: captured.type, stack: captured.stack } } : {}),
      ...(detail.requestId && /^[a-f0-9-]{36}$/.test(detail.requestId)
        ? { request_id: detail.requestId }
        : {}),
      ...(detail.status ? { status: detail.status } : {}),
      ...(detail.code && /^[A-Z0-9_]{1,80}$/.test(detail.code) ? { code: detail.code } : {}),
    };
    logger[entry.level](entry);
  };
  const error = (event: ErrorEvent) => report('runtime.error', { error: event.error });
  const rejection = (event: PromiseRejectionEvent) =>
    report('runtime.rejection', { error: event.reason });
  const flush = () => {
    void transport.flush();
  };
  window.addEventListener('error', error);
  window.addEventListener('unhandledrejection', rejection);
  window.addEventListener('pagehide', flush);
  const timer = setInterval(flush, 5000);
  return {
    report,
    flush: transport.flush,
    dispose() {
      clearInterval(timer);
      window.removeEventListener('error', error);
      window.removeEventListener('unhandledrejection', rejection);
      window.removeEventListener('pagehide', flush);
    },
  };
}
