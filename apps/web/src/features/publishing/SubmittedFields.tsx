import type { PublicationRequestResponse } from '@capability-hub/contracts/http';
import { categoryLabels, type AuditSuggestion } from '../ai/publication-suggestion.js';
import { FieldSuggestion } from './FieldSuggestion.js';

/**
 * 已提交发布申请的三项只读摘要（分类、关键词、用途）；有审计建议时逐项对比，分类须连同适用场景集合
 * 一致才算匹配，关键词按小写比较，用途按原串比较。
 */
export function SubmittedFields({
  publication,
  suggestion,
}: {
  publication: PublicationRequestResponse;
  suggestion?: AuditSuggestion;
}) {
  const fields = suggestion?.fields;
  const keywords = publication.applies_to.keywords ?? [];
  const terms = new Set(keywords.map((term) => term.toLowerCase()));
  return (
    <section
      aria-label="已提交的发布申请"
      className="rounded-2xl border border-separator bg-paper p-5"
    >
      <h4 className="mb-4 font-semibold">已提交的发布申请</h4>
      <dl className="space-y-4">
        <div>
          <dt className="text-caption text-muted-ink">分类</dt>
          <dd>{categoryLabels[publication.category]}</dd>
          {fields && (
            <FieldSuggestion
              label="分类"
              values={[categoryLabels[fields.category]]}
              matched={
                publication.category === fields.category &&
                publication.scenario_ids.length === fields.scenario_ids.length &&
                fields.scenario_ids.every((id) => publication.scenario_ids.includes(id))
              }
              pending={suggestion?.pending}
            />
          )}
        </div>
        <div>
          <dt className="text-caption text-muted-ink">检索关键词</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {keywords.length
              ? keywords.map((word) => (
                  <span key={word} className="rounded-md bg-page px-2 py-1">
                    {word}
                  </span>
                ))
              : '未填写'}
          </dd>
          {fields && (
            <FieldSuggestion
              label="关键词"
              values={fields.keywords}
              matched={fields.keywords.every((word) => terms.has(word.toLowerCase()))}
              pending={suggestion?.pending}
            />
          )}
        </div>
        <div>
          <dt className="text-caption text-muted-ink">共享目的</dt>
          <dd className="whitespace-pre-wrap break-words">{publication.source_consent.purpose}</dd>
          {fields && (
            <FieldSuggestion
              label="共享目的"
              values={[fields.purpose]}
              matched={fields.purpose === publication.source_consent.purpose}
              pending={suggestion?.pending}
            />
          )}
        </div>
      </dl>
    </section>
  );
}
