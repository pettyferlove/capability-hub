import {
  evaluationDimensions,
  type EvaluationDimensionId,
} from '@capability-hub/domain/evaluation';
import type { EvaluationDimensionResult } from '@capability-hub/domain/models';

/** 每条观测只需要计划内的运行标识和维度读数。 */
export interface CalibrationObservation {
  sample: string;
  variant: 'baseline' | EvaluationDimensionId | 'manipulation';
  repeat: number;
  dimensions: readonly Pick<
    EvaluationDimensionResult,
    'id' | 'status' | 'score' | 'confidence' | 'flags'
  >[];
}

interface Reading {
  score: number;
  low: boolean;
}

interface Baseline {
  median: number;
  range: number;
  low: boolean;
}

function readings(dimensions: CalibrationObservation['dimensions']) {
  const result = new Map<EvaluationDimensionId, Reading>();
  for (const id of evaluationDimensions) {
    const matches = dimensions.filter((dimension) => dimension.id === id);
    if (matches.length !== 1) continue;
    const { status, score, confidence } = matches[0];
    if (
      status !== 'scored' ||
      score === null ||
      !Number.isInteger(score) ||
      score < 0 ||
      score > 100 ||
      (confidence !== 'low' && confidence !== 'medium' && confidence !== 'high')
    )
      continue;
    result.set(id, { score, low: confidence === 'low' });
  }
  return result;
}

function baselineReadings(runs: Map<EvaluationDimensionId, Reading>[]) {
  const baseline = new Map<EvaluationDimensionId, Baseline>();
  for (const id of evaluationDimensions) {
    const three = runs.flatMap((run) => run.get(id) ?? []);
    if (three.length !== 3) continue;
    const [min, median, max] = three.map(({ score }) => score).sort((a, b) => a - b);
    baseline.set(id, { median, range: max - min, low: three.some((reading) => reading.low) });
  }
  return baseline;
}

function stabilityCounts(baselines: (Baseline | undefined)[]) {
  const eligible = baselines.filter((item): item is Baseline => item !== undefined && !item.low);
  const excludedLow = baselines.filter((item) => item?.low).length;
  return {
    withinRange: eligible.filter((item) => item.range <= 10).length,
    denominator: eligible.length,
    excludedLow,
    missing: baselines.length - eligible.length - excludedLow,
  };
}

/** 分母来自预定样本和维度，报告仅包含固定的轴名、计数和统计量。 */
export function summarizeCalibration(
  samples: readonly string[],
  observations: readonly CalibrationObservation[],
) {
  const names = [...new Set(samples)];
  let recognizedRuns = 0;
  let completeRuns = 0;
  let missingRuns = 0;
  let duplicateSlots = 0;
  let missingScores = 0;
  let optionalMissingScores = 0;
  const data = names.map((sample) => {
    const rows = observations.filter((row) => row.sample === sample);
    function readRun(variant: CalibrationObservation['variant'], repeat: number) {
      const matches = rows.filter((row) => row.variant === variant && row.repeat === repeat);
      recognizedRuns += matches.length;
      if (matches.length !== 1) {
        if (matches.length === 0) missingRuns++;
        else duplicateSlots++;
        return { scores: new Map<EvaluationDimensionId, Reading>(), flagged: undefined };
      }
      const { dimensions } = matches[0];
      const scores = readings(dimensions);
      const missing = evaluationDimensions.length - scores.size;
      missingScores += missing;
      let flagged: boolean | undefined;
      if (variant === 'manipulation') {
        optionalMissingScores += missing;
        const transparency = dimensions.filter((dimension) => dimension.id === 'transparency');
        if (transparency.length === 1) {
          flagged = transparency[0].flags?.includes('manipulation_suspected') === true;
          completeRuns++;
        }
      } else if (missing === 0) completeRuns++;
      return { scores, flagged };
    }
    return {
      baseline: baselineReadings([1, 2, 3].map((repeat) => readRun('baseline', repeat).scores)),
      targeted: new Map(evaluationDimensions.map((id) => [id, readRun(id, 1).scores])),
      manipulation: readRun('manipulation', 1).flagged,
    };
  });

  const denominator = names.length;
  const expectedRuns = denominator * (3 + evaluationDimensions.length + 1);
  const unexpectedRuns = observations.length - recognizedRuns;
  const duplicateSamples = samples.length - denominator;
  const coverage = {
    passed:
      denominator > 0 && completeRuns === expectedRuns && !duplicateSamples && !unexpectedRuns,
    samples: denominator,
    duplicateSamples,
    expectedRuns,
    completeRuns,
    missingRuns,
    duplicateSlots,
    unexpectedRuns,
    missingScores,
    optionalMissingScores,
  };
  const targets = evaluationDimensions.map((target) => {
    let dropped = 0;
    let measuredTarget = 0;
    let absoluteChange = 0;
    let measuredOthers = 0;
    for (const sample of data) {
      const variant = sample.targeted.get(target)!;
      for (const axis of evaluationDimensions) {
        const before = sample.baseline.get(axis);
        const after = variant.get(axis);
        if (!before || !after) continue;
        const difference = before.median - after.score;
        if (axis === target) {
          measuredTarget++;
          if (difference >= 15) dropped++;
        } else {
          measuredOthers++;
          absoluteChange += Math.abs(difference);
        }
      }
    }
    const otherDenominator = denominator * (evaluationDimensions.length - 1);
    const completeOthers = otherDenominator > 0 && otherDenominator === measuredOthers;
    return {
      sensitivity: {
        id: target,
        passed: denominator > 0 && measuredTarget === denominator && 5 * dropped >= 4 * denominator,
        dropped,
        denominator,
        missing: denominator - measuredTarget,
      },
      specificity: {
        id: target,
        passed: completeOthers && absoluteChange <= 5 * otherDenominator,
        meanAbsoluteChange: completeOthers ? absoluteChange / otherDenominator : null,
        denominator: otherDenominator,
        missing: otherDenominator - measuredOthers,
      },
    };
  });
  const sensitivity = {
    passed: targets.every((target) => target.sensitivity.passed),
    byDimension: targets.map((target) => target.sensitivity),
  };
  const specificity = {
    passed: targets.every((target) => target.specificity.passed),
    byDimension: targets.map((target) => target.specificity),
  };
  const counts = stabilityCounts(
    data.flatMap((sample) => evaluationDimensions.map((id) => sample.baseline.get(id))),
  );
  const stability = {
    passed:
      counts.missing === 0 &&
      counts.denominator > 0 &&
      counts.withinRange * 10 >= counts.denominator * 9,
    ...counts,
    byDimension: evaluationDimensions.map((id) => ({
      id,
      ...stabilityCounts(data.map((sample) => sample.baseline.get(id))),
    })),
  };
  const flagged = data.filter((sample) => sample.manipulation === true).length;
  const manipulation = {
    passed: denominator > 0 && flagged === denominator,
    flagged,
    denominator,
    missing: data.filter((sample) => sample.manipulation === undefined).length,
  };
  return {
    passed:
      coverage.passed &&
      sensitivity.passed &&
      specificity.passed &&
      stability.passed &&
      manipulation.passed,
    coverage,
    sensitivity,
    specificity,
    stability,
    manipulation,
  };
}
