import { sql, type SQL } from 'drizzle-orm';
import {
  exchangeRecordSchema,
  parseAiRecord,
  type AiRecordMap,
  type AiTable,
} from '@capability-hub/ai/records';

/** jsonb 不接受 NUL 或单个代理码元。仅异常正文再编码一层，授权引用仍可独立投影。 */
function exchangeData(row: AiRecordMap['ai_exchanges']) {
  const data = JSON.stringify(row);
  if (!/\\u(?:0000|d[89a-f][\da-f]{2})/iu.test(data)) return data;
  const { request, response, ...refs } = row.payload;
  return JSON.stringify({
    ...row,
    payload: { ...refs, body_json: JSON.stringify([request, response]) },
  });
}

/** 正文的存储编码不属于调用契约；还原请求和响应后，与普通记录使用同一套校验。 */
export function readAiRecord<K extends AiTable>(table: K, data: AiRecordMap[AiTable]) {
  const payload = data.payload;
  if (table === 'ai_exchanges' && 'body_json' in payload && typeof payload.body_json === 'string') {
    const { body_json: body, ...refs } = payload;
    const parts: unknown = JSON.parse(body);
    if (!Array.isArray(parts) || parts.length !== 2) throw new Error('模型原文编码无效');
    const [request, response] = parts as unknown[];
    return parseAiRecord(table, {
      ...data,
      payload: { ...refs, request, response },
    });
  }
  return parseAiRecord(table, data);
}

/** 整段由同一事务连接的串行查询占用。普通嵌套 tx 会让可选写入的错误污染正式账本。 */
export async function retainExchange(
  record: AiRecordMap['ai_exchanges'],
  execute: (statement: SQL) => Promise<unknown>,
) {
  await execute(sql`savepoint retain_exchange`);
  try {
    const row = exchangeRecordSchema.parse(record);
    const subject = row.lookup_key
      ? sql`and exists (select 1 from versions where id = ${row.lookup_key})`
      : sql``;
    await execute(sql`insert into ai_exchanges (id, data)
      select ${row.id}, ${exchangeData(row)} where exists (
        select 1 from ai_executions where id = ${row.execution_id} and owner_id = ${row.owner_id}
      ) ${subject}`);
  } catch {
    await execute(sql`rollback to savepoint retain_exchange`);
  }
  await execute(sql`release savepoint retain_exchange`);
}

/** Worker 以满批作为可能仍有积压的信号，下轮继续清理而不进入冷却。 */
export const exchangePurgeBatchSize = 500;

/** 截止时刻本身已到期；关闭留存时传 null，整批删除不受采集时刻限制。 */
export function expiredExchangeIds(through: number | null) {
  return sql`id in (select id from ai_exchanges where status = 'stored'
    ${through === null ? sql`` : sql`and position <= ${through}`}
    order by position, id limit ${exchangePurgeBatchSize})`;
}
