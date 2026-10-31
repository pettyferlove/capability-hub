import type { LogContext } from '@capability-hub/logging/server';
import { OAuthError } from '@capability-hub/application';
import { HubError } from '@capability-hub/domain/errors';
import type { Express } from 'express';
import { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { type RequestMetrics } from '../../observability/operations.js';
/** 统一处理 API、上传和用例错误，内部异常只写入脱敏日志。 */
export function registerErrorHandler(
  app: Express,
  metrics: RequestMetrics,
  logs: LogContext,
): void {
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let e =
      error instanceof OAuthError
        ? new HubError(error.status, error.code.toUpperCase(), error.message)
        : error instanceof HubError
          ? error
          : error instanceof ZodError
            ? new HubError(422, 'VALIDATION_ERROR', '请检查输入字段', error.flatten())
            : error instanceof multer.MulterError
              ? new HubError(413, 'UPLOAD_LIMIT', '上传超过大小、文件数或字段限制')
              : new HubError(500, 'INTERNAL_ERROR', '服务暂时无法完成请求');
    if (
      (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) ||
      (error && typeof error === 'object' && 'code' in error && error.code === '23505')
    )
      e = new HubError(409, 'RESOURCE_CONFLICT', '名称或记录已存在');
    if (error && typeof error === 'object' && 'type' in error) {
      if (error.type === 'entity.too.large')
        e = new HubError(413, 'PAYLOAD_LIMIT', '请求超过大小限制');
      else if (error.type === 'entity.parse.failed')
        e = new HubError(400, 'INVALID_JSON', 'JSON 格式无效');
    }
    metrics.error(e.code);
    if (res.locals.identity_refresh_failed) metrics.error('IDENTITY_REFRESH_FAILED');
    if (e.status >= 500)
      logs.logger.error({
        event: 'http.error',
        err: error,
        code: e.code,
        request_id: res.locals.request_id,
      });
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.status(e.status).json({
      error: {
        code: e.code,
        message: e.message,
        request_id: res.locals.request_id,
        retryable: e.retryable,
        details: e.details,
      },
    });
  });
}
