import { MastraError } from '@mastra/core/error';
import type { z } from 'zod';
import { AiError } from '../core/errors.js';

// 只传递校验位置和规则；不把模型原文、SDK 异常或资源内容写入错误及重试指令。

/**
 * 结构化输出不符合 Schema 时抛出，`code` 固定为 `AI_OUTPUT_INVALID`。
 * `hint` 只描述期望的字段与格式并用于重试指令：模型原文与资源内容不进错误消息。
 */
export class ReportFormatError extends AiError {
  constructor(
    readonly reason: 'invalid_fields' | 'incomplete_output' | 'output_limit',
    message: string,
    readonly hint: string,
  ) {
    super('AI_OUTPUT_INVALID', message);
  }
}

function decode(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function validate<T extends z.ZodType>(schema: T, candidate: unknown): z.infer<T> {
  const parsed = schema.safeParse(candidate);
  if (parsed.success) return parsed.data;
  // 仅按 Schema 明确指出的类型还原无歧义的 JSON 表示，不补字段、丢字段或猜枚举值。
  for (const issue of parsed.error.issues) {
    if (issue.code !== 'invalid_type' || !issue.path.length) continue;
    let node: unknown = candidate;
    for (const key of issue.path.slice(0, -1)) {
      if (!node || typeof node !== 'object' || !Object.hasOwn(node, key)) {
        node = undefined;
        break;
      }
      node = (node as Record<PropertyKey, unknown>)[key];
    }
    const key = issue.path.at(-1)!;
    if (!node || typeof node !== 'object' || !Object.hasOwn(node, key)) continue;
    const fields = node as Record<PropertyKey, unknown>;
    const raw = fields[key];
    if (typeof raw !== 'string') continue;
    const value = decode(raw);
    if (
      (issue.expected === 'number' &&
        Number.isSafeInteger(value) &&
        String(value) === raw.trim()) ||
      (issue.expected === 'boolean' && typeof value === 'boolean') ||
      (issue.expected === 'array' && Array.isArray(value)) ||
      (issue.expected === 'object' &&
        value !== null &&
        typeof value === 'object' &&
        !Array.isArray(value))
    )
      fields[key] = value;
  }
  const checked = schema.safeParse(candidate);
  if (checked.success) return checked.data;
  const hint = checked.error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path
        .filter((key) => /^(?:[a-z_]{1,48}|[0-9]{1,4})$/i.test(String(key)))
        .join('.')
        .slice(0, 100);
      return (
        (path || '$') +
        ': ' +
        (issue.code === 'invalid_type' ? 'expected ' + issue.expected : issue.code)
      );
    })
    .join('; ');
  throw new ReportFormatError('invalid_fields', '模型结构化结果的字段或类型不符合约定', hint);
}

/**
 * 读取模型的结构化结果并按 `schema` 校验，是唯一允许把模型输出转成业务类型的入口。
 *
 * 恢复策略刻意保守：只在 Schema 明确报出 `invalid_type` 的字段上，把「类型无歧义的 JSON 文本」
 * 还原成数字/布尔/数组/对象（不补字段、不丢字段、不猜枚举），随后重校验。
 * `read` 抛出的 MastraError 中，`STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED` 会取回原文（上限
 * 256000 字符）再判定。按模型停止原因区分输出用尽、内容过滤与未生成对象；
 * 修复提示只含固定指令或校验规则，不回传模型原文。
 */
export async function readStructured<T extends z.ZodType>(
  read: () => Promise<unknown>,
  schema: T,
  finishReason: string | undefined,
): Promise<z.infer<T>> {
  let candidate: unknown;
  try {
    candidate = await read();
  } catch (error) {
    if (!(error instanceof MastraError)) throw error;
    if (error.id === 'STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED') {
      const raw = error.details?.value;
      candidate = typeof raw === 'string' && raw.length <= 256000 ? decode(raw) : undefined;
    } else if (
      error.id !== 'STRUCTURED_OUTPUT_OBJECT_UNDEFINED' &&
      error.id !== 'STRUCTURED_OUTPUT_TRUNCATED'
    )
      throw error;
    const stopped = error.details?.finishReason;
    if (stopped === 'length' || stopped === 'content-filter') finishReason = stopped;
  }
  if (finishReason === 'length')
    throw new ReportFormatError(
      'output_limit',
      '模型结构化结果因输出长度限制被截断',
      '上次已用完输出额度。直接写紧凑 JSON，合并重复说明并保留必要事实。不要复述原文、展示推导或添加排版空白。',
    );
  if (finishReason === 'content-filter')
    throw new AiError('AI_OUTPUT_INVALID', '模型服务因内容过滤停止输出');
  if (candidate === undefined)
    throw new ReportFormatError(
      'incomplete_output',
      '模型未生成完整的结构化结果',
      '只输出完整 JSON。',
    );
  return validate(schema, candidate);
}
