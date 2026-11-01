/** 目录分页游标的载荷；对外只以不透明字符串出现，由 {@link CatalogCursorCodec} 签发。 */
export interface CatalogCursor {
  /** 查询条件 + 身份授权快照 + 目录修订号的摘要；与当前请求不符即视为失效。 */
  fingerprint: string;
  /** 已返回条数，下一页从这里继续切片。 */
  offset: number;
  /** 过期时刻，毫秒时间戳，与 `Date.now()` 同基准。 */
  expires: number;
}
/**
 * 游标编解码端口。客户端可以自由改写游标，因此实现方必须让它不可伪造（签名或等价的
 * 完整性校验），并且 `decode` 对任何非法输入都返回 `undefined` 而不抛错，
 * 由调用方统一转成 400/`CURSOR_EXPIRED`。
 */
export interface CatalogCursorCodec {
  encode(value: CatalogCursor): string;
  /** 长度超限、签名不符或载荷结构非法时返回 `undefined`。 */
  decode(cursor: string): CatalogCursor | undefined;
}
