import { z } from 'zod';
import { AiError, type ExecutionRecord } from '@capability-hub/ai';
import { fail } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type { HttpContext } from '../context.js';

/** 游标按持久化位置和执行 ID 跨页定位。 */
export type ExecutionCursor = Pick<ExecutionRecord, 'position' | 'id'>;

/** 只编码最后一条可继续分页的记录。 */
export function encodeCursor(row?: ExecutionCursor) {
  return row
    ? Buffer.from(JSON.stringify({ position: row.position, id: row.id })).toString('base64url')
    : null;
}

/** 授权不足和资源不可见都从列表中过滤，其他读取错误继续上报。 */
export async function canInspect(
  hub: HttpContext['hub'],
  principal: Principal,
  row: ExecutionRecord,
) {
  try {
    await hub.ai.principal(principal, row, true);
    return true;
  } catch (error) {
    if (error instanceof AiError && ['AI_FORBIDDEN', 'AI_NOT_FOUND'].includes(error.code))
      return false;
    throw error;
  }
}

/** 查询字段只接受整数位置与执行 ID，非法游标交给 HTTP 错误处理。 */
export function decodeCursor(cursor?: string): ExecutionCursor | undefined {
  if (!cursor) return;
  let data: unknown;
  try {
    data = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
  } catch {
    fail(422, 'AI_CURSOR_INVALID', '列表游标无效');
  }
  return z.object({ position: z.number().int().nonnegative(), id: z.uuid() }).strict().parse(data);
}
