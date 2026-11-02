import {
  publicationSuggestionSchema,
  type AiExecutionResponse,
  type AiExecutionViewResponse,
  type PublicationSuggestion,
  type PublicationDraftPolicy,
} from '@capability-hub/contracts';
import { jsonObject, type Json } from './presentation.js';

/** 分类文案，键必须覆盖契约 `PublicationSuggestion.category` 的取值；它不承担缺省回退。 */
export const categoryLabels = { general: '通用', scenario: '场景', uncategorized: '未分类' };

/** 顺序不影响建议匹配，维护者改写了场景说明则视为不同定义。 */
export function sameClassification(
  left: Pick<PublicationDraftPolicy, 'category' | 'scenario_ids' | 'proposed_scenarios'>,
  right: PublicationSuggestion,
) {
  const proposals = left.proposed_scenarios ?? [];
  const suggested = right.proposed_scenarios ?? [];
  return (
    left.category === right.category &&
    left.scenario_ids.length === right.scenario_ids.length &&
    right.scenario_ids.every((id) => left.scenario_ids.includes(id)) &&
    proposals.length === suggested.length &&
    suggested.every((item) =>
      proposals.some((p) => p.name === item.name && p.description === item.description),
    )
  );
}

/** 审计报告里需要人工留意的一条发现，`evidence` 是路径加成行号区间的人类可读引用。 */
export interface AuditNotice {
  title: string;
  explanation: string;
  evidence: string[];
}

/**
 * 可回填到发布表单的审计建议，由审计报告派生；结构不符或版本对不上时上游直接返回 `undefined`。
 */
export interface AuditSuggestion {
  executionId: string;
  /** 必须与任务输入里固定的 `version_id` 一致，否则整条建议作废，避免回填到别的版本。 */
  versionId: string;
  /** 内容摘要，与版本号一起用于判断建议是否还对应当前内容，失配时不回填。 */
  digest: string;
  fields: PublicationSuggestion;
  /** 上游总是填数组（可为空）；只有 severity 为 warning 或 critical 的发现才会进来。 */
  notices?: AuditNotice[];
  /** 仅在等待人工确认阶段为 `true`；采纳后从任务结果重建的同一结构不带此标记。 */
  pending?: boolean;
}

/**
 * 从报告 JSON 中取 `assessment.publication_suggestion` 并按契约 schema 校验，任一层结构不符都返回
 * `undefined` 而不抛错；调用方必须自己处理「没有建议」的情形。
 */
export function reportSuggestion(value: Json | undefined) {
  const parsed = publicationSuggestionSchema.safeParse(
    jsonObject(jsonObject(value).assessment).publication_suggestion,
  );
  return parsed.success ? parsed.data : undefined;
}

function suggestionFor(
  execution: AiExecutionResponse,
  report: Json | undefined,
): AuditSuggestion | undefined {
  const result = jsonObject(report);
  const fields = reportSuggestion(result);
  if (
    execution.operation_id !== 'resource-audit' ||
    !fields ||
    typeof result.version_id !== 'string' ||
    jsonObject(execution.input).version_id !== result.version_id ||
    typeof result.content_digest !== 'string'
  )
    return;
  const findings = jsonObject(result.assessment).findings;
  const notices = (Array.isArray(findings) ? findings : []).flatMap((raw) => {
    const item = jsonObject(raw);
    if (
      (item.severity !== 'warning' && item.severity !== 'critical') ||
      typeof item.title !== 'string' ||
      typeof item.explanation !== 'string'
    )
      return [];
    const evidence = (Array.isArray(item.evidence) ? item.evidence : []).flatMap((raw) => {
      const ref = jsonObject(raw);
      return typeof ref.path === 'string' &&
        typeof ref.start_line === 'number' &&
        typeof ref.end_line === 'number'
        ? [`${ref.path}:${ref.start_line}–${ref.end_line}`]
        : [];
    });
    return [{ title: item.title, explanation: item.explanation, evidence }];
  });
  return {
    executionId: execution.id,
    versionId: result.version_id,
    digest: result.content_digest,
    fields,
    notices,
  };
}

/**
 * 已完成任务中被采纳的建议：要求状态为 succeeded 且结果 `approved` 严格等于 `true`（`1`、`"true"`
 * 都不算），再交给版本与摘要校验，因此过期报告的采纳结果会静默返回 `undefined`。
 */
export function acceptedSuggestion(execution: AiExecutionResponse | undefined) {
  if (execution?.status === 'succeeded' && jsonObject(execution.result).approved === true)
    return suggestionFor(execution, execution.result);
}

/**
 * 等待人工确认时的建议：只认 `waiting_input` 状态，取第一个 pending 交互的 `request.assessment`，
 * 命中则附带 `pending: true`；交互缺失或报告结构不符时返回 `undefined`。
 */
export function pendingSuggestion(view: AiExecutionViewResponse | undefined) {
  if (view?.execution.status !== 'waiting_input') return;
  const request = view.interactions.find((item) => item.status === 'pending')?.request;
  const proposal = suggestionFor(view.execution, jsonObject(request).assessment);
  return proposal && { ...proposal, pending: true };
}
