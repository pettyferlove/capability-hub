import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { isMap, parseDocument } from 'yaml';

/**
 * 从 Markdown 中提取出的一次引用；`url` 保持原文（未解码、未去除查询串），
 * `line` 为语法树记录的起始行（1 起），用于把校验结果回指到具体行。
 */
export interface MarkdownReference {
  url: string;
  line: number;
}

function* nodes(text: string): Generator<MarkdownNode> {
  const pending = [unified().use(remarkParse).parse(text) as MarkdownNode];
  while (pending.length) {
    const node = pending.pop()!;
    yield node;
    const children = node.children ?? [];
    for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]);
  }
}

/** 评测正文中的实际引用按使用处归因；移除 frontmatter 时保留物理行号。 */
export function markdownUsage(text: string) {
  // 只有能解析为 YAML 映射的头部才是 frontmatter；以分隔线开头的普通正文保持原样。
  const body = text.replace(/^---\r?\n(?:([\s\S]*?)\r?\n)?---(?:\r?\n|$)/, (header, yaml = '') => {
    const doc = parseDocument(yaml as string);
    return doc.errors.length || !isMap(doc.contents) ? header : header.replace(/[^\n]+/g, '');
  });
  const definitions = new Map<string, string>();
  const used: MarkdownNode[] = [];
  const literals: string[] = [];
  for (const node of nodes(body)) {
    if (node.type === 'definition' && node.identifier && typeof node.url === 'string') {
      if (!definitions.has(node.identifier)) definitions.set(node.identifier, node.url);
    } else if (['link', 'image', 'linkReference', 'imageReference'].includes(node.type)) {
      used.push(node);
    }
    if (typeof node.value === 'string') literals.push(node.value);
    if (node.alt) literals.push(node.alt);
  }
  const references = used.flatMap((node) => {
    const url = node.url ?? definitions.get(node.identifier ?? '');
    return url === undefined ? [] : [{ url, line: node.position?.start?.line ?? 1 }];
  });
  return { references, text: literals.join('\n') };
}

/** 接收扫描也检查未使用的定义；评测只跟随正文中使用的引用。 */
export function markdownReferences(
  text: string,
  mode: 'all' | 'used' = 'all',
): MarkdownReference[] {
  if (mode === 'used') return markdownUsage(text).references;
  const result: MarkdownReference[] = [];
  for (const node of nodes(text)) {
    if (['link', 'image', 'definition'].includes(node.type) && typeof node.url === 'string')
      result.push({ url: node.url, line: node.position?.start?.line ?? 1 });
  }
  return result;
}

/** 外链不发起网络请求；本地查询参数、锚点不属于包内文件名。 */
export function localReference(url: string): string | null {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(url)) return null;
  return decodeURIComponent(url.split(/[?#]/)[0]);
}

interface MarkdownNode {
  type: string;
  url?: string;
  identifier?: string;
  value?: string;
  alt?: string;
  children?: MarkdownNode[];
  position?: { start?: { line?: number } };
}

/** 保留原始行号和接收提示，目标只在包内路径空间解析。 */
export function resolveMarkdownReference(
  path: string,
  url: string,
): { target: string | null } | { rule: string; message: string } {
  let relative: string | null;
  try {
    relative = localReference(url);
  } catch {
    return { rule: 'BROKEN_REFERENCE', message: '无效链接编码' };
  }
  if (!relative) return { target: null };
  if (relative.startsWith('/') || relative.includes('\\'))
    return {
      rule: 'REFERENCE_ESCAPE',
      message: '链接指向包外路径，接收者可能无法访问；请核对用途。',
    };
  const base = path.split('/').slice(0, -1);
  for (const part of relative.split('/')) {
    if (part === '..') {
      if (!base.length)
        return {
          rule: 'REFERENCE_ESCAPE',
          message: '链接引用包外文件，接收者可能无法访问；请核对用途。',
        };
      base.pop();
    } else if (part && part !== '.') base.push(part);
  }
  return { target: base.join('/') };
}
