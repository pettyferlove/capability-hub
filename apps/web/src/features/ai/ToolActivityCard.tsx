import { toolLabels } from './presentation.js';
import {
  Check,
  ChevronDown,
  CirclePause,
  Clock3,
  LoaderCircle,
  Wrench,
  X,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import type { ToolActivity } from './activity.js';
import { disclosureChevronStyles, disclosureStyles, toolCardStyles } from './styles.js';

const states = {
  running: { label: '调用中', Icon: LoaderCircle, tone: 'text-brand' },
  completed: { label: '已完成', Icon: Check, tone: 'text-success' },
  failed: { label: '调用失败', Icon: X, tone: 'text-danger' },
  interrupted: { label: '已中断 · 结果未确认', Icon: CirclePause, tone: 'text-muted-ink' },
};
/**
 * 单次工具调用的折叠卡片，展开后是标识、起止时间与错误码。耗时按 `startedAt`／`endedAt` 计算并
 * 在时钟回拨时钳到 0；`interrupted` 明确提示结果未确认，调用方不应据此认为工具失败。
 */
export function ToolActivityCard({ tool }: { tool: ToolActivity }) {
  const state = states[tool.state];
  const known = ['inspect-text', 'inspect_text'].includes(tool.name);
  const duration =
    tool.startedAt && tool.endedAt
      ? Date.parse(tool.endedAt) - Date.parse(tool.startedAt)
      : undefined;
  return (
    <details className={cn(disclosureStyles, toolCardStyles)}>
      <summary>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[color:var(--line)] bg-paper text-brand">
          <Wrench size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <strong className="break-all text-body text-ink">
              {known ? '文本统计' : (toolLabels[tool.name] ?? tool.name)}
            </strong>
            <span className="rounded bg-paper px-1.5 py-0.5 text-caption text-muted-ink">
              工具调用
            </span>
          </span>
          <span className="mt-0.5 block text-caption text-muted-ink">
            {tool.display ?? (known ? '统计文本字符数与行数' : '执行任务所需的工具操作')}
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={cn('flex items-center gap-1.5 text-caption', state.tone)}>
              <state.Icon
                size={13}
                className={tool.state === 'running' ? 'motion-safe:animate-spin' : undefined}
              />
              {state.label}
            </span>
            {duration !== undefined && (
              <span className="flex items-center gap-1 text-caption tabular-nums text-muted-ink">
                <Clock3 size={11} />
                {Math.max(0, duration / 1000).toFixed(1)}s
              </span>
            )}
          </span>
        </span>
        <ChevronDown size={13} className={disclosureChevronStyles} />
      </summary>
      <dl className="grid gap-3 px-4 py-3 text-caption sm:grid-cols-2">
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
            <dd className="mt-0.5 break-all text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
