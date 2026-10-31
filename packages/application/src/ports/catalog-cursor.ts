export interface CatalogCursor {
  fingerprint: string;
  offset: number;
  expires: number;
}
export interface CatalogCursorCodec {
  encode(value: CatalogCursor): string;
  decode(cursor: string): CatalogCursor | undefined;
}
