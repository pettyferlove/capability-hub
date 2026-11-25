import { MastraError } from '@mastra/core/error';
import type { z } from 'zod';
import { AiError } from '../core/errors.js';
import type { ModelOutputCheck, ModelOutputIssue } from '../core/records.js';

// 只传递校验位置和规则；不把模型原文、SDK 异常或资源内容写入错误及重试指令。

/**
 * 结构化输出不符合 Schema 时抛出，`code` 固定为 `AI_OUTPUT_INVALID`。
 * `hint` 只描述期望的字段与格式并用于重试指令；`issues` 供调用记录，同样不含模型原文。
 */
export class ReportFormatError extends AiError {
  constructor(
    readonly reason: 'invalid_fields' | 'incomplete_output' | 'output_limit',
    message: string,
    readonly hint: string,
    readonly issues: ModelOutputIssue[] = [],
  ) {
    super('AI_OUTPUT_INVALID', message);
  }
}

/** 端点因内容过滤停止输出；不属于可纠正的格式问题。 */
export class ContentFilterError extends AiError {
  constructor() {
    super('AI_OUTPUT_INVALID', '模型服务因内容过滤停止输出');
  }
}

function issuePath(path: readonly PropertyKey[]) {
  return (
    path
      .map((key) =>
        /^(?:[a-z_][a-z0-9_]{0,47}|[0-9]{1,4})$/i.test(String(key)) ? String(key) : '*',
      )
      .join('.')
      .slice(0, 200) || '$'
  );
}

function lookup(candidate: unknown, path: readonly PropertyKey[]) {
  let node = candidate;
  for (const key of path) {
    if (!node || typeof node !== 'object' || !Object.hasOwn(node, key)) return { found: false };
    node = Reflect.get(node, key);
  }
  return { found: true, value: node };
}

/** 把 Zod 问题转换为字段问题：只含 Schema 路径、规则、上下限与实际长度，不含模型写出的值或键名。 */
export function outputIssues(issues: z.ZodError['issues'], candidate: unknown) {
  return issues.slice(0, 20).map((issue): ModelOutputIssue => {
    const target = lookup(candidate, issue.path);
    const item: ModelOutputIssue = { path: issuePath(issue.path), code: issue.code };
    if (issue.code === 'invalid_type') {
      if (!target.found) item.code = 'missing';
      item.expected = String(issue.expected).slice(0, 80);
    } else if (issue.code === 'too_big' || issue.code === 'too_small') {
      item.limit = Number(issue.code === 'too_big' ? issue.maximum : issue.minimum);
      if (typeof target.value === 'string' || Array.isArray(target.value))
        item.actual = target.value.length;
    } else if (issue.code === 'unrecognized_keys') {
      item.actual = issue.keys.length;
    } else if (issue.code === 'invalid_value') {
      item.options = issue.values.slice(0, 20).map((value) => String(value).slice(0, 64));
    }
    return item;
  });
}

const formatReasons = {
  invalid_fields: 'schema_mismatch',
  incomplete_output: 'invalid_json',
  output_limit: 'output_limit',
} as const;

/** 结构化读取失败对应的调用输出结论；不属于输出校验的异常返回 undefined。 */
export function structuredRejection(error: unknown): ModelOutputCheck | undefined {
  if (error instanceof ReportFormatError)
    return {
      status: 'rejected',
      reason: formatReasons[error.reason],
      ...(error.issues.length ? { issues: error.issues } : {}),
    };
  if (error instanceof ContentFilterError) return { status: 'rejected', reason: 'content_filter' };
  return undefined;
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
  throw new ReportFormatError(
    'invalid_fields',
    '模型结构化结果的字段或类型不符合约定',
    hint,
    outputIssues(checked.error.issues, candidate),
  );
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
  if (finishReason === 'content-filter') throw new ContentFilterError();
  if (candidate === undefined)
    throw new ReportFormatError(
      'incomplete_output',
      '模型未生成完整的结构化结果',
      '只输出完整 JSON。',
    );
  return validate(schema, candidate);
}
