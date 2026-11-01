import { fail } from '@capability-hub/domain/errors';
const MiB = 1024 * 1024;
// 在 JSON.parse 覆盖重复键前检查嵌套深度与对象成员。

/**
 * 受限 JSON 解析：任何拒绝都以 413/422 抛出，不返回部分结果。
 *
 * 上限为 10 MiB 字节（413 `JSON_SIZE`）、嵌套深度 40（422 `JSON_DEPTH`）。额外的二次扫描是为了
 * 在 `JSON.parse` 用「后者覆盖」掩盖重复键之前判重——转义写法等价（如 `\u0061` 与 `a`）
 * 也视为同一键，因为下游按字段取值时无法感知被覆盖的那份数据。重复键抛 422 `JSON_DUPLICATE`。
 * 注意：此处只做结构约束，不做 Schema 校验，调用方需自行用 Ajv 等继续验证。
 */
export function boundedJson(text: string): unknown {
  if (Buffer.byteLength(text) > 10 * MiB) fail(413, 'JSON_SIZE', 'JSON 过大');
  let depth = 0,
    inString = false,
    escape = false;
  for (const c of text) {
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') {
      if (++depth > 40) fail(422, 'JSON_DEPTH', 'JSON 嵌套过深');
    } else if (c === '}' || c === ']') depth--;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    fail(422, 'JSON_INVALID', 'JSON 格式错误');
  }
  // 记录解码后的字段名，转义写法相同的键同样视为重复。
  let at = 0;
  const ws = () => {
    while (/\s/.test(text[at] ?? '') && at < text.length) at++;
  };
  const str = () => {
    const start = at++;
    let esc = false;
    while (at < text.length) {
      const c = text[at++];
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') break;
    }
    const parsed: unknown = JSON.parse(text.slice(start, at));
    if (typeof parsed !== 'string') fail(422, 'JSON_INVALID', 'JSON 字符串无效');
    return parsed;
  };
  const walk = () => {
    ws();
    if (text[at] === '{') {
      at++;
      ws();
      const names = new Set<string>();
      while (text[at] !== '}') {
        ws();
        const key = str();
        if (names.has(key)) fail(422, 'JSON_DUPLICATE', 'JSON 存在重复字段');
        names.add(key);
        ws();
        at++;
        walk();
        ws();
        if (text[at] !== ',') break;
        at++;
      }
      at++;
    } else if (text[at] === '[') {
      at++;
      ws();
      while (text[at] !== ']') {
        walk();
        ws();
        if (text[at] !== ',') break;
        at++;
      }
      at++;
    } else if (text[at] === '"') str();
    else while (at < text.length && !/[\s,}\]]/.test(text[at])) at++;
  };
  walk();
  return value;
}
