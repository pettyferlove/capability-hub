import type { Json } from '../core/records.js';

export function wireObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Chat Completions 的 thinking 块只接受内层 text 片段，与 SDK 解码保持一致。 */
export function openAiContent(part: Record<string, unknown>) {
  let text = '';
  const explicit = part.reasoning_content ?? part.reasoning;
  let reasoning = typeof explicit === 'string' ? explicit : '';
  if (Array.isArray(part.content)) {
    for (const value of part.content) {
      const block = wireObject(value);
      if (block?.type === 'text' && typeof block.text === 'string') text += block.text;
      else if (block?.type === 'thinking' && Array.isArray(block.thinking)) {
        for (const inner of block.thinking) {
          const chunk = wireObject(inner);
          if (chunk?.type === 'text' && typeof chunk.text === 'string') reasoning += chunk.text;
        }
      }
    }
  } else if (typeof part.content === 'string') text = part.content;
  return { text, reasoning };
}

const authName = /(?:^|[-_])(?:auth|authorization|api[-_]?key|token|secret|cookie)$/iu;
const headerEcho =
  /\b(?:(?:proxy-)?authorization|(?:x[-_])?api[-_]?key|(?:access|auth|session)[-_]token|(?:set-)?cookie)["'\\\s]*(?:[:=]|,\s*["'])[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*)*/giu;
const authScheme = /\b(?:Bearer|Basic)\s+[^\s,"'<>]+/giu;

/** 脱敏只作用于证据副本，绝不改写交给 SDK 的字节。 */
export class WirePrivacy {
  private secrets: string[] = [];
  configure(headers: Headers, apiKey?: string) {
    const secrets = new Set<string>();
    if (apiKey?.trim()) secrets.add(apiKey.trim());
    for (const [name, value] of headers) {
      if (!authName.test(name) || !value) continue;
      secrets.add(value);
      const token = /^(?:Bearer|Basic)\s+(.+)$/iu.exec(value)?.[1];
      if (token) secrets.add(token);
    }
    for (const secret of [...secrets]) secrets.add(JSON.stringify(secret).slice(1, -1));
    this.secrets = [...secrets].sort((a, b) => b.length - a.length);
  }
  text(value: string, partial = false) {
    let safe = value;
    for (const secret of this.secrets) {
      safe = safe.replaceAll(secret, '*');
      if (partial) {
        // 字节前缀可能在凭据中间结束；只交付可确定不属于凭据的尾部。
        const suffix = safe.lastIndexOf(secret[0]);
        if (suffix >= 0) {
          for (let i = Math.max(0, safe.length - secret.length + 1); i <= suffix; i++) {
            if (safe[i] === secret[0] && secret.startsWith(safe.slice(i))) {
              safe = safe.slice(0, i) + '*';
              break;
            }
          }
        }
      }
    }
    return safe.replace(headerEcho, '*').replace(authScheme, '*');
  }
  json(value: Json, depth = 0): Json {
    if (typeof value === 'string') return this.text(value);
    if (!value || typeof value !== 'object') return value;
    if (depth >= 128) return '*';
    if (Array.isArray(value)) return value.map((item) => this.json(item, depth + 1));
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        this.text(key),
        authName.test(key) ? '*' : this.json(item, depth + 1),
      ]),
    );
  }
  errorPrefix(text: string, partial: boolean) {
    if (/^\s*[{[]/u.test(text)) {
      // 残缺信封没有可靠的对象树；遇到协议外字段就停止，不交付它的值。
      for (const match of text.matchAll(/("(?:[^"\\]|\\.)*")(\s*:)?/gsu)) {
        if (match[2] && !/^"(?:error|type|code|message|request_id)"$/u.test(match[1])) {
          text = text.slice(0, match.index) + '*';
          break;
        }
      }
    }
    return this.text(text, partial);
  }
  /** 错误只保留协议说明和标识；不复制 headers、request、堆栈等任意扩展字段。 */
  error(envelope: Record<string, unknown>) {
    const error = wireObject(envelope.error) ?? envelope;
    const selected: Record<string, string | number> = {};
    for (const key of ['type', 'code', 'message'] as const) {
      const field = error[key];
      if (typeof field === 'string') selected[key] = this.text(field);
      else if (typeof field === 'number' && Number.isSafeInteger(field)) selected[key] = field;
    }
    if (typeof envelope.error === 'string') selected.message = this.text(envelope.error);
    return JSON.stringify({ error: selected });
  }
}
