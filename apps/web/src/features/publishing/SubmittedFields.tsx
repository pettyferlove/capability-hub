import type { PublicationRequestResponse } from '@capability-hub/contracts/http';
import { categoryLabels } from '../ai/publication-suggestion.js';
import { ScenarioSummary } from '../../shared/components/ScenarioSummary.js';

/** 送审摘要只读取提交时冻结的申请字段。 */
export function SubmittedFields({ publication }: { publication: PublicationRequestResponse }) {
  const keywords = publication.applies_to.keywords ?? [];
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
          {publication.category === 'scenario' && (
            <dd>
              <ScenarioSummary policy={publication} />
            </dd>
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
        </div>
        <div>
          <dt className="text-caption text-muted-ink">共享目的</dt>
          <dd className="whitespace-pre-wrap break-words">{publication.source_consent.purpose}</dd>
        </div>
      </dl>
    </section>
  );
}
