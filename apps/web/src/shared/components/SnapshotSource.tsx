import { useEffect, useRef } from 'react';

/** 引用定位使用原文行号；其余内容保留为文本节点，避免为长文件的每一行创建元素。 */
export function SnapshotSource({
  text,
  line,
  className,
  focusOnOpen = false,
}: {
  text: string;
  line?: number;
  className: string;
  focusOnOpen?: boolean;
}) {
  const source = useRef<HTMLPreElement>(null);
  const marked = useRef<HTMLElement>(null);
  const lines = line ? text.split(/\r\n?|\n/) : [];
  useEffect(() => {
    const target = marked.current ?? (focusOnOpen ? source.current : null);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'nearest' });
  }, [text, line, focusOnOpen]);
  return (
    <pre className={className} ref={source} tabIndex={focusOnOpen ? -1 : undefined}>
      {line && line > 0 && line <= lines.length ? (
        <>
          {line > 1 && lines.slice(0, line - 1).join('\n') + '\n'}
          <mark
            ref={marked}
            tabIndex={-1}
            aria-label={'原文件第 ' + line + ' 行'}
            className="bg-brand-veil text-ink focus:outline-brand"
          >
            {lines[line - 1] || ' '}
          </mark>
          {line < lines.length && '\n' + lines.slice(line).join('\n')}
        </>
      ) : (
        text
      )}
    </pre>
  );
}
