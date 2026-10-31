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
export function markdownAnchor(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}
export function markdownBody(text: string) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '');
}
export function referenceAnchor(href: string) {
  const fragment = href.indexOf('#');
  if (fragment < 0) return;
  try {
    return decodeURIComponent(href.slice(fragment + 1));
  } catch {
    return;
  }
}
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

export function SafeMarkdown({
  text,
  currentFile,
  paths,
  onOpen,
}: {
  text: string;
  currentFile: string;
  paths: string[];
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
