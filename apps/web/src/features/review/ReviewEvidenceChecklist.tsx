import { useMemo } from 'react';
import type { ReviewResponse } from '@capability-hub/contracts/http';
import { ChevronDown } from '../../shared/icons/lucide.js';
import { AiText } from '../ai/AiText.js';
import { jsonObject, type Json } from '../ai/presentation.js';
import { fileRange, matchesReviewBrief } from './review-brief.js';
import type { ReviewFileFocus } from './types.js';

/** 决定抽屉的告警绑定申请快照，版本证据绑定候选内容。 */
export type ReviewChecklistTarget = Pick<
  ReviewResponse,
  | 'id'
  | 'revision'
  | 'policy_digest'
  | 'can_decide'
  | 'version_id'
  | 'content_digest'
  | 'scan_run_id'
  | 'scan'
>;

type Range = Required<ReviewFileFocus>;
type EvidenceLink = (path: string, start: number, end: number) => void;
const sources = {
  warning: '简报 · 冻结告警',
  brief: '简报 · 文件发现',
  audit: '版本审计',
} as const;

interface Check {
  id: string;
  source: keyof typeof sources;
  title: string;
  explanation?: string;
  ranges: Range[];
}

function readRanges(value: Json | undefined) {
  const ranges: Range[] = [];
  if (Array.isArray(value))
    for (const raw of value) {
      const item = jsonObject(raw);
      const range = fileRange(item.path, item.start_line, item.end_line);
      if (range) ranges.push(range);
    }
  return ranges;
}

function findingChecks(assessment: Record<string, Json>, source: 'brief' | 'audit') {
  const checks: Check[] = [];
  if (Array.isArray(assessment.findings))
    for (const [index, raw] of assessment.findings.entries()) {
      const item = jsonObject(raw);
      if (typeof item.title !== 'string' || !item.title.trim()) continue;
      const ranges = readRanges(item.evidence);
      if (!ranges.length) continue;
      checks.push({
        id: `${source}:${index}`,
        source,
        title: item.title,
        explanation: typeof item.explanation === 'string' ? item.explanation : undefined,
        ranges,
      });
    }
  return checks;
}

function briefChecks(request: ReviewChecklistTarget, brief: Json | undefined) {
  const report = jsonObject(brief);
  const snapshot = jsonObject(report.snapshot);
  if (
    !matchesReviewBrief(request, snapshot) ||
    snapshot.version_id !== request.version_id ||
    snapshot.content_digest !== request.content_digest ||
    snapshot.scan_run_id !== request.scan_run_id
  )
    return [];
  const assessment = jsonObject(report.assessment);
  const checks: Check[] = [];
  const scan = request.scan;
  if (
    scan?.id === request.scan_run_id &&
    Array.isArray(assessment.warning_questions) &&
    assessment.warning_questions.length
  ) {
    const warnings = new Map(scan.findings.map((finding) => [finding.id, finding]));
    for (const raw of assessment.warning_questions) {
      const { finding_id: id, question } = jsonObject(raw);
      if (typeof id !== 'string' || typeof question !== 'string' || !question.trim()) continue;
      const warning = warnings.get(id);
      if (warning?.severity !== 'warning') continue;
      warnings.delete(id);
      const range = fileRange(warning.file, warning.line, warning.line);
      checks.push({
        id: `warning:${id}`,
        source: 'warning',
        title: question,
        explanation: warning.evidence_summary,
        ranges: range ? [range] : [],
      });
    }
  }
  checks.push(...findingChecks(assessment, 'brief'));
  return checks;
}

function checklist(
  request: ReviewChecklistTarget,
  brief: Json | undefined,
  audit: Json | undefined,
) {
  const items: { check: Check; related?: Check[] }[] = [];
  if (!request.can_decide) return { items, auditedFiles: 0 };
  for (const check of briefChecks(request, brief)) items.push({ check });
  if (!audit) return { items, auditedFiles: 0 };
  const report = jsonObject(audit);
  for (const check of findingChecks(jsonObject(report.assessment), 'audit')) {
    // 审计报告没有冻结告警 ID；行段相交只表示相关，不证明两项结论相同。
    const match = items.find(
      ({ check: item }) =>
        item.source !== 'audit' &&
        item.ranges.some((a) =>
          check.ranges.some((b) => a.path === b.path && a.start <= b.end && b.start <= a.end),
        ),
    );
    if (match) (match.related ??= []).push(check);
    else items.push({ check });
  }
  const files = new Set<string>();
  if (Array.isArray(report.inspected))
    for (const raw of report.inspected) {
      const { path } = jsonObject(raw);
      if (typeof path === 'string' && path) files.add(path);
    }
  return { items, auditedFiles: files.size };
}

function CheckEvidence({ check, onEvidence }: { check: Check; onEvidence: EvidenceLink }) {
  return (
    <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
      <p className="text-label font-semibold text-ink">{check.title}</p>
      {check.explanation && <AiText text={check.explanation} />}
      {check.ranges.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {check.ranges.map(({ path, start, end }, index) => (
            <button
              key={index}
              type="button"
              className="min-h-6 break-all text-left font-mono text-caption text-brand underline"
              onClick={() => onEvidence(path, start, end)}
            >
              {path}:{start}
              {end !== start && `–${end}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 清单只消费已有证据，引用待采纳报告不会填写审核意见或记录人工决定。 */
export function ReviewEvidenceChecklist({
  request,
  brief,
  audit,
  onEvidence,
}: {
  request: ReviewChecklistTarget;
  brief?: Json;
  audit?: Json;
  onEvidence: EvidenceLink;
}) {
  const { items, auditedFiles } = useMemo(
    () => checklist(request, brief, audit),
    [request, brief, audit],
  );
  if (!items.length) return null;
  return (
    <section
      aria-label="核对清单"
      className="min-w-0 overflow-hidden rounded-2xl border border-line bg-paper"
    >
      <details open className="group/checklist">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-body font-semibold text-ink focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
          核对清单
          <span className="text-caption font-normal text-muted-ink">{items.length} 项</span>
          <ChevronDown
            aria-hidden="true"
            size={14}
            className="ml-auto group-open/checklist:rotate-180"
          />
        </summary>
        {audit && (
          <p className="px-3.5 pb-2.5 text-caption text-muted-ink">
            {auditedFiles > 0 && `版本审计已读 ${auditedFiles} 个文件。`}
            相关证据只表示文件行段相交，不代表已核实或已采纳。
          </p>
        )}
        <ul className="divide-y divide-line border-t border-line">
          {items.map(({ check, related }) => (
            <li key={check.id} className="space-y-1.5 px-3.5 py-2.5">
              <p className="text-caption text-muted-ink">{sources[check.source]}</p>
              <CheckEvidence check={check} onEvidence={onEvidence} />
              {related && (
                <div className="space-y-2 border-s-2 border-line ps-3">
                  <p className="text-caption text-muted-ink">相关审计证据</p>
                  {related.map((evidence) => (
                    <CheckEvidence key={evidence.id} check={evidence} onEvidence={onEvidence} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
