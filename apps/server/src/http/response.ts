import type { NextFunction, Request, Response } from 'express';

/** 请求体和查询参数从 unknown 开始，在应用边界按契约校验。 */
export const jsonRoute =
  (
    handler: (
      request: Request<
        Record<string, string | string[]>,
        unknown,
        unknown,
        Record<string, unknown>
      >,
      response: Response,
    ) => unknown,
  ) =>
  async (
    request: Request<Record<string, string | string[]>, unknown, unknown, Record<string, unknown>>,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await handler(request, response);
      if (!response.headersSent) response.json(result);
    } catch (error) {
      next(error);
    }
  };

/** 原样透传 `Idempotency-Key`；缺失时返回 undefined，由服务层决定是否要求。 */
export const idempotencyKey = (request: Pick<Request, 'get'>): string | undefined =>
  request.get('Idempotency-Key');

/** 把记录的 `revision` 写成带引号的 `ETag`，客户端下次请求原样回填到 `If-Match`。 */
export function withRevision<T extends { revision: number }>(response: Response, record: T): T {
  response.set('ETag', `"${record.revision}"`);
  return record;
}
