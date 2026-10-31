import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  pino,
  type Bindings,
  type ChildLoggerOptions,
  type DestinationStream,
  type Logger,
  type LevelWithSilent,
} from 'pino';
import { pinoHttp } from 'pino-http';
import { safeError, safeText, sanitize } from './events.js';
export type { Logger, LevelWithSilent } from 'pino';

export interface LoggingOptions {
  service: string;
  level?: LevelWithSilent;
  environment?: string;
  destination?: DestinationStream;
}
function requestFields(value: unknown) {
  const req = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const route =
    req.route && typeof req.route === 'object' ? (req.route as Record<string, unknown>) : {};
  return {
    method: typeof req.method === 'string' ? req.method : 'unknown',
    route: typeof route.path === 'string' ? route.path : 'unmatched',
  };
}
function responseFields(value: unknown) {
  const res = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return { status: typeof res.statusCode === 'number' ? res.statusCode : undefined };
}
export function createLogger(options: LoggingOptions): Logger {
  const logger = pino(
    {
      level: options.level ?? 'info',
      base: { service: options.service, environment: options.environment ?? 'development' },
      timestamp: pino.stdTimeFunctions.isoTime,
      hooks: {
        logMethod(args, method) {
          if (args[0] instanceof Error) args[0] = { err: args[0] };
          if (args.length === 1 && args[0] && typeof args[0] === 'object' && 'err' in args[0])
            args.push('diagnostic.error');
          for (let index = 0; index < args.length; index++) {
            const value = args[index];
            if (typeof value === 'string') args[index] = safeText(value);
            else if (index > 0) args[index] = sanitize(value);
          }
          method.apply(this, args);
        },
      },
      serializers: {
        req: requestFields,
        res: responseFields,
        err: (value: unknown) => (value instanceof Error ? safeError(value) : sanitize(value)),
      },
      formatters: {
        bindings: (value) => sanitize(value) as Record<string, unknown>,
        log: (value: Record<string, unknown>) => {
          const { req, res, err, ...fields } = value;
          return {
            ...(sanitize(fields) as Record<string, unknown>),
            ...(req ? { req } : {}),
            ...(res ? { res } : {}),
            ...(err ? { err } : {}),
          };
        },
      },
      redact: {
        paths: [
          'password',
          'secret',
          'token',
          'authorization',
          'cookie',
          '*.password',
          '*.secret',
          '*.token',
          '*.authorization',
          '*.cookie',
        ],
        censor: '[REDACTED]',
      },
    },
    options.destination,
  );
  // Pino 会重置子日志的绑定格式化器，需要同时约束 child 和 setBindings 的输入。
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 下方用 call 绑定当前日志实例，子日志必须保留自己的上下文。
  const child = logger.child;
  logger.child = function <Levels extends string = never>(
    this: Logger,
    bindings: Bindings,
    childOptions?: ChildLoggerOptions<Levels>,
  ): Logger<Levels> {
    const { req, res, err, ...fields }: Record<string, unknown> = bindings;
    const factory = child<Levels>;
    return factory.call(
      this,
      {
        ...(sanitize(fields) as Bindings),
        ...(req ? { req } : {}),
        ...(res ? { res } : {}),
        ...(err ? { err } : {}),
      },
      childOptions,
    );
  };
  // eslint-disable-next-line @typescript-eslint/unbound-method -- call 保留调用实例，不能把子日志的绑定写进根日志。
  const setBindings = logger.setBindings;
  logger.setBindings = function (this: Logger, bindings: Bindings) {
    setBindings.call(this, sanitize(bindings) as Bindings);
  };
  return logger;
}

/** 每个应用实例独立维护异步日志上下文。 */
export class LogContext {
  private readonly storage = new AsyncLocalStorage<Logger>();
  constructor(readonly root: Logger) {}
  get logger(): Logger {
    return this.storage.getStore() ?? this.root;
  }
  run<T>(bindings: Record<string, unknown>, work: () => T): T {
    return this.storage.run(this.logger.child(sanitize(bindings) as Record<string, unknown>), work);
  }
  http(enabled = true) {
    const middleware = pinoHttp({
      logger: this.root,
      autoLogging: enabled
        ? { ignore: (req) => req.url === '/health/live' || req.url === '/health/ready' }
        : false,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customAttributeKeys: { reqId: 'request_id' },
      quietReqLogger: true,
      quietResLogger: true,
      wrapSerializers: false,
      serializers: {
        req: requestFields,
        res: responseFields,
        err: safeError,
      },
      customSuccessObject: (req, res, value: Record<string, unknown>) => ({
        ...value,
        req,
        event: 'http.request',
        aborted: !res.writableFinished,
      }),
      customErrorObject: (req, res, _error, value: Record<string, unknown>) => ({
        ...value,
        req,
        event: 'http.request',
        aborted: !res.writableFinished,
      }),
      customLogLevel: (_req, res, error) =>
        error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      customSuccessMessage: () => 'http.request',
      customErrorMessage: () => 'http.request',
    });
    return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
      middleware(req, res);
      this.storage.run(req.log, next);
    };
  }
}
