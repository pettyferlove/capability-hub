import { keywordsSchema } from '@capability-hub/contracts';

/** 触发切分词的分隔符：中英文逗号、分号与换行；顿号与空格不切分，避免把词组拆散。 */
export const keywordSeparators = /[,，;；\r\n]/;

/** 按 {@link keywordSeparators} 切分并丢弃空白片段，不做归一化与去重。 */
export function splitKeywords(text: string): string[] {
  return text.split(/[,，;；\r\n]+/).filter((word) => word.trim());
}

/**
 * 把新输入并入已有标签：NFKC 归一化、折叠内部空白后按小写判重，保留首次出现的写法。
 * 单条超过 128 字符或多于 20 条时返回原 `values` 并给出可展示的错误，**不做截断**——
 * 让调用方保持"未提交"状态而不是悄悄丢掉用户输入。`error` 为空串表示成功。
 */
export function mergeKeywords(value: string[], text: string) {
  const unique = new Map<string, string>();
  for (const term of [...value, ...splitKeywords(text)]) {
    const normalized = term.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (!unique.has(normalized.toLowerCase())) unique.set(normalized.toLowerCase(), normalized);
  }
  const terms = [...unique.values()];
  if (terms.some((term) => term.length > 128))
    return { values: value, error: '每个关键词不超过 128 个字符，请缩短后再添加。' };
  if (terms.length > 20)
    return { values: value, error: '最多添加 20 个关键词，请先移除一些标签。' };
  return { values: keywordsSchema.parse(terms), error: '' };
}
