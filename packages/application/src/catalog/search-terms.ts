const chineseWords = new Intl.Segmenter('zh', { granularity: 'word' });
const han = /\p{Script=Han}/u;
const singleHan = /^\p{Script=Han}$/u;
const queryFillers = new Set(
  '我 我想 想 想要 请 帮 帮我 找 查找 寻找 搜索 需要 适合 使用 可以 一个 相关 有关 的 了 与 和 或 及 是 在 用 给'.split(
    ' ',
  ),
);

/** 目录归一化：NFKC 后小写，检索词与目录文本必须用同一规则比较。 */
export function normalizeText(value: string) {
  return value.normalize('NFKC').toLowerCase();
}

/** 中文按分词器取词并去掉口语虚词，其余按技术名称字符切分；结果按出现顺序去重。 */
export function segmentTerms(text: string, fillers: ReadonlySet<string> = queryFillers) {
  const words = new Set<string>();
  for (const part of text.split(/(\p{Script=Han}+)/u)) {
    if (han.test(part)) {
      const terms = Array.from(chineseWords.segment(part), ({ segment }) => segment);
      for (const [index, term] of terms.entries()) {
        if (fillers.has(term)) continue;
        if (!singleHan.test(term)) words.add(term);
        else {
          // 分词器未识别的复合词按相邻双字匹配，避免“风控”退化为“风险”或“控制”。
          const next = terms[index + 1];
          if (next && singleHan.test(next) && !fillers.has(next)) words.add(term + next);
        }
      }
    } else {
      for (const term of part.match(/[\p{L}\p{M}\p{N}.#+@/_-]+/gu) ?? []) words.add(term);
    }
  }
  return [...words];
}

/** 目录检索词：非中文按空白切分；中文没有有效词时整句作为一个词。 */
export function searchTerms(query: string) {
  if (!han.test(query)) return query.split(/\s+/).filter(Boolean);
  const words = segmentTerms(query);
  return words.length ? words : [query.trim()];
}

/** 是否含中文，决定多词检索的最少命中数。 */
export function hasHan(value: string) {
  return han.test(value);
}

export { queryFillers };
