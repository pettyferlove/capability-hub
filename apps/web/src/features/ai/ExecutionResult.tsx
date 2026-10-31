import type { AiExecutionViewResponse } from '@capability-hub/contracts';
import {
  Check,
  CheckCheck,
  ChevronDown,
  FileJson,
  FileText,
  MessageSquare,
  ShieldCheck,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { AiText } from './AiText.js';
import { jsonObject, proposalOf } from './presentation.js';
import {
  codeStyles,
  disclosureChevronStyles,
  disclosureStyles,
  eyebrowStyles,
  readingWidthStyles,
  resultCardStyles,
} from './styles.js';

export function ExecutionResult({ view }: { view: AiExecutionViewResponse }) {
  const resultProposal =
    view.execution.operation_id === 'agent-lab' ? proposalOf(view.execution.result) : undefined;
  const proposalArtifact = view.artifacts.find(
    (item) => item.name === 'proposal' && proposalOf(item.content),
  );
  const proposal =
    resultProposal ??
    (view.execution.operation_id === 'agent-lab'
      ? proposalOf(proposalArtifact?.content)
      : undefined);
  const evaluation =
    view.execution.operation_id === 'agent-lab'
      ? view.artifacts.find(
          (item) =>
            item.name === 'evaluation:proposal' &&
            typeof jsonObject(item.content).has_review === 'number',
        )
      : undefined;
  const artifacts = view.artifacts.filter(
    (item) =>
      item !== evaluation &&
      !(
        proposal &&
        item === proposalArtifact &&
        JSON.stringify(proposalOf(item.content)) === JSON.stringify(proposal)
      ),
  );
  const text = jsonObject(view.execution.result).text;
  return (
    <div className={cn(readingWidthStyles, 'space-y-5')}>
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <FileText size={21} />
        </span>
        <div>
          <p className={eyebrowStyles}>Outcome</p>
          <h2 className="mt-0.5 text-section">任务成果</h2>
        </div>
      </div>
      {proposal ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--line)] bg-page/50 px-4 py-3">
            <span className="flex items-center gap-2 font-medium">
              <CheckCheck size={17} className="text-brand" />
              协作已完成
            </span>
            <span
              className={cn(
                'rounded-full px-3 py-1 text-caption',
                proposal.approved ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
              )}
            >
              {proposal.approved ? '已采纳草案' : '未采纳草案'}
            </span>
          </div>
          <section className={resultCardStyles} aria-label="方案草案">
            <div className="flex items-center gap-2 border-b border-[color:var(--line)] px-5 py-3.5">
              <FileText size={15} className="text-brand" />
              <h3 className="text-body font-semibold">方案草案</h3>
            </div>
            <div className="p-5 sm:p-6">
              <AiText text={proposal.draft} />
            </div>
          </section>
          <section className={resultCardStyles} aria-label="审查意见">
            <div className="flex items-center gap-2 border-b border-[color:var(--line)] px-5 py-3.5">
              <ShieldCheck size={15} className="text-brand" />
              <h3 className="text-body font-semibold">审查意见</h3>
            </div>
            <div className="p-5 sm:p-6">
              <AiText text={proposal.review} />
            </div>
          </section>
          {proposal.comment && (
            <section
              className="rounded-xl border-l-2 border-brand bg-brand-soft/40 px-5 py-4"
              aria-label="你的意见"
            >
              <h3 className="mb-2 flex items-center gap-2 text-body font-semibold">
                <MessageSquare size={14} />
                你的意见
              </h3>
              <p className="whitespace-pre-wrap break-words">{proposal.comment}</p>
            </section>
          )}
        </>
      ) : typeof text === 'string' ? (
        <AiText text={text} />
      ) : view.execution.result !== null ? (
        <pre className={codeStyles}>{JSON.stringify(view.execution.result, null, 2)}</pre>
      ) : (
        !view.artifacts.length && (
          <p className="rounded-xl border border-dashed border-[color:var(--line)] p-6 text-muted-ink">
            成果尚未生成。你可以在协作过程中查看当前进展。
          </p>
        )
      )}
      {evaluation && (
        <div className="flex items-start gap-3 rounded-xl border border-[color:var(--line)] p-4">
          <Check size={17} className="mt-0.5 shrink-0 text-brand" />
          <div>
            <p className="font-medium">
              {jsonObject(evaluation.content).has_review === 1
                ? '已包含审查意见'
                : '审查意见完整性未通过'}
            </p>
            <p className="mt-1 text-caption text-muted-ink">
              演示检查仅确认是否包含审查内容，不代表事实准确性或方案质量。
            </p>
          </div>
        </div>
      )}
      {artifacts.map((artifact) => (
        <details key={artifact.id} className={disclosureStyles}>
          <summary>
            <FileJson size={15} />
            {artifact.name === 'proposal' ? '保存的草案记录' : artifact.name}
            <ChevronDown size={14} className={disclosureChevronStyles} />
          </summary>
          <div className="p-4">
            {typeof artifact.content === 'string' ? (
              <AiText text={artifact.content} />
            ) : (
              <pre className={codeStyles}>{JSON.stringify(artifact.content, null, 2)}</pre>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
