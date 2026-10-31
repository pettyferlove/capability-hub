const graphemes = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });

/** 按字素边界推进，避免把 emoji、组合字符或代理对截成两半。 */
export function advanceStreamCursor(text: string, cursor: number, elapsed: number): number {
  if (cursor >= text.length) return text.length;
  const target = Math.min(
    text.length,
    cursor + Math.max(2, Math.ceil((text.length - cursor) * Math.min(elapsed / 120, 1))),
  );
  const segment = graphemes.segment(text).containing(target - 1);
  return segment ? segment.index + segment.segment.length : text.length;
}
