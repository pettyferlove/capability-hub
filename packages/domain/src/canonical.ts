import { createHash } from 'node:crypto';

export const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');
export const digest = (value: string | Buffer): string => `sha256:${sha256(value)}`;

/** 内容与审核证据使用固定键序、整数和 ASCII 转义；仅接受 JSON 数据。 */
export function canonical(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(input: unknown): string {
    if (input === null) return 'null';
    if (typeof input === 'string')
      return JSON.stringify(input).replace(
        /[\u007f-\uffff]/g,
        (character) => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'),
      );
    if (typeof input === 'number') {
      if (!Number.isSafeInteger(input))
        throw new TypeError('Canonical number must be a safe integer');
      return String(input);
    }
    if (typeof input === 'boolean') return String(input);
    if (typeof input !== 'object') throw new TypeError('Unsupported canonical value');
    if (ancestors.has(input)) throw new TypeError('Canonical value contains a cycle');
    ancestors.add(input);
    try {
      if (Array.isArray(input)) return '[' + Array.from(input, encode).join(',') + ']';
      const prototype: unknown = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null)
        throw new TypeError('Canonical object must be a plain JSON object');
      const object = input as Record<string, unknown>;
      return (
        '{' +
        Object.keys(object)
          .sort()
          .map((key) => encode(key) + ':' + encode(object[key]))
          .join(',') +
        '}'
      );
    } finally {
      ancestors.delete(input);
    }
  }
  return encode(value);
}

export const utf8Compare = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left), Buffer.from(right));
