import remarkParse from 'remark-parse';
import { unified } from 'unified';

/**
 * 从 Markdown 中提取出的一次引用；`url` 保持原文（未解码、未去除查询串），
 * `line` 为语法树记录的起始行（1 起），用于把校验结果回指到具体行。
 */
export interface MarkdownReference {
  url: string;
  line: number;
}

/** 使用 Markdown 语法树，代码块和行内代码中的示例链接不参与引用校验。 */
export function markdownReferences(text: string): MarkdownReference[] {
  const result: MarkdownReference[] = [];
  const pending = [unified().use(remarkParse).parse(text) as MarkdownNode];
  while (pending.length) {
    const node = pending.pop()!;
    if (['link', 'image', 'definition'].includes(node.type) && typeof node.url === 'string')
      result.push({ url: node.url, line: node.position?.start?.line ?? 1 });
    const children = node.children ?? [];
    for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]);
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
  children?: MarkdownNode[];
  position?: { start?: { line?: number } };
}
