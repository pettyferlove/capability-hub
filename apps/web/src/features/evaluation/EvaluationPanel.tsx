import {
  evaluationResponseSchema,
  managementEvaluationsResponseSchema,
  requestEvaluationResponseSchema,
  reviewEvaluationResponseSchema,
  type EvaluationResponse,
} from '@capability-hub/contracts';
import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { Button, Dialog, DialogTrigger, Heading, Popover } from 'react-aria-components';
import { ApiError } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { RadarChart } from '../../shared/components/RadarChart.js';
import { HubCtx } from '../../shared/context/HubContext.js';
import { Info, X } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { useAiCommand } from '../ai/use-ai-command.js';
import { DimensionList, PrivateEvidence } from './EvaluationDetails.js';
import {
  evaluationDimensions,
  failureLabel,
  labels,
  stageLabel,
  versionLabel,
  type Evaluation,
  type EvaluationDetail,
} from './evaluation-view.js';
import {
  evaluationActionStyles,
  evaluationLayoutStyles,
  evaluationLinkStyles,
  evaluationNoteStyles,
  evaluationPanelStyles,
  evaluationPopoverStyles,
} from './styles.js';

interface PanelCommon {
  versionId: string;
  refresh?: number;
  onEvidence?: (path: string, line?: number) => void;
}
type PanelProps = PanelCommon &
  (
    | { kind: 'asset'; published: EvaluationResponse }
    | { kind: 'intake' }
    | { kind: 'review'; requestId: string }
  );
type Baseline = NonNullable<EvaluationResponse['baseline']>;
type Schema<T> = { safeParse(input: unknown): { success: true; data: T } | { success: false } };

function useCheckedQuery<T>(path: string | null, refresh: number, schema: Schema<T>) {
  const query = useQuery<unknown>(path, refresh);
  const parsed = useMemo(
    () => (query.data === undefined ? undefined : schema.safeParse(query.data)),
    [schema, query.data],
  );
  // 权限撤回后直到下一份成功响应才可再次使用证据，刷新期间也不能复用被拒绝的旧响应。
  const [revoked] = useState(() => new WeakSet<object>());
  const denied =
    query.errorStatus !== undefined && [401, 403, 404, 410].includes(query.errorStatus);
  const source = query.data && typeof query.data === 'object' ? query.data : undefined;
  useEffect(() => {
    if (denied && source) revoked.add(source);
  }, [denied, revoked, source]);
  const data =
    parsed?.success && !denied && !(source && revoked.has(source)) ? parsed.data : undefined;
  const status = query.errorStatus;
  const retryable =
    status === 0 || status === 408 || status === 429 || (status !== undefined && status >= 500);
  return {
    data,
    loading: query.loading,
    denied,
    readyToPoll: !query.loading && (!query.error || retryable) && parsed?.success !== false,
    errorProps: query.errorProps,
    error: query.error || (parsed && !parsed.success ? '评测响应格式无效' : ''),
  };
}

function usePolling(
  active: boolean,
  nextWindow: string | null,
  refresh: Dispatch<SetStateAction<number>>,
) {
  useEffect(() => {
    if (!active) return;
    const readyAt = nextWindow ? Date.parse(nextWindow) : 0;
    let timer: number;
    function schedule() {
      window.clearTimeout(timer);
      if (document.visibilityState === 'hidden') return;
      const delay = Math.max(5000, Math.min(86400000, readyAt - Date.now() + 1000));
      timer = window.setTimeout(() => refresh((value) => value + 1), delay);
    }
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [active, nextWindow, refresh]);
}

/** 只请求所见发布的固定版本，权限提示随该次 GET 返回。 */
export function usePublishedEvaluation(
  assetId: string | null,
  versionId: string | null,
  refresh: number,
) {
  const [tick, setTick] = useState(0);
  const path =
    assetId && versionId
      ? '/api/assets/' +
        encodeURIComponent(assetId) +
        '/versions/' +
        encodeURIComponent(versionId) +
        '/evaluation'
      : null;
  const query = useCheckedQuery(path, refresh + tick, evaluationResponseSchema);
  const mismatch = query.data?.evaluation && query.data.evaluation.version_id !== versionId;
  const data = mismatch ? undefined : query.data;
  // 暂时性读取失败（含首次读取）只重读状态，不重新发起评测。
  usePolling(
    (!!query.error || (!!data?.updating && (!!data.evaluation || data.can_view_details))) &&
      query.readyToPoll,
    data?.next_window_at ?? null,
    setTick,
  );
  return {
    ...query,
    data,
    error: query.error || (mismatch ? '评测结果与当前版本不符' : ''),
    retry: () => setTick((value) => value + 1),
  };
}

function chartAxes(data: Evaluation) {
  return evaluationDimensions(data).map((dimension) => ({
    label: dimension.label,
    score: dimension.score,
    confidence: dimension.confidence,
    statusLabel: dimension.status === 'scored' ? undefined : labels[dimension.status],
  }));
}

/** 入口与面板使用同一套轴序，只有三个以上可用分值才生成图形。 */
export function EvaluationGlyph({ evaluation }: { evaluation: Evaluation | null }) {
  return evaluation && <RadarChart size="glyph" axes={chartAxes(evaluation)} />;
}

function Methods() {
  return (
    <DialogTrigger>
      <Button className={cn(evaluationLinkStyles, 'min-h-9 px-2')}>
        评测方法与局限
        <Info size={15} aria-hidden="true" />
      </Button>
      <Popover
        placement="top end"
        offset={6}
        containerPadding={12}
        className={evaluationPopoverStyles}
        data-overlay-child="true"
      >
        <Dialog aria-label="评测方法与局限" className="outline-none">
          <div className="mb-2 flex items-center justify-between gap-2">
            <Heading slot="title" className="text-body font-semibold">
              评测方法与局限
            </Heading>
            <Button slot="close" aria-label="关闭评测方法与局限" className={evaluationLinkStyles}>
              <X size={16} aria-hidden="true" />
            </Button>
          </div>
          <p className="text-label leading-relaxed">
            任务效果采用纸面推演，不执行脚本。质量评测不是安全认证，不影响审核与分发。
          </p>
          <p className="mt-2 text-label leading-relaxed">
            模型评测存在波动。路由模拟与具体 Agent 客户端的选择可能不同。
          </p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

function Results({
  data,
  detail,
  baseline,
  review,
  onEvidence,
}: {
  data: Evaluation;
  detail?: EvaluationDetail;
  baseline?: Baseline | null;
  review: boolean;
  onEvidence?: PanelCommon['onEvidence'];
}) {
  const [compare, setCompare] = useState(true);
  const dimensions = evaluationDimensions(data);
  const scored = dimensions.flatMap((d) =>
    d.score === null ? [] : [{ label: d.label, score: d.score }],
  );
  const lowest = scored.reduce<(typeof scored)[number] | undefined>(
    (prior, d) => (!prior || d.score < prior.score ? d : prior),
    undefined,
  );
  const coverageLimited = dimensions.filter((d) => d.flags?.includes('coverage_limited')).length;
  const previous =
    baseline && compare ? new Map(baseline.dimensions.map((d) => [d.id, d.score])) : undefined;
  const baselineName = baseline
    ? (review ? '提交时发布 ' : '上一发布 ') + versionLabel(baseline.version_label)
    : '';
  const compareButton = baseline && (
    <Button
      className={evaluationActionStyles}
      aria-pressed={compare}
      onPress={() => setCompare(!compare)}
    >
      对比{baselineName}
    </Button>
  );
  return (
    <div className={scored.length >= 3 ? evaluationLayoutStyles : 'min-w-0'}>
      {scored.length >= 3 && (
        <figure className="min-w-0 rounded-lg bg-page px-2 py-3 text-center">
          <div className="mx-auto max-w-[320px]">
            <RadarChart
              axes={chartAxes(data)}
              baseline={previous && dimensions.map((d) => previous.get(d.id) ?? null)}
            />
          </div>
          <figcaption>
            <p className="text-label text-ink">
              {scored.length} 项已评测，最低为
              <strong className="font-semibold">
                {lowest?.label} {lowest?.score} 分
              </strong>
            </p>
            {coverageLimited > 0 && (
              <p className={evaluationNoteStyles}>{coverageLimited} 个维度材料覆盖受限</p>
            )}
            {baseline && (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                {previous && (
                  <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-caption text-muted-ink">
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden="true" className="w-4 border-t-2 border-brand" />
                      {review ? '候选版本 ' : '本版本 '}
                      {versionLabel(data.version_label)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        aria-hidden="true"
                        className="w-4 border-t-2 border-dashed border-muted-ink"
                      />
                      {baselineName}
                    </span>
                  </div>
                )}
                {compareButton}
              </div>
            )}
          </figcaption>
        </figure>
      )}
      <DimensionList data={data} detail={detail} previous={previous} onEvidence={onEvidence} />
      {scored.length < 3 && compareButton}
    </div>
  );
}

function RunState({ run, nextWindow }: { run?: EvaluationDetail; nextWindow?: string | null }) {
  const pending = run?.state === 'queued' || run?.state === 'running';
  const failedStages = run?.stages.filter((stage) => stage.state === 'failed') ?? [];
  if (
    !pending &&
    !nextWindow &&
    !failedStages.length &&
    run?.state !== 'failed' &&
    run?.state !== 'cancelled'
  )
    return null;
  const stages = run?.stages ?? [];
  const completed = stages.filter((stage) => stage.state !== 'pending').length;
  return (
    <div className="space-y-2 text-label">
      {pending && (
        <div className="rounded-lg bg-brand-veil px-3 py-2.5">
          <p role="status" className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-brand">
              {run.state === 'queued' ? '已排队' : '评测中'}
            </span>
            {stages.length > 0 && (
              <span className="text-caption tabular-nums text-muted-ink">
                {completed}/{stages.length} 个阶段
              </span>
            )}
          </p>
          {stages.length > 0 && (
            <div
              role="progressbar"
              aria-label="评测阶段进度"
              aria-valuemin={0}
              aria-valuenow={completed}
              aria-valuemax={stages.length}
              aria-valuetext={stages.length + ' 个阶段中已结束 ' + completed + ' 个'}
              className="mt-2 flex h-1 gap-1"
            >
              {stages.map((stage) => (
                <span
                  key={stage.id}
                  aria-hidden="true"
                  className={cn(
                    'min-w-0 flex-1 rounded-full',
                    stage.state === 'pending' ? 'bg-line' : 'bg-brand',
                  )}
                />
              ))}
            </div>
          )}
        </div>
      )}
      {nextWindow && (
        <p>
          下一额度窗口{' '}
          <time dateTime={nextWindow}>
            {nextWindow.slice(0, 10)} {nextWindow.slice(11, 16)} UTC
          </time>
        </p>
      )}
      {run?.state === 'failed' && (
        <p>评测失败{!failedStages.length && ' · ' + failureLabel(run.failure_code)}</p>
      )}
      {run?.state === 'cancelled' && (
        <p>评测已取消{run.failure_code && ' · ' + failureLabel(run.failure_code)}</p>
      )}
      {failedStages.length > 0 && (
        <ul aria-label="失败阶段" className="space-y-1">
          {failedStages.map((stage) => (
            <li key={stage.id}>
              {stageLabel(stage.id)} · {failureLabel(stage.failure_code ?? run?.failure_code)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function inProgress(row: EvaluationDetail | undefined) {
  return row?.state === 'queued' || row?.state === 'running';
}

function intakeSelection(items: EvaluationDetail[], rubric: string | undefined) {
  const finished = items.filter((row) => row.state === 'succeeded' || row.state === 'partial');
  const current = finished.filter((row) => row.rubric_version === rubric);
  const eligible = current.length ? current : finished;
  const result = eligible.find((row) => row.scope === 'full') ?? eligible[0];
  const latest = items[0];
  const interrupted = latest?.state === 'failed' || latest?.state === 'cancelled';
  const run = items.find(inProgress) ?? (interrupted ? latest : (result ?? latest));
  return { run, data: result ?? run };
}

function PanelBody(props: PanelProps) {
  const { versionId, refresh = 0, onEvidence } = props;
  const hub = useContext(HubCtx);
  const published = props.kind === 'asset' ? props.published : undefined;
  const managementPath =
    '/api/management/versions/' + encodeURIComponent(versionId) + '/evaluations';
  const canReadHistory = props.kind === 'intake' || !!published?.can_view_details;
  const [generation, setGeneration] = useState(0);
  const revision = refresh + generation;
  const history = useCheckedQuery(
    canReadHistory ? managementPath : null,
    revision,
    managementEvaluationsResponseSchema,
  );
  const review = useCheckedQuery(
    props.kind === 'review'
      ? '/api/publication-requests/' + encodeURIComponent(props.requestId) + '/evaluation'
      : null,
    revision,
    reviewEvaluationResponseSchema,
  );
  const {
    data: privateData,
    error,
    loading,
    denied,
    readyToPoll,
  } = props.kind === 'review' ? review : history;
  const items = history.data?.items.filter((item) => item.version_id === versionId) ?? [];
  const currentRubric = privateData?.current_rubric_version ?? published?.current_rubric_version;
  const publicResult = published?.evaluation;
  const acceptedPublic =
    publicResult?.version_id === versionId &&
    (publicResult.state === 'partial' || publicResult.state === 'succeeded')
      ? publicResult
      : undefined;
  const candidate =
    review.data?.candidate?.version_id === versionId ? review.data.candidate : undefined;
  const intake = props.kind === 'intake' ? intakeSelection(items, currentRubric) : undefined;
  const publishedRun = published?.can_view_details
    ? items.find((row) => row.id === (published.latest_attempt_id ?? acceptedPublic?.id))
    : undefined;
  const run = publishedRun ?? candidate ?? intake?.run;
  const active = inProgress(run);
  const nextWindow =
    (props.kind === 'asset'
      ? !denied && published?.can_view_details && published.next_window_at
      : privateData?.next_window_at) || null;
  usePolling(
    (!!error || active || (!!published?.updating && canReadHistory)) && readyToPoll,
    nextWindow,
    setGeneration,
  );
  const wasActive = useRef(false);
  useEffect(() => {
    // 首次评测开始时公开摘要仍为空；完成后让入口也取得同一版本的新摘要。
    if (props.kind === 'asset' && wasActive.current && !active && run && !error) hub?.reload();
    wasActive.current = active;
  }, [props.kind, active, run, error, hub]);
  // 发布页只接纳已发布摘要或服务端按发布声明选出的尝试；接收页保留已完成的完整结果。
  const data = acceptedPublic ?? publishedRun ?? candidate ?? intake?.data;
  const detail =
    data && (props.kind === 'review' ? candidate : items.find((item) => item.id === data.id));
  const old = !!data && !!currentRubric && data.rubric_version !== currentRubric;
  const current = review.data?.current;
  const canCompare =
    !!candidate &&
    !!current &&
    !old &&
    current.rubric_version === currentRubric &&
    candidate.comparable_key === current.comparable_key;
  const baseline =
    props.kind === 'review'
      ? canCompare
        ? current
        : null
      : !old && published?.comparison_status === 'available' && acceptedPublic?.id === data?.id
        ? published.baseline
        : null;
  const incomparable =
    props.kind === 'review'
      ? !!candidate && !!current && !canCompare
      : published?.comparison_status === 'incomparable' || (!!published?.baseline && old);
  const comparisonReason =
    old || (candidate && current && candidate.rubric_version !== current.rubric_version)
      ? '评测标准不同，不可比较'
      : candidate && current
        ? '评测器不同，不可比较'
        : '评测标准或评测器不同，不可比较';
  const canRequest =
    !active &&
    !published?.updating &&
    !denied &&
    (props.kind === 'asset'
      ? !!published?.can_request && (!canReadHistory || !!privateData?.can_request)
      : !!privateData?.can_request);
  const [request, setRequest] = useState<{
    busy: boolean;
    receipt?: { id: string; reused: boolean };
    error?: string;
  }>({ busy: false });
  const submitting = useRef(false);
  const command = useAiCommand();
  async function requestEvaluation() {
    if (!canRequest || submitting.current) return;
    submitting.current = true;
    setRequest({ busy: true });
    try {
      const receipt = requestEvaluationResponseSchema.safeParse(
        await command(
          managementPath,
          props.kind === 'review' ? { publication_request_id: props.requestId } : {},
        ),
      );
      if (!receipt.success || receipt.data.evaluation.version_id !== versionId)
        throw new Error('评测回执与当前版本不符');
      setRequest({
        busy: false,
        receipt: { id: receipt.data.evaluation.id, reused: receipt.data.reused },
      });
      setGeneration((value) => value + 1);
      if (props.kind === 'asset') hub?.reload();
    } catch (cause) {
      setRequest({
        busy: false,
        error: cause instanceof Error ? cause.message : '发起评测失败',
      });
      if (cause instanceof ApiError && [401, 403, 409, 429].includes(cause.status)) {
        setGeneration((value) => value + 1);
        if (props.kind === 'asset') hub?.reload();
      }
    } finally {
      submitting.current = false;
    }
  }

  if (
    props.kind === 'asset' &&
    !acceptedPublic &&
    !published?.can_request &&
    !(published?.can_view_details && (published.updating || published.latest_attempt_id))
  )
    return null;
  const updating =
    (published?.updating && (!!acceptedPublic || (!active && !denied))) ||
    (active && data?.id !== run?.id);
  const action = old ? '按新标准评测' : run?.state === 'partial' ? '重试失败阶段' : '评测此版本';
  const regressions = canCompare ? review.data?.regressions : undefined;
  const receipt = request.receipt;
  const notice = receipt?.reused
    ? '已复用此版本的评测'
    : receipt &&
        run?.id !== receipt.id &&
        data?.id !== receipt.id &&
        !items.some((item) => item.id === receipt.id)
      ? '评测请求已受理'
      : null;
  return (
    <section
      className={evaluationPanelStyles}
      aria-label={props.kind === 'intake' ? '预评测' : '质量评测'}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-section font-semibold">
              {props.kind === 'intake'
                ? '预评测'
                : props.kind === 'review'
                  ? '候选版本评测'
                  : '质量评测'}
            </h3>
            {data && (
              <span className="text-label text-muted-ink [overflow-wrap:anywhere]">
                {versionLabel(data.version_label)}
              </span>
            )}
          </div>
          {data && (
            <p className={evaluationNoteStyles}>
              评测标准 {data.rubric_version}
              {data.scan_ruleset && <> · 扫描规则 {data.scan_ruleset}</>}
              {data.evaluated_at && (
                <>
                  {' '}
                  · <time dateTime={data.evaluated_at}>{data.evaluated_at.slice(0, 10)}</time>
                </>
              )}
            </p>
          )}
        </div>
        {canRequest && (
          <Button
            className={evaluationActionStyles}
            isDisabled={request.busy || (!!receipt && loading)}
            onPress={() => void requestEvaluation()}
          >
            {action}
          </Button>
        )}
      </header>
      {notice && (
        <p role="status" className={evaluationNoteStyles}>
          {notice}
        </p>
      )}
      {request.error && (
        <p role="alert" className="text-label text-ink">
          {request.error}
        </p>
      )}
      {(updating || old || data?.state === 'partial' || privateData?.model_enabled === false) && (
        <div className="space-y-1 text-label">
          {updating && <p role="status">正在更新</p>}
          {old && <p>旧评测标准</p>}
          {data?.state === 'partial' && <p>部分完成</p>}
          {privateData?.model_enabled === false && <p>模型评测未启用</p>}
        </div>
      )}
      {(run || nextWindow) && <RunState run={run} nextWindow={nextWindow} />}
      {!data && !error && !updating && (
        <p className={evaluationNoteStyles}>{loading ? '正在读取评测' : '尚未评测'}</p>
      )}
      {error && (
        <p role="alert" className="text-label text-ink">
          {error}
        </p>
      )}
      {data && (
        <Results
          key={data.id}
          data={data}
          detail={detail ?? undefined}
          baseline={baseline}
          review={props.kind === 'review'}
          onEvidence={onEvidence}
        />
      )}
      {incomparable && <p className={cn(evaluationNoteStyles, 'px-2')}>{comparisonReason}</p>}
      {!!regressions?.length && (
        <section className="space-y-1 border-t border-line pt-3">
          <h4 className="text-label font-semibold">回归项</h4>
          <ul className="space-y-1 text-label">
            {regressions.map((item) => (
              <li key={item.id}>
                {item.label} · {item.previous} → {item.score}，下降 {item.drop} 分
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="divide-y divide-line border-t border-line *:py-1">
        {detail && (
          <PrivateEvidence key={'evidence/' + detail.id} detail={detail} onEvidence={onEvidence} />
        )}
        <footer className="flex">
          <Methods />
        </footer>
      </div>
    </section>
  );
}

/** 固定版本、视图或审核申请变化时，同步丢弃展开状态、请求回执及私有说明。 */
export function EvaluationPanel(props: PanelProps) {
  return (
    <PanelBody
      key={[props.kind, props.versionId, props.kind === 'review' ? props.requestId : ''].join('/')}
      {...props}
    />
  );
}
