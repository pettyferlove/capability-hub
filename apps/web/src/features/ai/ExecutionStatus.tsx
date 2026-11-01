import type { AiExecutionResponse } from '@capability-hub/contracts';
import { Check, CirclePause, Clock3, LoaderCircle, X } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { statusLabels } from './presentation.js';
import { statusDotStyles, statusStyles, statusToneStyles } from './styles.js';

/**
 * 执行状态徽标：图标与文案全部由 `{@link statusLabels}` 驱动，未单列的失败类状态共用叉号图标，
 * 运行中才播放旋转动画。`compact` 用于列表：只保留状态色圆点与文字，运行中圆点呼吸。
 */
export function ExecutionStatus({
  status,
  compact = false,
}: {
  status: AiExecutionResponse['status'];
  compact?: boolean;
}) {
  if (compact)
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-caption text-muted-ink">
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 rounded-full',
            statusDotStyles[status],
            status === 'running' && 'motion-safe:animate-pulse',
          )}
        />
        {statusLabels[status]}
      </span>
    );
  const Icon =
    status === 'running'
      ? LoaderCircle
      : status === 'succeeded'
        ? Check
        : status === 'waiting_input'
          ? CirclePause
          : status === 'queued'
            ? Clock3
            : X;
  return (
    <span className={cn(statusStyles, statusToneStyles[status])}>
      <Icon size={13} className={status === 'running' ? 'motion-safe:animate-spin' : undefined} />
      {statusLabels[status]}
    </span>
  );
}
