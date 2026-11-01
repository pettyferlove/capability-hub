import { BusinessAssessment } from './BusinessAssessment.js';
import { QuickReview } from './quick-review.js';
import { createPortal } from 'react-dom';
import { useContext, useRef, useState } from 'react';
import type { AiInteractionResponse } from '@capability-hub/contracts';
import { useAiCommand } from './use-ai-command.js';
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  ShieldCheck,
  X,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { btnStyles, btnPrimaryStyles } from '../../shared/styles/recipes.js';
import { AiText } from './AiText.js';
import { SchemaFields, initialValues } from './SchemaFields.js';
import { jsonObject } from './presentation.js';
import {
  codeStyles,
  disclosureChevronStyles,
  disclosureStyles,
  interactionCardStyles,
} from './styles.js';

export function InteractionForm({
  executionId,
  interaction,
  onDone,
}: {
  executionId: string;
  interaction: AiInteractionResponse;
  onDone: () => void;
}) {
  const [value, setValue] = useState(() => initialValues(interaction.response_schema));
  const [decision, setDecision] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const command = useAiCommand();
  const quick = useContext(QuickReview);
  const sending = useRef(false);
  const request = jsonObject(interaction.request);
  const fields = jsonObject(jsonObject(interaction.response_schema).properties);
  const business = !!request.assessment;
  const approval = jsonObject(fields.approved).type === 'boolean';
  const submit = async (response = value, origin?: DOMRect) => {
    if (sending.current || submitted) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await command(
        `/api/ai/executions/${executionId}/interactions/${interaction.id}/respond`,
        { response },
        interaction.revision,
      );
      setSubmitted(true);
      if (response.approved === true && origin)
        quick?.onAdopt?.({
          executionId,
          x: origin.left + origin.width / 2,
          y: origin.top + origin.height / 2,
        });
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '提交失败');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      className={interactionCardStyles}
      onSubmit={(event) => {
        event.preventDefault();
        const button = event.nativeEvent.submitter;
        void submit(value, button?.getBoundingClientRect());
      }}
      aria-label="人工确认"
    >
      {quick?.slot &&
        business &&
        approval &&
        decision !== false &&
        !value.apply_feedback &&
        createPortal(
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              disabled={busy || submitted}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand px-3.5 text-caption font-semibold text-on-brand hover:bg-brand-hover disabled:opacity-70"
              onClick={(event) => {
                void submit(
                  { ...value, approved: true },
                  event.currentTarget.getBoundingClientRect(),
                );
              }}
            >
              <Check size={14} />
              {submitted ? '已采纳，正在继续' : busy ? '正在采纳…' : '快速采纳'}
            </button>
            {error && (
              <span
                role="alert"
                className="max-w-48 break-words rounded bg-danger-soft px-2 py-1 text-caption text-danger"
              >
                {error}
              </span>
            )}
          </div>,
          quick.slot,
        )}
      <div className="border-b border-warning/20 bg-warning-soft/35 px-5 py-4">
        <div className="space-y-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-caption font-medium text-warning">
              <ShieldCheck size={15} />
              决定权在你手中
            </p>
            <h2 className="text-section">
              {typeof request.question === 'string' ? request.question : '需要你的确认'}
            </h2>
            <p className="mt-2 text-muted-ink">
              根据前面的协作内容作出决定，提交后任务会从这里继续。
            </p>
          </div>
          {typeof interaction.request === 'string' && <AiText text={interaction.request} />}
          {business && <BusinessAssessment value={request.assessment} />}
          {Object.entries(request)
            .filter(([key]) => key !== 'question' && key !== 'assessment')
            .map(([key, item]) => (
              <details key={key} className={disclosureStyles}>
                <summary>
                  <FileText size={15} />
                  {key === 'draft' ? '待确认草案' : key === 'review' ? '审查建议' : key}
                  <ChevronDown size={14} className={disclosureChevronStyles} />
                </summary>
                <div className="p-5">
                  {typeof item === 'string' ? (
                    <AiText text={item} />
                  ) : (
                    <pre className={codeStyles}>{JSON.stringify(item, null, 2)}</pre>
                  )}
                </div>
              </details>
            ))}
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="space-y-3">
          {approval && (
            <fieldset disabled={busy || submitted}>
              <legend className="mb-2 font-medium">你的决定</legend>
              <div className="flex flex-wrap gap-3">
                {[
                  { approved: true, label: business ? '采纳研判' : '采纳草案', Icon: Check },
                  { approved: false, label: '暂不采纳', Icon: X },
                ].map((option) => (
                  <label
                    key={String(option.approved)}
                    className={cn(
                      'flex flex-row items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors',
                      decision === option.approved
                        ? 'border-brand bg-brand-soft text-brand'
                        : 'border-[color:var(--line)] bg-paper text-muted-ink',
                    )}
                  >
                    <input
                      type="radio"
                      required
                      name={`decision-${interaction.id}`}
                      value={String(option.approved)}
                      checked={decision === option.approved}
                      className="accent-brand"
                      onChange={() => {
                        setDecision(option.approved);
                        setValue({
                          ...value,
                          approved: option.approved,
                          ...(business && !option.approved ? { apply_feedback: false } : {}),
                        });
                      }}
                    />
                    <option.Icon size={14} />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <SchemaFields
            schema={interaction.response_schema}
            names={
              approval
                ? Object.keys(fields).filter(
                    (key) =>
                      key !== 'approved' &&
                      (key !== 'apply_feedback' ||
                        (decision === true &&
                          jsonObject(request.assessment).can_apply_feedback === true)),
                  )
                : undefined
            }
            value={value}
            onChange={setValue}
            disabled={busy || submitted}
          />
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-caption text-muted-ink">你的决定将记录在任务成果中。</span>
            <button
              type="submit"
              className={cn(btnStyles, btnPrimaryStyles)}
              disabled={busy || submitted || (approval && decision === undefined)}
            >
              {submitted ? '已提交，正在继续…' : busy ? '正在提交…' : '确认并继续'}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
