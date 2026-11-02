import type { AiExecutionResponse, AiExecutionViewResponse } from '@capability-hub/contracts';
import type { ReviewResponse } from '@capability-hub/contracts/http';
import { riskLabels } from '../ai/agent-brief.js';
import { jsonObject, statusLabels, toolLabels, type Json } from '../ai/presentation.js';
import type { ReviewFileFocus } from './types.js';

type ReviewTarget = Pick<ReviewResponse, 'id' | 'revision' | 'policy_digest' | 'can_decide'>;
type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

interface BriefSignal {
  label: string;
  text: string;
  tone: Tone;
  phase?: 'investigate' | 'assessment';
  evidence?: Required<ReviewFileFocus>;
}

function firstPoint(value: Json | undefined) {
  if (typeof value !== 'string') return '';
  const line = value
    .trim()
    .replace(/^(?:[-*]\s+|\d+[.、)](?!\d)\s*)/u, '')
    .replace(/`([^`\n]+)`/g, '$1');
  const first = line.split(/(?:[；;]\s*|\s+)(?=\d+[.、)](?!\d))/u, 1)[0];
  const point = first.match(/^[^\n。！？!?]+[。！？!?]?/u)?.[0]?.trim() ?? '';
  return point.length > 72 ? point.slice(0, 71) + '…' : point;
}

function fileRange(path: Json | undefined, start: Json | undefined, end: Json | undefined) {
  if (
    typeof path === 'string' &&
    path &&
    typeof start === 'number' &&
    Number.isInteger(start) &&
    start > 0 &&
    typeof end === 'number' &&
    Number.isInteger(end) &&
    end >= start
  )
    return { path, start, end };
}

/** 底栏只选一个核对事项，跳转行号必须与这条发现或告警来自同一份依据。 */
function priorityCheck(report: Record<string, Json>, assessment: Record<string, Json>) {
  const findings = Array.isArray(assessment.findings) ? assessment.findings.map(jsonObject) : [];
  const critical = findings.find((item) => item.severity === 'critical');
  if (!critical && Array.isArray(assessment.warning_questions) && Array.isArray(report.warnings)) {
    const question = jsonObject(assessment.warning_questions[0]);
    const warning = report.warnings
      .map(jsonObject)
      .find((item) => item.finding_id === question.finding_id);
    const text = firstPoint(question.question);
    if (warning && text) {
      return {
        text,
        evidence: fileRange(warning.file, warning.line, warning.line),
      };
    }
  }
  const finding = critical ?? findings.find((item) => item.severity === 'warning') ?? findings[0];
  const ref = jsonObject(Array.isArray(finding?.evidence) ? finding.evidence[0] : undefined);
  return {
    text:
      firstPoint(finding?.recommendation) ||
      firstPoint(finding?.title) ||
      firstPoint(assessment.suggested_resolution) ||
      firstPoint(assessment.summary) ||
      '请核对申请的分发范围和来源授权。',
    evidence: fileRange(ref.path, ref.start_line, ref.end_line),
  };
}

/** 文件定位只用于仍可审核且基线匹配的申请，历史研判仅保留当时的风险。 */
export function reviewBriefSignal(
  request: ReviewTarget,
  task?: AiExecutionResponse | null,
  view?: AiExecutionViewResponse,
): BriefSignal {
  if (!task)
    return { label: '待研判', text: '核对本次分发变化、资源声明和扫描告警。', tone: 'neutral' };
  const report = jsonObject(task.result);
  const assessment = jsonObject(report.assessment);
  const risk = typeof assessment.risk === 'string' ? assessment.risk : 'unknown';
  const riskLabel = riskLabels[risk] ?? '证据有限';
  if (!request.can_decide)
    return {
      label: '历史研判',
      tone: 'neutral',
      text:
        task.status === 'succeeded' ? '当时的风险评估 · ' + riskLabel : statusLabels[task.status],
    };
  switch (task.status) {
    case 'queued':
      return { label: '已排队', text: '等待开始研判，可以继续审查申请。', tone: 'brand' };
    case 'running': {
      const assessing = view?.activity.some(
        (event) => event.type === 'step.started' && event.data.step_id === 'assessment',
      );
      if (assessing)
        return {
          label: '整理结论',
          text: '正在归纳风险和需要人工核对的事项。',
          tone: 'brand',
          phase: 'assessment',
        };
      const event = view?.activity
        .slice()
        .reverse()
        .find((item) => item.type.startsWith('tool.'));
      const tool = typeof event?.data.tool_id === 'string' && toolLabels[event.data.tool_id];
      return {
        label: '查阅依据',
        text:
          tool && event?.type === 'tool.started'
            ? '正在' + tool + '。'
            : '正在核对申请基线、候选文件和扫描告警。',
        tone: 'brand',
        phase: 'investigate',
      };
    }
    case 'succeeded': {
      const snapshot = jsonObject(report.snapshot);
      if (
        snapshot.publication_request_id !== request.id ||
        snapshot.request_revision !== request.revision ||
        snapshot.policy_digest !== request.policy_digest
      )
        return { label: '基线已变', text: '请按当前申请重新研判。', tone: 'warning' };
      return {
        label: riskLabel,
        tone:
          risk === 'high'
            ? 'danger'
            : risk === 'medium'
              ? 'warning'
              : risk === 'low'
                ? 'success'
                : 'neutral',
        ...priorityCheck(report, assessment),
      };
    }
    case 'cancelled':
      return { label: '已取消', text: '可重新研判，也可继续人工审核。', tone: 'neutral' };
    case 'waiting_input':
      return { label: '已暂停', text: '可取消此次研判，或继续人工审核。', tone: 'warning' };
    default:
      return {
        label: statusLabels[task.status],
        text: firstPoint(task.error?.message) || '可以重试研判，或继续人工审核。',
        tone: 'warning',
      };
  }
}
