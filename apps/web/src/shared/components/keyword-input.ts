import { keywordsSchema } from '@capability-hub/contracts';

export const keywordSeparators = /[,，;；\r\n]/;

export function splitKeywords(text: string): string[] {
  return text.split(/[,，;；\r\n]+/).filter((word) => word.trim());
}

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
