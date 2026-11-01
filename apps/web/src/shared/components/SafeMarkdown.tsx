import { subtleStyles, markdownFileLinkStyles } from '../styles/recipes.js';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Children, isValidElement, useId, useRef, type ReactNode } from 'react';

function headingText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? headingText(child.props.children)
        : typeof child === 'string' || typeof child === 'number'
          ? String(child)
          : '',
    )
    .join('');
}
/**
 * 标题锚点：小写后去掉字母数字/空白/`_`/`-` 以外的字符（按 Unicode 字母表，中文会保留），空白折叠成 `-`。
 * 本函数不处理同名标题，重复编号由调用方根据出现次数追加。
 */
export function markdownAnchor(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}
/** 去掉开头的 YAML front matter；只有成对的 `---` 才被当作元数据，未闭合时原样保留，避免吞掉正文。 */
export function markdownBody(text: string) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
}
/**
 * 取 `href` 中 `#` 之后的片段并解码一次；无片段或百分号编码非法时返回 `undefined`，
 * 让调用方按「没有锚点」处理而不是抛错。
 */
export function referenceAnchor(href: string) {
  const fragment = href.indexOf('#');
  if (fragment < 0) return;
  try {
    return decodeURIComponent(href.slice(fragment + 1));
  } catch {
    return;
  }
}
/**
 * 在渲染结果内滚动到 `data-anchor` 匹配的标题；只调整最近的纵向可滚动祖先的 `scrollTop`，
 * 不调用 `scrollIntoView`，以免连带移动整页或其它滚动容器。`scrollMarginTop` 作为粘性头部补偿。
 *
 * @returns 是否找到目标；找不到时容器位置保持不变。
 */
export function scrollMarkdownAnchor(root: HTMLElement, anchor: string) {
  const target = Array.from(root.querySelectorAll<HTMLElement>('[data-anchor]')).find(
    (element) => element.dataset.anchor === anchor,
  );
  if (!target) return false;
  let parent = root.parentElement;
  while (parent && !/(auto|scroll)/.test(getComputedStyle(parent).overflowY))
    parent = parent.parentElement;
  if (!parent) return false;
  const inset = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  parent.scrollTop +=
    target.getBoundingClientRect().top - parent.getBoundingClientRect().top - inset;
  return true;
}

/**
 * 把文档里的相对链接解析成同一版本内的文件路径：以 `currentFile` 所在目录为基准处理 `./` 与 `../`。
 * 纯锚点、绝对 URL、协议链接、以 `/` 开头或含反斜杠的路径一律返回 `undefined`（不预览、也不猜），
 * 指向目录时退回该目录下的首个文件，保证「链接到一个目录」也能点开东西。
 */
export function snapshotReference(currentFile: string, paths: string[], href: string) {
  if (href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href)) return;
  let path: string;
  try {
    path = decodeURIComponent(href.split(/[?#]/)[0]);
  } catch {
    return;
  }
  if (path.startsWith('/') || path.includes('\\')) return;
  const parts = currentFile.split('/').slice(0, -1);
  for (const part of path.split('/')) {
    if (part === '..') {
      if (!parts.length) return;
      parts.pop();
    } else if (part && part !== '.') parts.push(part);
  }
  const target = parts.join('/');
  return (
    paths.find((path) => path === target) ?? paths.find((path) => path.startsWith(target + '/'))
  );
}

/**
 * 渲染不受信任的 README/Markdown：`skipHtml` 丢弃原始 HTML，图片不外链加载（只留占位文字），
 * 链接只对 `http(s)` 输出真实 `href`，其余退化为无地址的锚点，避免 `javascript:` 之类被执行。
 * 站内相对链接改写成按钮并回调 `onOpen`，由上层按固定版本取文件内容，
 * 因此点击不会离开当前预览，也不会跳出到归档外的路径。
 * 标题锚点带 `useId` 前缀，同页多个文档不会互相冲突。
 */
export function SafeMarkdown({
  text,
  currentFile,
  paths,
  onOpen,
}: {
  text: string;
  /** 当前文件在归档内的路径，用作相对链接的解析基准。 */
  currentFile: string;
  /** 该版本的全部文件路径，用于把引用落地到真实文件或目录下的首个文件。 */
  paths: string[];
  /** 点击归档内引用时触发，`anchor` 为链接里的片段（无片段时为 `undefined`）。 */
  onOpen: (path: string, anchor?: string) => void;
}) {
  const prefix = useId();
  const root = useRef<HTMLDivElement>(null);
  const headings = new Map<string, number>();
  const headingIds = new Map<number, string>();
  const heading = (
    Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
    children: ReactNode,
    offset?: number,
  ) => {
    const slug = markdownAnchor(headingText(children));
    const count = headings.get(slug) ?? 0;
    const anchor =
      (offset !== undefined && headingIds.get(offset)) || (count ? `${slug}-${count}` : slug);
    if (offset === undefined || !headingIds.has(offset)) {
      headings.set(slug, count + 1);
      if (offset !== undefined) headingIds.set(offset, anchor);
    }
    return (
      <Tag id={`${prefix}-${anchor}`} data-anchor={anchor}>
        {children}
      </Tag>
    );
  };
  return (
    <div ref={root}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children, node }) => heading('h1', children, node?.position?.start.offset),
          h2: ({ children, node }) => heading('h2', children, node?.position?.start.offset),
          h3: ({ children, node }) => heading('h3', children, node?.position?.start.offset),
          h4: ({ children, node }) => heading('h4', children, node?.position?.start.offset),
          h5: ({ children, node }) => heading('h5', children, node?.position?.start.offset),
          h6: ({ children, node }) => heading('h6', children, node?.position?.start.offset),
          img: ({ alt }) => <span className={subtleStyles}>[图片：{alt || '外部图片未加载'}]</span>,
          a: ({ href, children }) => {
            if (href?.startsWith('#'))
              return (
                <button
                  type="button"
                  className={markdownFileLinkStyles}
                  onClick={() => {
                    const anchor = referenceAnchor(href);
                    if (root.current && anchor) scrollMarkdownAnchor(root.current, anchor);
                  }}
                >
                  {children}
                </button>
              );
            const target = href ? snapshotReference(currentFile, paths, href) : undefined;
            return target ? (
              <button
                type="button"
                className={markdownFileLinkStyles}
                title={'查看固定版本文件 ' + target}
                onClick={() => onOpen(target, referenceAnchor(href!))}
              >
                {children}
              </button>
            ) : (
              <a
                href={
                  href?.startsWith('https://') || href?.startsWith('http://') ? href : undefined
                }
                target="_blank"
                rel="noreferrer noopener"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
