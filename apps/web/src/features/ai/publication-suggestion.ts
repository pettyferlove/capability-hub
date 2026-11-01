import {
  publicationSuggestionSchema,
  type AiExecutionResponse,
  type AiExecutionViewResponse,
  type PublicationSuggestion,
} from '@capability-hub/contracts';
import { jsonObject, type Json } from './presentation.js';

export const categoryLabels = { general: '通用', scenario: '场景', uncategorized: '未分类' };

export interface AuditNotice {
  title: string;
  explanation: string;
  evidence: string[];
}
export interface AuditSuggestion {
  executionId: string;
  versionId: string;
  digest: string;
  fields: PublicationSuggestion;
  notices?: AuditNotice[];
  pending?: boolean;
}

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

export function acceptedSuggestion(execution: AiExecutionResponse | undefined) {
  if (execution?.status === 'succeeded' && jsonObject(execution.result).approved === true)
    return suggestionFor(execution, execution.result);
}

export function pendingSuggestion(view: AiExecutionViewResponse | undefined) {
  if (view?.execution.status !== 'waiting_input') return;
  const request = view.interactions.find((item) => item.status === 'pending')?.request;
  const proposal = suggestionFor(view.execution, jsonObject(request).assessment);
  return proposal && { ...proposal, pending: true };
}
