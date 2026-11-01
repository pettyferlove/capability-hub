const graphemes = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

/** 按字素边界推进，避免把 emoji、组合字符或代理对截成两半。 */
// 步长 = 剩余长度 × min(elapsed / 120, 1)，再与 2 取较大值（缩放之后才取上限），于是 elapsed 达到
// 120ms 时一次补齐剩余内容，逐字显示最多滞后约 120ms；elapsed 为 0 或负数时仍前进 2 个 UTF-16 码元，
// 调用方不会因时间戳回退而卡住。落点向上取整到目标位置所在字素的末尾，返回值可能略大于按步长算出
// 的位置；cursor 已越界时直接返回文本长度。
export function advanceStreamCursor(text: string, cursor: number, elapsed: number): number {
  if (cursor >= text.length) return text.length;
  const target = Math.min(
    text.length,
    cursor + Math.max(2, Math.ceil((text.length - cursor) * Math.min(elapsed / 120, 1))),
  );
  const segment = graphemes.segment(text).containing(target - 1);
  return segment ? segment.index + segment.segment.length : text.length;
}
