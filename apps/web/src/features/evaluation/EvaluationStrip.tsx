import type { EvaluationResponse } from '@capability-hub/contracts/http';
import { Button } from 'react-aria-components';
import { RadarChart } from '../../shared/components/RadarChart.js';
import { ChevronRight } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { evaluationReadings, labels, warningBand } from './evaluation-view.js';
import {
  evaluationStripActionStyles,
  evaluationStripReadingsStyles,
  evaluationStripStyles,
} from './styles.js';

/** 详情入口只使用公开视图；维护明细在进入评测页签后读取。 */
export function EvaluationStrip({
  published,
  onOpen,
}: {
  published: EvaluationResponse;
  onOpen: () => void;
}) {
  const data = published.evaluation;
  const readings = data && evaluationReadings(data);
  const showRadar = readings && readings.count >= 3;
  const headline =
    readings?.headline ||
    (!published.updating &&
      (data || published.latest_attempt_id ? '暂无可展示的分数' : '尚未评测'));
  const states = [
    data && data.rubric_version !== published.current_rubric_version && '旧评测标准',
    data?.state === 'partial' && '部分完成',
    data?.limitations.includes('static_only') && '仅静态评测',
    published.updating && (data ? '正在更新' : '首轮评测进行中'),
  ].filter(Boolean);
  return (
    <section
      aria-label="质量评测摘要"
      className={cn(
        evaluationStripStyles,
        showRadar ? 'grid-cols-[auto_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,1fr)_auto]',
      )}
    >
      {showRadar && (
        <span className="col-start-1 row-start-1 sm:row-span-2 [&>svg]:size-6 sm:[&>svg]:size-10">
          <RadarChart axes={readings.axes} size="glyph" />
        </span>
      )}
      <div className="col-end-[-2] row-start-1 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-body font-semibold">质量评测</h3>
        {headline && <span className="text-label text-ink">{headline}</span>}
        {data?.evaluated_at && (
          <time className="text-caption tabular-nums text-muted-ink" dateTime={data.evaluated_at}>
            {data.evaluated_at.slice(0, 10)}
          </time>
        )}
        {states.length > 0 && (
          <span className="text-caption text-muted-ink">{states.join(' · ')}</span>
        )}
      </div>
      <Button
        className={cn(evaluationStripActionStyles, readings && 'sm:row-span-2')}
        onPress={onOpen}
      >
        {published.can_request && !data && !published.updating ? '前往发起评测' : '查看评测详情'}
        <ChevronRight size={14} aria-hidden="true" />
      </Button>
      {readings && (
        <dl aria-label="五维读数" className={evaluationStripReadingsStyles}>
          {readings.axes.map((axis) => (
            <div key={axis.id} className="whitespace-nowrap">
              <dt
                className={cn('relative inline-block text-muted-ink', axis.confidence && 'ps-2.5')}
              >
                {axis.confidence && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute start-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full border border-current',
                      axis.confidence !== 'low' && 'bg-current',
                    )}
                  />
                )}
                {axis.label}
              </dt>
              <dd className="ms-1 inline">
                {axis.score === null ? (
                  <span className="text-muted-ink">{axis.statusLabel}</span>
                ) : (
                  <>
                    <strong className="font-semibold tabular-nums">{axis.score} 分</strong>
                    {axis.band && (
                      <span
                        className={cn('ms-1 text-muted-ink', warningBand(axis) && 'text-warning')}
                      >
                        {labels[axis.band]}
                      </span>
                    )}
                    <span className="sr-only">
                      {axis.confidence ? labels[axis.confidence] : '未标注置信度'}
                    </span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
