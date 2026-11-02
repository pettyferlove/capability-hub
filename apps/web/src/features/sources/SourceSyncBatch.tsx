import type { SourceResponse, SourceSyncJobResponse } from '@capability-hub/contracts/http';
import { Message } from '../../shared/components/Message.js';
import { stateLabel } from '../../shared/format/labels.js';
import { ArrowRight, History, RefreshCw } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { tagStyles, tagRedStyles } from '../../shared/styles/recipes.js';
import { sourceLinkStyles, sourceSectionTitleStyles } from './styles.js';

/** 作业完成并不保证每个目标通过校验，目标结果以各自的接收记录为准。 */
export function SourceSyncBatch({
  source,
  job,
  pollError,
  shownError,
  onRetry,
  onIntake,
}: {
  source: SourceResponse;
  job: SourceSyncJobResponse | undefined;
  pollError: string;
  shownError: string | undefined;
  onRetry: () => void;
  onIntake: (id: string) => void;
}) {
  const state = job?.state ?? 'queued';
  const targets = job?.result?.targets;
  const ready = targets?.filter((target) => target.state === 'ready').length;
  const needsAttention =
    targets?.filter((target) => target.state === 'failed' || target.state === 'cancelled').length ??
    0;
  return (
    <section
      aria-label="本次同步"
      className="grid min-w-0 gap-3 border-t border-line bg-page/50 px-4 py-4 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className={sourceSectionTitleStyles}>
          <History size={14} />
          本次同步
        </h4>
        <span role="status" className="text-body text-muted-ink">
          {pollError ? '进度待确认' : state === 'cancelled' ? '已取消' : stateLabel(state)}
          {!!targets?.length && ` · ${ready}/${targets.length} 个目标通过校验`}
          {needsAttention > 0 && <span className="text-warning"> · {needsAttention} 个需处理</span>}
        </span>
      </div>
      {pollError && (
        <Message error>
          <p>读取批次进度失败。{pollError}</p>
          <button type="button" className={sourceLinkStyles} onClick={onRetry}>
            <RefreshCw size={13} />
            刷新进度
          </button>
        </Message>
      )}
      {state !== 'succeeded' && job?.last_error_code && job.last_error_code !== shownError && (
        <Message error>{job.error_message ?? job.last_error_code}</Message>
      )}
      {job?.result?.origin_commit && (
        <p className="min-w-0 text-caption text-muted-ink">
          固定提交 <code className="[overflow-wrap:anywhere]">{job.result.origin_commit}</code>
        </p>
      )}
      {!!targets?.length && (
        <ul className="m-0 grid list-none gap-2 p-0">
          {targets.map((target) => {
            const slug =
              source.targets.find((item) => item.id === target.binding_id)?.slug ??
              `原配置目标 · ${target.binding_id.slice(0, 8)}`;
            return (
              <li
                key={target.binding_id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body"
              >
                <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{slug}</span>
                <span
                  className={cn(
                    tagStyles,
                    target.state === 'ready'
                      ? 'bg-success-soft text-success'
                      : target.state === 'failed' && tagRedStyles,
                  )}
                >
                  {target.state === 'ready'
                    ? '通过校验'
                    : target.state === 'cancelled'
                      ? '已取消'
                      : stateLabel(target.state)}
                </span>
                {target.reused && <span className="text-caption text-muted-ink">复用已有接收</span>}
                {target.error_code && (
                  <code className="text-caption text-danger [overflow-wrap:anywhere]">
                    {target.error_code}
                  </code>
                )}
                <button
                  type="button"
                  aria-label={`查看 ${slug} 的接收结果`}
                  className={cn(sourceLinkStyles, 'ml-auto')}
                  onClick={() => onIntake(target.intake_id)}
                >
                  查看接收
                  <ArrowRight size={13} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
