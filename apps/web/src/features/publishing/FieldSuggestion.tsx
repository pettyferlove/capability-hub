import type { MouseEventHandler } from 'react';
import { Sparkles } from '../../shared/icons/lucide.js';

/**
 * AI 建议行：`pending` 表示建议仍待研判，此时只展示建议值、不提供采纳按钮；`matched` 为真表示当前
 * 内容已与建议一致，也不再覆盖。缺少 `onApply` 时纯展示，用于已提交申请的只读对比。
 */
export function FieldSuggestion({
  label,
  values,
  matched,
  pending,
  onApply,
}: {
  label: string;
  values: string[];
  matched: boolean;
  pending?: boolean;
  onApply?: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <aside
      aria-label={label + '的 AI 建议'}
      className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-brand/30 pl-2.5 text-caption leading-5"
    >
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-medium text-brand">
        <Sparkles size={12} aria-hidden="true" />
        AI 建议
      </span>
      {(!matched || pending) && (
        <span className="min-w-0 break-words text-ink">{values.join(' · ')}</span>
      )}
      <span className="text-muted-ink">
        {pending ? '待采纳研判' : matched ? '与当前内容一致' : '已保留当前内容'}
      </span>
      {!pending && !matched && onApply && (
        <button
          type="button"
          aria-label={'使用' + label + '建议'}
          className="rounded px-1 py-1 font-semibold text-brand underline underline-offset-4"
          onClick={onApply}
        >
          使用建议
        </button>
      )}
    </aside>
  );
}
