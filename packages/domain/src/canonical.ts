import { createHash } from 'node:crypto';

/**
 * 不带前缀的 SHA-256 十六进制摘要，用作内容寻址的 blob key 与令牌查找键。
 * 与 {@link digest} 的区别只在前缀：这里的结果可直接当主键，`digest` 的结果带算法标识。
 */
export const sha256 = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex');
/**
 * 带 `sha256:` 前缀的摘要，用于 `content_digest`、`artifact_digest` 等对外可见的完整性字段；
 * 客户端可据前缀切换算法，因此前缀不可省略。
 */
export const digest = (value: string | Buffer): string => `sha256:${sha256(value)}`;

/**
 * 内容与审核证据使用固定键序、整数和 ASCII 转义；仅接受 JSON 数据。
 * 结果直接参与摘要比对（`content_digest`、`policy_digest`、幂等 `request_hash`），因此语义相等的输入
 * 必须产出逐字节相同的字符串：对象键按码元排序、数组保持原序、字符串按码点转义成 `\uXXXX`。
 * 非安全整数直接抛错而不是丢精度，`undefined`/函数/类实例/循环引用同样抛 `TypeError`，
 * 以免把不可复现的序列化写进审计证据。
 */
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

/**
 * 按 UTF-8 字节序比较，而不是 JS 默认的 UTF-16 码元序：中文与 emoji 下两者结果不同，
 * 分布式节点要用同一顺序排序就只能选前者。
 */
export const utf8Compare = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left), Buffer.from(right));
