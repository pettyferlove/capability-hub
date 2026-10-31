import {
  tokDimStyles,
  tokStrStyles,
  tokKeyStyles,
  codewrapStyles,
  monoStyles,
  codeblockStyles,
} from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { CopyButton } from './CopyButton.js';
function tint(line: string, i: number) {
  if (/^\s*(#|\/\/)/.test(line))
    return (
      <span key={i} className={tokDimStyles}>
        {line}
        {'\n'}
      </span>
    );
  const parts = line.split(/("[^"]*")/g);
  return (
    <span key={i}>
      {parts.map((p, j) =>
        p.startsWith('"') ? (
          <span key={j} className={tokStrStyles}>
            {p}
          </span>
        ) : (
          p.split(/(\s--?[a-z-]+)/g).map((q, k) =>
            /^\s--?[a-z-]+$/.test(q) ? (
              <span key={k} className={tokKeyStyles}>
                {q}
              </span>
            ) : (
              q
            ),
          )
        ),
      )}
      {'\n'}
    </span>
  );
}

export function CodeBlock({ code, title }: { code: string; title?: string }) {
  return (
    <div className={cn(codewrapStyles, 'min-w-0')}>
      <div className="flex items-center justify-between gap-3 px-4 pt-2.5 pb-1.5">
        <span className={cn(monoStyles, 'truncate text-[11px] text-[var(--code-dim)]')}>
          {title ?? ''}
        </span>
        <CopyButton text={code} />
      </div>
      <pre className={codeblockStyles}>{code.split('\n').map(tint)}</pre>
    </div>
  );
}
