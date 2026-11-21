import type { DiscoveryCriteria } from '@capability-hub/contracts';
import type {
  DiscoveryDirectionResponse,
  DiscoveryEntryResponse,
  DiscoveryResultResponse,
} from '@capability-hub/contracts/http';
import { motion, useIsPresent, useReducedMotion } from 'motion/react';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { assetHref } from '../../shared/navigation/history-route.js';
import { contentTransition } from '../../shared/motion/transitions.js';
import { cn } from '../../shared/styles/cn.js';
import type { DiscoveryProgress, DiscoveryState } from './use-discovery.js';
import {
  ArrowDownWideNarrow,
  ArrowRight,
  ArrowUp,
  Blocks,
  Check,
  LayoutGrid,
  MessageSquare,
  Pause,
  Plug,
  ShieldCheck,
  Sparkles,
} from '../../shared/icons/lucide.js';
import { categoryLabel } from '../../shared/format/labels.js';
import { SkeletonBlock } from '../../shared/components/Skeleton.js';
import {
  answerStyles,
  browseEntryCountStyles,
  browseEntryStyles,
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
  resultSkeletonLinesStyles,
  resultSkeletonStyles,
  resultVisibilityStyles,
  stopButtonStyles,
  taskBodyStaleStyles,
  taskBodyStyles,
  taskChipStyles,
  taskComposerStyles,
  taskFieldStyles,
  taskInputFieldStyles,
  taskInputIconStyles,
  taskInputStyles,
  taskInputTypingStyles,
  taskKbdStyles,
  taskPanelBodyStyles,
  taskPanelStyles,
  taskColumnStyles,
  taskMetaRowStyles,
  taskPrivacyNoteStyles,
  thinkingStepListStyles,
  thinkingStepMarkStyles,
  thinkingStepStyles,
  thinkingStepsStyles,
  taskStateStyles,
  taskSubmitIconStyles,
  taskSuggestLabelStyles,
  taskSuggestRowStyles,
  taskSubmitStyles,
  taskTopicHashStyles,
  taskTypingCursorStyles,
  taskTypingStyles,
  thinkingDotStyles,
  thinkingStyles,
  thinkingTextStyles,
} from './styles.js';
import { TaskConditions } from './TaskConditions.js';
import { DiscoverySkillActions } from './DiscoverySkillActions.js';
import { BlurText } from '../../shared/components/react-bits/BlurText.js';
import { TextType } from '../../shared/components/react-bits/TextType.js';

const placeholder = '你想完成什么？不确定从哪开始，也可以直接问';
// 对话进行中顶部输入框开始新的一轮，追问在回应下方。
const restartPlaceholder = '换个问题重新查找；接着这轮问，请用下方的追问';
const panelEase = [0.22, 1, 0.36, 1] as const;
// 回应逐词显现，长回应也在约 0.7 秒内铺开。
const replyReveal = { stagger: 0.02, spread: 0.7, distance: 5 } as const;

/**
 * 首页输入区：显式提交，示例与主题只填入不发送。没有开场示例时用目录里的常见主题兜底；
 * 对话模式始终说明问题的去向。有进行中的对话时提交即开始新的一轮，不沿用上一轮条件。
 */
export function TaskComposer({
  entry,
  draft,
  busy,
  total,
  topics,
  onDraft,
  onSubmit,
  onStop,
  onSuggestion,
  onTopic,
  onBrowse,
  inputRef,
  restart,
}: {
  entry: DiscoveryEntryResponse | undefined;
  draft: string;
  busy: boolean;
  total: number | undefined;
  topics: string[];
  onDraft: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onSuggestion: (suggestion: { text: string; suggestion_ref: string }) => void;
  onTopic: (keyword: string) => void;
  /** 目录对当前访问者为空时不传，入口随之隐藏。 */
  onBrowse?: () => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  /** 已有进行中的对话。 */
  restart: boolean;
}) {
  const dialogue = entry?.mode === 'dialogue';
  const suggestions = entry?.suggestions ?? [];
  const [focused, setFocused] = useState(false);
  const filled = !!draft.trim();
  const typing = !draft && !focused && !restart;
  const chips = suggestions.length
    ? suggestions.map((suggestion) => ({
        key: suggestion.suggestion_ref,
        label: suggestion.label,
        topic: false,
        pick: () => onSuggestion(suggestion),
      }))
    : topics.map((topic) => ({
        key: topic,
        label: topic,
        topic: true,
        pick: () => onTopic(topic),
      }));
  const send = () => {
    if (entry && !busy && filled) onSubmit();
  };
  return (
    <>
      <div className={taskComposerStyles} data-busy={busy || undefined}>
        <form
          className={taskInputStyles}
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) {
              if (!entry || !filled) inputRef.current?.focus();
              onStop();
            } else send();
          }}
        >
          <Sparkles size={17} className={taskInputIconStyles} aria-hidden="true" />
          <span className={taskFieldStyles}>
            <textarea
              ref={inputRef}
              rows={1}
              aria-label="你想完成什么？"
              aria-keyshortcuts="Control+Enter Meta+Enter"
              value={draft}
              onChange={(event) => onDraft(event.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  send();
                }
              }}
              maxLength={500}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={restart ? restartPlaceholder : placeholder}
              className={cn(taskInputFieldStyles, typing && taskInputTypingStyles)}
            />
            {typing && (
              <span className={taskTypingStyles} aria-hidden="true">
                <TextType
                  texts={[placeholder, ...suggestions.map((suggestion) => suggestion.text)]}
                  cursorClassName={taskTypingCursorStyles}
                />
              </span>
            )}
          </span>
          {!busy && (
            <kbd className={taskKbdStyles} aria-hidden="true">
              Ctrl/⌘ + Enter
            </kbd>
          )}
          <button
            type="submit"
            className={busy ? stopButtonStyles : taskSubmitStyles}
            disabled={!busy && (!entry || !filled)}
          >
            {busy ? (
              <>
                <Pause size={13} aria-hidden="true" />
                停止
              </>
            ) : (
              <>
                {dialogue ? '查找' : '搜索'}
                <ArrowRight size={14} aria-hidden="true" className={taskSubmitIconStyles} />
              </>
            )}
          </button>
        </form>
      </div>
      {chips.length > 0 && (
        <div className={taskSuggestRowStyles}>
          <span className={taskSuggestLabelStyles}>{suggestions.length ? '示例' : '常见主题'}</span>
          {chips.map((chip, index) => (
            <motion.button
              key={chip.key}
              type="button"
              className={taskChipStyles}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...contentTransition, duration: 0.3, delay: 0.5 + index * 0.05 }}
              onClick={chip.pick}
            >
              {chip.topic && (
                <span className={taskTopicHashStyles} aria-hidden="true">
                  #
                </span>
              )}
              {chip.label}
            </motion.button>
          ))}
        </div>
      )}
      <div className={taskMetaRowStyles}>
        {dialogue && (
          <span className={taskPrivacyNoteStyles}>
            <ShieldCheck size={13} aria-hidden="true" className="shrink-0" />
            问题会交由本站配置的模型处理，勿填凭据
          </span>
        )}
        {!dialogue && entry && (
          <span className={taskPrivacyNoteStyles}>
            当前为关键词匹配，不会询问模型；换个说法或使用资源目录。
          </span>
        )}
        {onBrowse && (
          <button type="button" className={browseEntryStyles} onClick={onBrowse}>
            <LayoutGrid size={13} aria-hidden="true" />
            浏览资源目录
            {total !== undefined && <span className={browseEntryCountStyles}>{total}</span>}
          </button>
        )}
      </div>
    </>
  );
}

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
    <motion.article
      className={resultCardStyles}
      aria-label={item.slug}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...contentTransition, duration: 0.32, delay: Math.min(index ?? 0, 6) * 0.05 }}
    >
      <span className={resultGlyphStyles} aria-hidden="true">
        {item.kind === 'mcp' ? <Plug size={16} /> : <Blocks size={16} />}
      </span>
      <div className={resultBodyStyles}>
        <div className={resultNameRowStyles}>
          {index !== undefined && <span className={directionIndexStyles}>{index + 1}</span>}
          <h3 className={resultNameStyles}>{item.slug}</h3>
          <span className={item.kind === 'mcp' ? resultKindMcpStyles : resultKindStyles}>
            {item.kind === 'skill' ? 'SKILL' : 'MCP'}
          </span>
          {item.judgment && (
            <span
              className={item.judgment.fit === 'direct' ? resultKindStyles : resultVisibilityStyles}
            >
              {item.judgment.fit === 'direct' ? '直接相关' : '部分相关'}
            </span>
          )}
          {!!item.unverified.length && (
            <span className={resultVisibilityStyles}>仍需核对：{item.unverified.join('、')}</span>
          )}
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
    </motion.article>
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
        <motion.li
          key={index}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...contentTransition, duration: 0.32, delay: Math.min(index, 6) * 0.06 }}
        >
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
        </motion.li>
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
          <li key={step.key} data-state={step.state} className={thinkingStepStyles}>
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
export function TaskPanel({
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
            <p className={queryStripTextStyles}>{question || '正在理解你的问题…'}</p>
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
            <>
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
                      <SkeletonBlock shape="rect" width={34} height={34} />
                      <span className={resultSkeletonLinesStyles}>
                        <SkeletonBlock width={width} height={12} />
                        <SkeletonBlock width="22%" height={9} />
                        <SkeletonBlock width="76%" height={10} />
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          <div className={cn(taskBodyStyles, busy && taskBodyStaleStyles)} inert={busy}>
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
                    <BlurText key={task.reply} text={task.reply} {...replyReveal} />
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
                  value={follow}
                  readOnly={busy}
                  onChange={(event) => onFollowChange(event.target.value)}
                  placeholder="补充条件，或问问某个资源"
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
