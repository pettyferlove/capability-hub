import type { ComponentProps } from 'react';
import { CopyButton } from '../../shared/components/CopyButton.js';
import { SafeMarkdown } from '../../shared/components/SafeMarkdown.js';
import { markdownCodeStyles, markdownStyles, markdownTableStyles } from './styles.js';

type MarkdownProps = ComponentProps<typeof SafeMarkdown>;

const languagePrefix = 'language-';

const blocks: MarkdownProps['blocks'] = {
  table: ({ children }) => (
    <div
      data-markdown-wide=""
      className={markdownTableStyles}
      role="group"
      aria-label="文档表格"
      tabIndex={0}
    >
      <table>{children}</table>
    </div>
  ),
  pre: ({ children, node }) => {
    const code = node?.children[0];
    if (code?.type !== 'element') return <pre>{children}</pre>;
    const source = code.children[0];
    if (source?.type !== 'text') return <pre>{children}</pre>;
    const classes = code.properties.className;
    const marker: unknown = Array.isArray(classes) ? classes[0] : undefined;
    const language =
      typeof marker === 'string' && marker.startsWith(languagePrefix)
        ? marker.slice(languagePrefix.length)
        : '纯文本';
    // 只去掉渲染器补的末尾换行，保留代码自身的空行和缩进。
    const text = source.value.endsWith('\n') ? source.value.slice(0, -1) : source.value;
    return (
      <figure data-markdown-wide="" className={markdownCodeStyles}>
        <figcaption>
          <span title={language}>{language}</span>
          {text && <CopyButton text={text} label="复制代码" />}
        </figcaption>
        <pre tabIndex={0} role="group" aria-label="代码内容">
          {children}
        </pre>
      </figure>
    );
  },
};

/** 固定版本的内容说明和文件预览共享文档样式，链接仍由 {@link SafeMarkdown} 解析。 */
export function SnapshotMarkdown(props: Omit<MarkdownProps, 'blocks'>) {
  return (
    <article data-markdown className={markdownStyles}>
      <SafeMarkdown {...props} blocks={blocks} />
    </article>
  );
}
