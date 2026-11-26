import type { EvaluationSummaryResponse } from '@capability-hub/contracts/http';
import { RadarChart } from '../../shared/components/RadarChart.js';
import { evaluationCoverage } from './evaluation-view.js';

/** 只有至少三个现行读数才画图；图形的文字等价信息只提供给读屏。 */
export function EvaluationCardSummary({ evaluation }: { evaluation?: EvaluationSummaryResponse }) {
  if (!evaluation || evaluation.dimensions.length < 3) return null;
  const { axes, count } = evaluationCoverage(evaluation);
  if (count < 3) return null;
  const readings = axes.map(({ label, score }) =>
    score === null ? `${label}无评分` : `${label} ${score} 分`,
  );
  return (
    <span
      className="ms-auto shrink-0"
      role="img"
      aria-label={`质量评测雷达图：${readings.join('，')}`}
    >
      <RadarChart axes={axes} size="card" />
    </span>
  );
}
