import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CircleAlert, ChevronDown, ArrowRight } from '../../shared/icons/lucide.js';

/** 发布页待核对项，与目标元素的 `data-review-target` 一一对应，用于点击后聚焦定位。 */
export interface PublicationNotice {
  /** 目标元素的 `data-review-target` 值，父组件据此在页内查找并聚焦。 */
  target: string;
  /** 为真表示问题出在扫描证据页，跳转切到证据页，否则切回发布表单。 */
  evidence: boolean;
  text: string;
}

/**
 * 发布页底部操作栏：`notices` 非空时左侧变成待核对清单入口（向上浮层），否则显示 `hint` 文案；
 * 浮层失焦即收起，`Escape` 收起并把焦点还给触发按钮。跳转定位由父组件的 `locate` 负责。
 */
export function PublicationFooter({
  action,
  hint,
  notices,
  locate,
}: {
  action: ReactNode;
  hint: string;
  notices: PublicationNotice[];
  locate: (notice: PublicationNotice) => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <footer
      aria-label="发布操作"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (open && e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
          toggle.current?.focus();
        }
      }}
      className="relative z-[76] shrink-0 border-t border-separator bg-paper px-4 py-3 sm:px-6"
    >
      {open && notices.length > 0 && (
        <section
          aria-label="提交前待核对"
          className="absolute inset-x-3 bottom-full z-10 mb-2 max-h-[35dvh] space-y-1 overflow-y-auto rounded-xl border border-separator bg-paper p-2 shadow-overlay"
        >
          {notices.map((item) => (
            <button
              type="button"
              key={item.target}
              onClick={() => {
                setOpen(false);
                locate(item);
              }}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-warning-soft"
            >
              <span>{item.text}</span>
              <span className="inline-flex shrink-0 items-center gap-1 text-caption text-brand">
                {item.evidence ? '看证据' : '去核对'}
                <ArrowRight size={12} />
              </span>
            </button>
          ))}
        </section>
      )}
      <div className="flex items-center justify-between gap-3">
        {notices.length ? (
          <button
            type="button"
            ref={toggle}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-warning-soft px-3 py-2 text-caption font-semibold text-warning"
          >
            <CircleAlert size={14} />
            {notices.length} 项待核对
            <ChevronDown size={12} />
          </button>
        ) : (
          <span className="text-caption text-muted-ink">{hint}</span>
        )}
        {action}
      </div>
    </footer>
  );
}
