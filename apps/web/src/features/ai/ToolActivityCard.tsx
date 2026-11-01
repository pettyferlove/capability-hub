import { toolLabels } from './presentation.js';
import { Check, ChevronDown, CirclePause, LoaderCircle, X } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import type { ToolActivity } from './activity.js';
import { toolIcon } from './agent-brief.js';
import { disclosureChevronStyles, toolCardStyles } from './styles.js';

const states = {
  running: {
    label: '调用中',
    Icon: LoaderCircle,
    tone: 'text-brand',
    tile: 'bg-brand-soft text-brand',
  },
  completed: {
    label: '已完成',
    Icon: Check,
    tone: 'text-success',
    tile: 'bg-paper text-muted-ink',
  },
  failed: { label: '调用失败', Icon: X, tone: 'text-danger', tile: 'bg-danger-soft text-danger' },
  interrupted: {
    label: '已中断 · 结果未确认',
    Icon: CirclePause,
    tone: 'text-muted-ink',
    tile: 'bg-paper text-muted-ink',
  },
};

/**
 * 单次工具调用的折叠行，展开后是标识、起止时间与错误码。耗时按 `startedAt`／`endedAt` 计算并
 * 在时钟回拨时钳到 0；`interrupted` 明确提示结果未确认，调用方不应据此认为工具失败。
 */
export function ToolActivityCard({ tool }: { tool: ToolActivity }) {
  const state = states[tool.state];
  const known = ['inspect-text', 'inspect_text'].includes(tool.name);
  const Icon = toolIcon(tool.name);
  const duration =
    tool.startedAt && tool.endedAt
      ? Date.parse(tool.endedAt) - Date.parse(tool.startedAt)
      : undefined;
  return (
    <details className={toolCardStyles}>
      <summary>
        <span
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset ring-[color:var(--line)]',
            state.tile,
          )}
        >
          <Icon size={14} />
        </span>
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <strong className="shrink-0 break-all text-body font-medium text-ink">
            {known ? '文本统计' : (toolLabels[tool.name] ?? tool.name)}
          </strong>
          <span className="min-w-0 truncate text-caption text-muted-ink">
            {tool.display ?? (known ? '统计文本字符数与行数' : '执行任务所需的工具操作')}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-caption">
          {duration !== undefined && (
            <span className="tabular-nums text-muted-ink max-sm:hidden">
              {Math.max(0, duration / 1000).toFixed(1)}s
            </span>
          )}
          <span className={cn('flex items-center gap-1', state.tone)}>
            <state.Icon
              size={13}
              className={tool.state === 'running' ? 'motion-safe:animate-spin' : undefined}
            />
            {state.label}
          </span>
        </span>
        <ChevronDown size={13} className={cn(disclosureChevronStyles, 'ml-0 text-muted-ink')} />
      </summary>
      <dl className="grid gap-3 bg-page/50 px-4 py-3 text-caption sm:grid-cols-2">
        {[
          ['工具标识', tool.name],
          ['调用编号', tool.id],
          [
            '开始时间',
            tool.startedAt
              ? new Date(tool.startedAt).toLocaleTimeString()
              : '当前记录未包含开始事件',
          ],
          ['结束时间', tool.endedAt ? new Date(tool.endedAt).toLocaleTimeString() : '尚未确认'],
          ...(tool.code ? [['错误代码', tool.code]] : []),
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-ink">{label}</dt>
            <dd className="mt-0.5 break-all font-mono text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
