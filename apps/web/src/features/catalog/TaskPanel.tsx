import type { DiscoveryCriteria } from '@capability-hub/contracts';
import type {
  DiscoveryDirectionResponse,
  DiscoveryResultResponse,
} from '@capability-hub/contracts/http';
import { motion, useIsPresent, useReducedMotion } from 'motion/react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { assetHref } from '../../shared/navigation/history-route.js';
import { cn } from '../../shared/styles/cn.js';
import type { DiscoveryProgress, DiscoveryState } from './use-discovery.js';
import {
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUp,
  Blocks,
  Check,
  MessageSquare,
  Plug,
  Sparkles,
} from '../../shared/icons/lucide.js';
import { categoryLabel } from '../../shared/format/labels.js';
import { SkeletonBlock } from '../../shared/components/Skeleton.js';
import { EvaluationCardSummary } from '../evaluation/EvaluationCardSummary.js';
import {
  answerStyles,
  cardIndicatorsStyles,
  directionExampleStyles,
  directionIndexStyles,
  directionIntentStyles,
  directionLabelStyles,
  directionStyles,
  directionTitleStyles,
  followUpBlockStyles,
  followUpFieldStyles,
  followUpSendStyles,
  followUpStyles,
  followUpQuickStyles,
  queryEditStyles,
  queryStripStyles,
  queryStripTextStyles,
  resultBodyStyles,
  resultCardStyles,
  resultDescStyles,
  resultEvidenceLabelStyles,
  resultEvidenceStyles,
  resultJudgmentLabelStyles,
  resultJudgmentStyles,
  resultGlyphStyles,
  resultInstallStyles,
  resultKindMcpStyles,
  resultKindStyles,
  resultMetaStyles,
  resultNameRowStyles,
  resultNameStyles,
  resultsCountStyles,
  resultsHeadStyles,
  resultsNoteStyles,
  resultsSortStyles,
  resultSideStyles,
  resultSkeletonBlockStyles,
  resultSkeletonLinesStyles,
  resultSkeletonStyles,
  resultVisibilityStyles,
  taskBodyStaleStyles,
  taskBodyStyles,
  taskChipStyles,
  taskPanelBodyStyles,
  taskPanelStyles,
  taskColumnStyles,
  thinkingStepListStyles,
  thinkingStepMarkStyles,
  thinkingStepStyles,
  thinkingStepsStyles,
  taskStateStyles,
  thinkingDotStyles,
  thinkingFeedbackStyles,
  thinkingStyles,
  thinkingTextStyles,
} from './styles.js';
import { TaskConditions } from './TaskConditions.js';
import { DiscoverySkillActions } from './DiscoverySkillActions.js';

const panelEase = [0.22, 1, 0.36, 1] as const;

function Evidence({ item }: { item: DiscoveryResultResponse }) {
  const proofs = item.match_reasons.filter((reason) => reason.requirement);
  if (!proofs.length) return null;
  return (
    <div className={resultEvidenceStyles}>
      {proofs.map((proof) => (
        <p key={proof.requirement + proof.text}>
          <span className={resultEvidenceLabelStyles}>{proof.requirement}</span>
          {'：发布信息写明「'}
          {proof.text}
          {'」'}
        </p>
      ))}
    </div>
  );
}

/** 模型给的理由标为 AI 判断；只有能在该版本发布信息里逐字找到的摘抄才写成「发布信息写明」。 */
function Judgment({ item }: { item: DiscoveryResultResponse }) {
  const { judgment } = item;
  if (!judgment) return null;
  return (
    <div className={resultJudgmentStyles}>
      <p>
        <span className={resultJudgmentLabelStyles}>
          <Sparkles size={10} aria-hidden="true" />
          AI 判断
        </span>
        {judgment.reason}
      </p>
      {judgment.quote && (
        <p className={resultEvidenceStyles}>
          {'发布信息写明「'}
          {judgment.quote}
          {'」'}
        </p>
      )}
    </div>
  );
}

/** 一条固定版本结果；「查看接入方式」直接打开该版本的安装页。 */
function ResultCard({ item, index }: { item: DiscoveryResultResponse; index?: number }) {
  return (
    <article className={resultCardStyles} aria-label={item.slug}>
      <span className={resultGlyphStyles} aria-hidden="true">
        {item.kind === 'mcp' ? <Plug size={16} /> : <Blocks size={16} />}
      </span>
      <div className={resultBodyStyles}>
        <div className={cardIndicatorsStyles}>
          <div className={resultNameRowStyles}>
            {index !== undefined && <span className={directionIndexStyles}>{index + 1}</span>}
            <h3 className={resultNameStyles}>{item.slug}</h3>
            <span className={item.kind === 'mcp' ? resultKindMcpStyles : resultKindStyles}>
              {item.kind === 'skill' ? 'SKILL' : 'MCP'}
            </span>
            {item.judgment && (
              <span
                className={
                  item.judgment.fit === 'direct' ? resultKindStyles : resultVisibilityStyles
                }
              >
                {item.judgment.fit === 'direct' ? '直接相关' : '部分相关'}
              </span>
            )}
            {!!item.unverified.length && (
              <span className={resultVisibilityStyles}>仍需核对：{item.unverified.join('、')}</span>
            )}
          </div>
          {item.kind === 'skill' && <EvaluationCardSummary evaluation={item.evaluation} />}
        </div>
        <p className={resultMetaStyles}>
          {categoryLabel(item.category)} · v{item.version_label} · {item.owner_name}
        </p>
        <p className={resultDescStyles}>{item.description}</p>
        <Judgment item={item} />
        <Evidence item={item} />
      </div>
      <div className={resultSideStyles}>
        <span className={resultVisibilityStyles}>{item.visibility_label}</span>
        <a
          className={resultInstallStyles}
          href={assetHref(item.slug, { versionId: item.version_id, tab: 'installation' })}
        >
          查看接入方式
          <ArrowRight size={11} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

function Directions({
  directions,
  onPick,
}: {
  directions: DiscoveryDirectionResponse[];
  onPick: (direction: DiscoveryDirectionResponse) => void;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {directions.map((direction, index) => (
        <li key={index}>
          <button type="button" className={directionStyles} onClick={() => onPick(direction)}>
            <span className={directionIndexStyles} aria-hidden="true">
              {index + 1}
            </span>
            <span className={directionLabelStyles}>
              <span className={directionTitleStyles}>{direction.label}</span>
              <span className={directionIntentStyles}>{direction.intent}</span>
              <span className={directionExampleStyles}>依据：{direction.example.slug}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * 流式提问的真实进度：读取可见资源、模型判断、核对引用与原文，每一步只在服务端推送对应事件后前进。
 * 读屏只播报一次总体状态，不逐步打断。
 */
function ThinkingSteps({ progress }: { progress: DiscoveryProgress }) {
  const read = progress.stage !== 'start';
  const steps = [
    {
      key: 'read',
      label: read
        ? `已读取 ${progress.resources} 个可见资源${progress.complete === false ? '（相关候选）' : ''}`
        : '读取你能看到的资源',
      state: read ? 'done' : 'active',
    },
    {
      key: 'judge',
      label: progress.stage === 'writing' ? '正在整理回答' : '判断哪些资源适用',
      state: !read ? 'pending' : progress.stage === 'verify' ? 'done' : 'active',
    },
    {
      key: 'verify',
      label: '核对引用与发布原文',
      state: progress.stage === 'verify' ? 'active' : 'pending',
    },
  ];
  return (
    <div className={thinkingStepsStyles}>
      <p className="sr-only" role="status">
        正在理解问题并在目录中查找…
      </p>
      <ol className={thinkingStepListStyles}>
        {steps.map((step) => (
          <li
            key={step.key}
            data-state={step.state}
            aria-current={step.state === 'active' ? 'step' : undefined}
            className={thinkingStepStyles}
          >
            <span className={thinkingStepMarkStyles} aria-hidden="true">
              {step.state === 'done' && <Check size={10} />}
            </span>
            <span className={step.state === 'active' ? thinkingTextStyles : undefined}>
              {step.label}
            </span>
            {step.key === 'judge' && progress.stage === 'writing' && (
              <span aria-hidden="true" className="text-muted-ink tabular-nums">
                {progress.characters} 字
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * 提交后在输入框下方展开的结果面板：回应、结果或方向、逐项依据与继续追问；右栏在拿到本轮条件后
 * 出现，点击即可直接按目录刷新，不请求模型。面板高度随内容过渡，由上层控制出现与收起。
 */
export default function TaskPanel({
  state,
  scenarios,
  onPick,
  onFilter,
  onFollow,
  onFollowChange,
  onRetry,
  onEditQuestion,
  onBrowse,
}: {
  state: DiscoveryState;
  scenarios: { id: string; name: string }[];
  onPick: (direction: DiscoveryDirectionResponse) => void;
  onFilter: (patch: Partial<DiscoveryCriteria>) => void;
  onFollow: () => void;
  onFollowChange: (value: string) => void;
  onRetry: () => void;
  onEditQuestion: (question: string) => void;
  onBrowse: () => void;
}) {
  const { task, status, error, notice, follow, criteria, draft } = state;
  const busy = status === 'thinking';
  const answered = status === 'idle' && task?.action === 'message' && !error && !notice;
  const present = useIsPresent();
  const followId = useId();
  const { canContinue } = state;
  const reduceMotion = useReducedMotion();
  const body = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const node = body.current;
    if (!node) return;
    const measure = () => setHeight(node.offsetHeight);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, []);
  const recent = criteria.sort === 'recent';
  // 提问进行中显示刚发出的问题；之后沿用这一轮实际处理的问题，筛选与选方向不改写它。
  const question = (busy && state.asking) || task?.question || draft;
  const followInput = useRef<HTMLInputElement>(null);
  const shown = task ? [...task.items, ...task.partial] : [];
  // 快捷追问只给与本轮结果互补的问法：结果都是 Skill 时才问有没有 MCP，反之亦然。
  const quick =
    !task || busy
      ? []
      : [
          ...(task.kind === 'guide' && task.directions.length ? ['我也说不清'] : []),
          ...(task.kind !== 'reference' && shown.length >= 1 ? ['第一个适合我吗？'] : []),
          ...(task.kind !== 'reference' && shown.length >= 2 ? ['第二个适合我吗？'] : []),
          ...(shown.length &&
          shown.every((item) => item.kind === 'skill') &&
          criteria.kind !== 'skill'
            ? ['有没有 MCP 可以用？']
            : []),
          ...(shown.length && shown.every((item) => item.kind === 'mcp') && criteria.kind !== 'mcp'
            ? ['有没有 Skill 可以用？']
            : []),
        ].slice(0, 3);
  return (
    <motion.section
      className={taskPanelStyles}
      aria-label="本轮任务结果"
      initial={reduceMotion ? false : { opacity: 0, y: 16, height: 0 }}
      animate={{ opacity: 1, y: 0, height: height ?? 'auto' }}
      exit={{ opacity: 0, y: reduceMotion ? 0 : -8, height: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.46, ease: panelEase }}
    >
      <div ref={body} className={taskPanelBodyStyles}>
        <div className={taskColumnStyles}>
          <div className={queryStripStyles}>
            <motion.p
              key={question}
              className={queryStripTextStyles}
              initial={busy && task && state.asking && !reduceMotion ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: panelEase }}
            >
              {question || '正在理解你的问题…'}
            </motion.p>
            <button
              type="button"
              className={queryEditStyles}
              onClick={() => onEditQuestion(question)}
              disabled={!task || busy}
            >
              换个问法
            </button>
          </div>
          {busy && (
            <div className={thinkingFeedbackStyles}>
              {state.progress ? (
                <ThinkingSteps progress={state.progress} />
              ) : (
                <p className={thinkingStyles} role="status">
                  <span className={thinkingDotStyles} aria-hidden="true" />
                  <span className={thinkingTextStyles}>正在按条件查找…</span>
                </p>
              )}
              {!task && (
                <div className="flex flex-col gap-2.5" aria-hidden="true">
                  {['38%', '30%'].map((width) => (
                    <span key={width} className={resultSkeletonStyles}>
                      <SkeletonBlock
                        shape="rect"
                        width={34}
                        height={34}
                        className={resultSkeletonBlockStyles}
                      />
                      <span className={resultSkeletonLinesStyles}>
                        <SkeletonBlock
                          width={width}
                          height={12}
                          className={resultSkeletonBlockStyles}
                        />
                        <SkeletonBlock
                          width="22%"
                          height={9}
                          className={resultSkeletonBlockStyles}
                        />
                        <SkeletonBlock
                          width="76%"
                          height={10}
                          className={resultSkeletonBlockStyles}
                        />
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div
            className={cn(taskBodyStyles, busy && taskBodyStaleStyles)}
            data-answered={answered || undefined}
            inert={busy}
          >
            {!!notice && !busy && (
              <p className={taskStateStyles} role="status">
                {notice}
              </p>
            )}
            {!!error && !busy && (
              <div role="alert" className={taskStateStyles}>
                {error.message}{' '}
                <button
                  type="button"
                  className={queryEditStyles}
                  onClick={onRetry}
                  disabled={!state.entry}
                >
                  重试
                </button>
              </div>
            )}
            {task && !error && (
              <>
                {task.reply && (
                  <p className={answerStyles} aria-live="polite">
                    {task.reply}
                  </p>
                )}
                {task.kind === 'guide' && !!task.items.length && (
                  <ResultCard item={task.items[0]} />
                )}
                {canContinue && task.kind === 'guide' && !!task.directions.length && (
                  <Directions directions={task.directions} onPick={onPick} />
                )}
                {(task.kind === 'matches' ? !task.reply || shown.length > 0 : !!task.reference) && (
                  <div className={resultsHeadStyles}>
                    <span className={resultsCountStyles}>
                      {task.kind === 'matches'
                        ? `在资源目录找到 ${task.total} 个结果`
                        : '上一轮所指的资源'}
                    </span>
                    {task.kind === 'matches' && shown.length > 1 && (
                      <div className="flex flex-wrap items-center gap-2">
                        {canContinue && (
                          <button
                            type="button"
                            className={resultsSortStyles}
                            onClick={() => onFilter({ sort: recent ? 'relevance' : 'recent' })}
                          >
                            <ArrowDownWideNarrow size={12} aria-hidden="true" />
                            排序：{recent ? '最近发布' : '相关性'}
                          </button>
                        )}
                        {present && status === 'idle' && state.entry && !state.modeChanged && (
                          <DiscoverySkillActions key={state.entry.viewer_key} task={task} />
                        )}
                      </div>
                    )}
                  </div>
                )}
                {task.kind === 'matches' &&
                  task.items.map((item, index) => (
                    <ResultCard key={item.version_id} item={item} index={index} />
                  ))}
                {!!task.partial.length && (
                  <>
                    <p className={resultsNoteStyles}>以下只证实了部分要求，仍需核对：</p>
                    {task.partial.map((item, index) => (
                      <ResultCard
                        key={item.version_id}
                        item={item}
                        index={task.items.length + index}
                      />
                    ))}
                  </>
                )}
                {task.kind === 'reference' && task.reference && (
                  <ResultCard item={task.reference} />
                )}
                <p className={resultsNoteStyles}>
                  只检索你有权限查看的资源；想逐条筛选时可直接使用下方的资源目录。
                </p>
              </>
            )}
          </div>
          {canContinue && (
            <div className={followUpBlockStyles}>
              <div className={followUpQuickStyles}>
                <label htmlFor={followId} className="text-[length:13px] font-semibold text-ink">
                  继续追问
                </label>
                {quick.map((text) => (
                  <button
                    key={text}
                    type="button"
                    className={taskChipStyles}
                    onClick={() => {
                      onFollowChange(text);
                      followInput.current?.focus();
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <form
                className={followUpStyles}
                onSubmit={(event) => {
                  event.preventDefault();
                  onFollow();
                }}
              >
                <MessageSquare size={15} className="shrink-0 text-muted-ink" aria-hidden="true" />
                <input
                  id={followId}
                  ref={followInput}
                  value={busy && state.asking ? '' : follow}
                  readOnly={busy}
                  onChange={(event) => onFollowChange(event.target.value)}
                  placeholder={busy ? '等待本轮结果…' : '补充条件，或问问某个资源'}
                  maxLength={500}
                  className={followUpFieldStyles}
                />
                <button
                  type="submit"
                  className={followUpSendStyles}
                  disabled={!follow.trim() || busy}
                >
                  追问
                  <ArrowUp size={13} aria-hidden="true" />
                </button>
              </form>
            </div>
          )}
        </div>
        {canContinue && (
          <TaskConditions
            busy={busy}
            criteria={criteria}
            scenarios={scenarios}
            onFilter={onFilter}
            onBrowse={onBrowse}
          />
        )}
      </div>
    </motion.section>
  );
}
