import type { AiExecutionViewResponse } from '@capability-hub/contracts';
import { cn } from '../../shared/styles/cn.js';
import { businessPhase, businessPhases } from './activity.js';

/** 研判阶段的一行文案：未开始为「排队中」，全部完成为「已完成」。 */
export function phaseLabel(view: AiExecutionViewResponse) {
  const { index } = businessPhase(view);
  return index < 0 ? '排队中' : (businessPhases[index] ?? '已完成');
}

/**
 * 研判四阶段进度条，颜色继承自 `currentColor`。当前段在运行中做扫光、等待人工时呼吸、
 * 中断时标红；`labeled` 为假时只渲染分段条，文案由调用方另行展示。
 */
export function PhaseTrack({
  view,
  labeled = false,
  className,
}: {
  view: AiExecutionViewResponse;
  labeled?: boolean;
  className?: string;
}) {
  const { index, halted } = businessPhase(view);
  const status = view.execution.status;
  const bar = (position: number) => (
    <span
      aria-hidden="true"
      className={cn(
        'relative block h-1 overflow-hidden rounded-full',
        position < index
          ? 'bg-current'
          : position === index
            ? halted
              ? 'bg-danger'
              : status === 'waiting_input'
                ? 'bg-current/60 motion-safe:animate-pulse'
                : 'bg-current/25'
            : 'bg-current/12',
      )}
    >
      {position === index && !halted && status === 'running' && (
        <span className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-current motion-safe:animate-[agent-sweep_1.6s_ease-in-out_infinite]" />
      )}
    </span>
  );
  if (!labeled)
    return (
      <span
        role="img"
        aria-label={`研判进度 ${Math.max(0, Math.min(index, 4))}/4`}
        className={cn('grid w-16 shrink-0 grid-cols-4 gap-[3px]', className)}
      >
        {businessPhases.map((label, position) => (
          <span key={label}>{bar(position)}</span>
        ))}
      </span>
    );
  return (
    <ol aria-label="研判进度" className={cn('grid grid-cols-4 gap-2 text-caption', className)}>
      {businessPhases.map((label, position) => (
        <li
          key={label}
          aria-current={position === index ? 'step' : undefined}
          className={cn(
            'flex min-w-0 flex-col gap-1.5',
            position === index
              ? halted
                ? 'font-semibold text-danger'
                : 'font-semibold text-ink'
              : 'text-muted-ink',
          )}
        >
          <span
            className={cn(
              position === index && !halted
                ? status === 'waiting_input'
                  ? 'text-warning'
                  : 'text-brand'
                : position < index
                  ? 'text-brand'
                  : 'text-muted-ink',
            )}
          >
            {bar(position)}
          </span>
          <span className="truncate">
            {String(position + 1).padStart(2, '0')} {label}
          </span>
        </li>
      ))}
    </ol>
  );
}
