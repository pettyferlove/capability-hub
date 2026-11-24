import type { Finding } from '@capability-hub/domain/content';
import { evaluationThresholds, scoreChecks } from '@capability-hub/domain/evaluation';
import type {
  EvaluationCheckResult,
  EvaluationDimensionResult,
  EvaluationEvidence,
} from '@capability-hub/domain/models';
import type { transparencySchema } from '@capability-hub/hub-agents';
import type { z } from 'zod';
import { sentEvidence } from './model-input.js';
import { redactedLine, redactedLines } from './skill-packing.js';

/** 扫描器的描述可能包含敏感材料，模型仅收到规则定位。摘要也计入请求的剩余空间。 */
export function scanHints(findings: Finding[]) {
  const hints: Pick<Finding, 'rule_id' | 'file' | 'line'>[] = [];
  let bytes = 0;
  for (const { rule_id, file, line } of findings) {
    if (redactedLines(file)[0] === redactedLine) continue;
    const hint = { rule_id, file, line };
    bytes += Buffer.byteLength(JSON.stringify(JSON.stringify(hint))) + 1;
    if (bytes > 2048) break;
    hints.push(hint);
  }
  return { hints, limited: hints.length < findings.length };
}

/** 无有效行段的判定不计权重；操纵闸门也须由已发送的内容佐证。 */
export function scoreTransparency(
  result: z.infer<typeof transparencySchema>,
  ranges: EvaluationEvidence[],
  limited: boolean,
): EvaluationDimensionResult {
  const checks: EvaluationCheckResult[] = (
    ['requirements', 'credentials', 'side_effects', 'network'] as const
  ).map((id) => {
    const check = result[id];
    const evidence = sentEvidence(check.evidence, ranges);
    return {
      id: 'transparency.' + id,
      evidence,
      verdict: evidence.length ? check.verdict : 'na',
      ...(evidence.length
        ? { note: check.note, suggestion: check.suggestion }
        : { note: '缺少已装填行段的有效依据。' }),
    };
  });
  const evidence = sentEvidence(result.manipulation.evidence, ranges);
  const suspected = result.manipulation.suspected && evidence.length > 0;
  checks.push({
    id: 'transparency.no_manipulation',
    verdict: evidence.length ? (suspected ? 'fail' : 'pass') : 'na',
    evidence,
    ...(evidence.length && { note: result.manipulation.note }),
  });
  const { score, status } = scoreChecks('transparency', checks);
  return {
    id: 'transparency',
    status,
    score:
      score !== null && suspected
        ? Math.min(score, evaluationThresholds.transparency.manipulationCap)
        : score,
    confidence: score === null ? null : limited ? 'low' : 'medium',
    checks,
    flags: [
      ...(limited ? ['coverage_limited' as const] : []),
      ...(suspected ? ['manipulation_suspected' as const] : []),
    ],
    summary: result.summary,
  };
}
