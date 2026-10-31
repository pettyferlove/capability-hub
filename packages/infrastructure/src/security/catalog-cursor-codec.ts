import type { CatalogCursor, CatalogCursorCodec } from '@capability-hub/application/ports';
import { createHmac, timingSafeEqual } from 'node:crypto';

export class SignedCatalogCursorCodec implements CatalogCursorCodec {
  constructor(private readonly secret: string) {}
  private signature(encoded: string): Buffer {
    return createHmac('sha256', this.secret).update(encoded).digest();
  }
  encode(value: CatalogCursor): string {
    const encoded = Buffer.from(JSON.stringify(value)).toString('base64url');
    return encoded + '.' + this.signature(encoded).toString('base64url');
  }
  decode(cursor: string): CatalogCursor | undefined {
    if (cursor.length > 4096) return;
    const segments = cursor.split('.');
    if (segments.length !== 2 || !segments.every((value) => /^[\w-]+$/.test(value))) return;
    const [encoded, signature] = segments;
    const supplied = Buffer.from(signature, 'base64url');
    const expected = this.signature(encoded);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return;
    try {
      const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString());
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !('fingerprint' in value) ||
        typeof value.fingerprint !== 'string' ||
        !('offset' in value) ||
        typeof value.offset !== 'number' ||
        !Number.isSafeInteger(value.offset) ||
        value.offset < 0 ||
        !('expires' in value) ||
        typeof value.expires !== 'number' ||
        !Number.isSafeInteger(value.expires)
      )
        return;
      return { fingerprint: value.fingerprint, offset: value.offset, expires: value.expires };
    } catch {
      return;
    }
  }
}
