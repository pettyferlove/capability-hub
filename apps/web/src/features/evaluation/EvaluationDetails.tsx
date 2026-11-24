import { useId, useState, type ReactNode } from 'react';
import { Button } from 'react-aria-components';
import { radarRevealDelay } from '../../shared/components/RadarChart.js';
import { ChevronRight } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import {
  dimensionBrief,
  evaluationDimensions,
  failureLabel,
  labels,
  suggestions,
  type Evaluation,
  type EvaluationDetail,
} from './evaluation-view.js';
import {
  evaluationChevronStyles,
  evaluationDetailsStyles,
  evaluationDisclosureStyles,
  evaluationLinkStyles,
  evaluationNoteStyles,
  evaluationRevealStyles,
  evaluationRowStyles,
  evaluationScoreStyles,
} from './styles.js';

type Evidence = EvaluationDetail['dimensions'][number]['checks'][number]['evidence'][number];
type Jump = (path: string, line?: number) => void;
type Highlight = (id: string | null) => void;

function EvidenceLinks({ evidence, onEvidence }: { evidence: Evidence[]; onEvidence?: Jump }) {
  if (!evidence.length) return null;
  return (
    <div className="flex min-w-0 flex-wrap gap-x-3">
      {evidence.map((item) => {
        const location =
          item.path +
          ' 第 ' +
          item.start_line +
          (item.end_line === item.start_line ? '' : '–' + item.end_line) +
          ' 行';
        return onEvidence ? (
          <Button
            key={location}
            className={evaluationLinkStyles}
            onPress={() => onEvidence(item.path, item.start_line)}
          >
            {location}
          </Button>
        ) : (
          <span key={location} className={evaluationNoteStyles}>
            {location}
          </span>
        );
      })}
    </div>
  );
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className={evaluationDetailsStyles}>
      <Button
        className={evaluationDisclosureStyles}
        aria-expanded={open}
        aria-controls={id}
        onPress={() => setOpen(!open)}
      >
        {title}
        <ChevronRight
          size={15}
          className={cn(evaluationChevronStyles, open && 'rotate-90')}
          aria-hidden="true"
        />
      </Button>
      <div id={id} hidden={!open} className={cn('px-2 pt-1 pb-2', evaluationRevealStyles)}>
        {open && children}
      </div>
    </section>
  );
}

function DimensionRow({
  data,
  detail,
  previous,
  order,
  onEvidence,
  onHighlight,
}: {
  data: Evaluation['dimensions'][number];
  detail?: EvaluationDetail['dimensions'][number];
  previous?: number | null;
  order: number;
  onEvidence?: Jump;
  onHighlight?: Highlight;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const coverageLimited = data.flags?.includes('coverage_limited');
  const summary = [
    dimensionBrief(data),
    ...(data.flags ?? []).filter((flag) => flag !== 'coverage_limited').map((flag) => labels[flag]),
  ]
    .filter(Boolean)
    .join(' · ');
  const metrics = data.metrics;
  const showRates =
    data.id === 'effectiveness' &&
    metrics?.pass_with !== undefined &&
    metrics.pass_without !== undefined;
  const expandable = !!(
    data.checks.length ||
    detail?.summary ||
    detail?.failure_code ||
    coverageLimited ||
    showRates
  );
  const heading = (
    <>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-body font-semibold text-ink">{data.label}</span>
          {data.confidence && (
            <span className="inline-flex items-center gap-1 text-caption text-muted-ink">
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 shrink-0 rounded-full border border-current',
                  data.confidence !== 'low' && 'bg-current',
                )}
              />
              {labels[data.confidence]}
            </span>
          )}
        </span>
        {summary && <span className={cn('mt-0.5 block', evaluationNoteStyles)}>{summary}</span>}
        {typeof previous === 'number' && (
          <span className={cn('block tabular-nums', evaluationNoteStyles)}>
            对比版本 {previous} 分
          </span>
        )}
      </span>
      <span
        key={data.score === null ? 'status' : 'score'}
        className={evaluationScoreStyles}
        style={{ animationDelay: radarRevealDelay(order) }}
      >
        {data.score !== null ? (
          <span className="block text-section font-semibold leading-tight tabular-nums">
            {data.score}
          </span>
        ) : (
          <span className={evaluationNoteStyles}>
            {data.status === 'scored' ? '暂无分数' : labels[data.status]}
          </span>
        )}
        {data.band && (
          <span
            className={cn(
              'block text-caption leading-tight text-muted-ink',
              data.band === 'weak' && 'text-warning',
            )}
          >
            {labels[data.band]}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li
      className="min-w-0 border-b border-line last:border-0"
      onPointerEnter={(event) => event.pointerType === 'mouse' && onHighlight?.(data.id)}
      onPointerLeave={() => onHighlight?.(null)}
      onFocus={() => onHighlight?.(data.id)}
      onBlur={() => onHighlight?.(null)}
    >
      {expandable ? (
        <Button
          className={evaluationRowStyles}
          aria-expanded={open}
          aria-controls={id}
          onPress={() => setOpen(!open)}
        >
          {heading}
          <ChevronRight
            size={14}
            className={cn(evaluationChevronStyles, 'text-muted-ink', open && 'rotate-90')}
            aria-hidden="true"
          />
        </Button>
      ) : (
        <div className={evaluationRowStyles}>{heading}</div>
      )}
      {expandable && (
        <div id={id} hidden={!open}>
          {open && (
            <div
              className={cn(
                'mx-2 mb-2.5 mt-1 space-y-2 border-s-2 border-line py-1 ps-3 text-label [overflow-wrap:anywhere]',
                evaluationRevealStyles,
              )}
            >
              {detail?.summary && <p>{detail.summary}</p>}
              {detail?.failure_code && (
                <p className={evaluationNoteStyles}>{failureLabel(detail.failure_code)}</p>
              )}
              {coverageLimited && <p className={evaluationNoteStyles}>{labels.coverage_limited}</p>}
              {showRates && (
                <dl className="flex flex-wrap gap-x-5 gap-y-2">
                  <div>
                    <dt className={evaluationNoteStyles}>带 Skill 通过率</dt>
                    <dd className="font-semibold tabular-nums">
                      {Math.round(metrics.pass_with * 100)}%
                    </dd>
                  </div>
                  <div>
                    <dt className={evaluationNoteStyles}>无 Skill 通过率</dt>
                    <dd className="font-semibold tabular-nums">
                      {Math.round(metrics.pass_without * 100)}%
                    </dd>
                  </div>
                  {metrics.normalized_gain !== undefined && (
                    <div>
                      <dt className={evaluationNoteStyles}>归一化增益</dt>
                      <dd className="font-semibold tabular-nums">
                        {Number(metrics.normalized_gain.toFixed(2))}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              {data.checks.length > 0 && (
                <ul className="divide-y divide-line" aria-label={data.label + '检查项'}>
                  {data.checks.map((check) => {
                    const full = detail?.checks.find((item) => item.id === check.id);
                    return (
                      <li key={check.id} className="space-y-0.5 py-1.5 first:pt-0 last:pb-0">
                        <p className="flex items-baseline justify-between gap-2">
                          <span>{check.label}</span>
                          <span className="shrink-0 text-caption text-muted-ink">
                            {labels[check.verdict]}
                          </span>
                        </p>
                        {full?.note && <p className={evaluationNoteStyles}>{full.note}</p>}
                        {full && <EvidenceLinks evidence={full.evidence} onEvidence={onEvidence} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** 有结果的维度逐项展示，尚无读数或证据的维度共用一行状态。 */
export function DimensionList({
  data,
  detail,
  previous,
  onEvidence,
  onHighlight,
}: {
  data: Evaluation;
  detail?: EvaluationDetail;
  previous?: ReadonlyMap<string, number | null>;
  onEvidence?: Jump;
  onHighlight?: Highlight;
}) {
  const rows = evaluationDimensions(data).map((dimension, order) => ({
    data: dimension,
    detail: detail?.dimensions.find((item) => item.id === dimension.id),
    previous: previous?.get(dimension.id),
    order,
  }));
  const pending = rows.filter(
    (row) =>
      row.data.status === 'pending' &&
      row.data.score === null &&
      !row.data.checks.length &&
      !Object.keys(row.data.metrics ?? {}).length &&
      !row.data.flags?.length &&
      !row.detail?.summary &&
      !row.detail?.failure_code &&
      row.previous == null,
  );
  const pendingLabel =
    data.state === 'queued' || data.state === 'running' ? '待评测' : labels.pending;
  return (
    <ul className="min-w-0" aria-label="评测维度">
      {rows
        .filter((row) => !pending.includes(row))
        .map((row) => (
          <DimensionRow
            key={row.data.id}
            {...row}
            onEvidence={onEvidence}
            onHighlight={onHighlight}
          />
        ))}
      {pending.length > 0 && (
        <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-2 py-2.5 text-caption text-muted-ink">
          <span className="font-medium">{pendingLabel}</span>
          <ul aria-label={pendingLabel + '维度'} className="flex flex-wrap gap-x-3 gap-y-1">
            {pending.map(({ data: dimension }) => (
              <li key={dimension.id}>{dimension.label}</li>
            ))}
          </ul>
        </li>
      )}
    </ul>
  );
}

/** 用例、模型自由文本和文件引用仅从已授权的维护或审核响应中获取。 */
export function PrivateEvidence({
  detail,
  onEvidence,
}: {
  detail: EvaluationDetail;
  onEvidence?: Jump;
}) {
  const ranked = suggestions(detail);
  const cases = detail.cases;
  return (
    <>
      {ranked.length > 0 && (
        <Fold title="改进建议">
          <ol className="list-decimal space-y-3 pl-5">
            {ranked.map(({ check, dimension }) => (
              <li key={check.id}>
                <span className={evaluationNoteStyles}>
                  {dimension} · {check.label}
                </span>
                <p>{check.suggestion}</p>
                <EvidenceLinks evidence={check.evidence} onEvidence={onEvidence} />
              </li>
            ))}
          </ol>
        </Fold>
      )}
      {cases && (cases.trigger.length > 0 || cases.tasks.length > 0) && (
        <Fold title="评测用例">
          <div className="space-y-4">
            {cases.trigger.length > 0 && (
              <div>
                <h4 className="mb-2 text-label font-semibold">触发用例</h4>
                <ol className="list-decimal space-y-2 pl-5">
                  {cases.trigger.map((item) => {
                    const confusion = detail.confusions?.find((c) => c.case_id === item.id);
                    return (
                      <li key={item.id}>
                        <span className={evaluationNoteStyles}>
                          {item.kind === 'should_trigger' ? '应触发' : '近似不应触发'} ·{' '}
                          {item.language === 'zh' ? '中文' : '英文'}
                        </span>
                        <p>{item.query}</p>
                        {confusion && (
                          <p className={evaluationNoteStyles}>选中了{confusion.name}</p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
            {cases.tasks.length > 0 && (
              <div>
                <h4 className="mb-2 text-label font-semibold">纸面任务</h4>
                <ol className="list-decimal space-y-3 pl-5">
                  {cases.tasks.map((task, index) => {
                    const result = detail.stages.find(
                      (stage) => stage.id === 'task-run-' + (index + 1),
                    )?.assertion_results;
                    return (
                      <li key={task.id}>
                        <span className={evaluationNoteStyles}>
                          {task.origin === 'author' ? '作者用例' : '生成用例'}
                        </span>
                        <p>{task.prompt}</p>
                        {task.expected && (
                          <p className={evaluationNoteStyles}>预期交付 · {task.expected}</p>
                        )}
                        {task.files?.map((path) =>
                          onEvidence ? (
                            <Button
                              key={path}
                              className={evaluationLinkStyles}
                              onPress={() => onEvidence(path)}
                            >
                              {path}
                            </Button>
                          ) : (
                            <p key={path}>{path}</p>
                          ),
                        )}
                        <ul className="mt-1 list-disc space-y-1 pl-4">
                          {task.assertions.map((assertion, i) => (
                            <li key={i}>
                              {assertion}
                              {result?.[i] && (
                                <p className={evaluationNoteStyles}>
                                  {(['with_skill', 'without_skill'] as const).map((mode) => {
                                    const evidence = result[i][mode];
                                    return (
                                      <span key={mode} className="block">
                                        {mode === 'with_skill' ? '带 Skill' : '无 Skill'} ·{' '}
                                        {evidence.valid
                                          ? evidence.passed
                                            ? '通过'
                                            : '未通过'
                                          : '引文无效'}
                                        {evidence.valid &&
                                          evidence.quote &&
                                          ' · “' + evidence.quote + '”'}
                                      </span>
                                    );
                                  })}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
        </Fold>
      )}
    </>
  );
}
