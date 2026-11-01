/**
 * 执行活动的只读渲染层：把 {@link activityItems} 归并出的消息块、工具调用与人工交互
 * 按时间线铺开，负责自动跟随滚动、离底提示与「聚焦待确认交互」的滚动定位。
 *
 * 数据来自 `@capability-hub/contracts` 的 `AiExecutionViewResponse` / `AiInteractionResponse`，
 * 不做任何请求：交互确认经子组件提交后由父级 `onRefresh` 重新拉取视图。
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { AiExecutionViewResponse, AiInteractionResponse } from '@capability-hub/contracts';
import {
  ArrowDown,
  Bot,
  Check,
  ChevronDown,
  CirclePause,
  LoaderCircle,
  UserRound,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { btnStyles } from '../../shared/styles/recipes.js';
import { AiText } from './AiText.js';
import { AgentMessageCard, AgentRoster } from './AgentActivity.js';
import { InteractionForm } from './InteractionForm.js';
import { ToolActivityCard } from './ToolActivityCard.js';
import { activityItems } from './activity.js';
import { jsonObject, taskPrompt } from './presentation.js';
import {
  activityTrackStyles,
  disclosureChevronStyles,
  disclosureStyles,
  fillStyles,
  readingWidthStyles,
  scrollStyles,
} from './styles.js';

function InteractionDecision({ interaction }: { interaction: AiInteractionResponse }) {
  const response = jsonObject(interaction.response);
  const request = jsonObject(interaction.request);
  const answered = interaction.status === 'answered' || interaction.status === 'applied';
  return (
    <section
      aria-label="人工决策记录"
      className="relative rounded-2xl border border-brand/20 bg-brand-soft/35 px-5 py-4"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-semibold">
          <UserRound size={16} className="text-brand" />
          人工决策
        </span>
        <span className="flex items-center gap-1 text-caption text-muted-ink">
          {answered ? (
            <>
              <Check size={12} />
              已记录
            </>
          ) : (
            <>
              <CirclePause size={12} />
              {interaction.status === 'pending' ? '等待发起人确认' : '交互已结束'}
            </>
          )}
        </span>
      </div>
      {typeof request.question === 'string' && (
        <p className="mb-2 text-caption text-muted-ink">{request.question}</p>
      )}
      {answered &&
        (typeof response.approved === 'boolean' ? (
          <p className="font-medium">
            {response.approved ? (request.assessment ? '采纳研判' : '采纳草案') : '暂不采纳'}
          </p>
        ) : (
          <AiText
            text={
              typeof interaction.response === 'string'
                ? interaction.response
                : JSON.stringify(interaction.response, null, 2)
            }
          />
        ))}
      {typeof response.comment === 'string' && response.comment && (
        <p className="mt-2 whitespace-pre-wrap break-words">{response.comment}</p>
      )}
    </section>
  );
}

/**
 * 时间线主体：`active` 为 false 时（标签页隐藏）不自动滚动、不抢焦点，避免切回时跳动；
 * 待确认交互仅在 `canManage` 为真时渲染表单，否则只展示决策记录。
 */
export function ActivityFeed({
  view,
  canManage,
  active,
  onRefresh,
  focusRequest,
}: {
  view: AiExecutionViewResponse;
  /** 是否为当前执行发起人且持有 `can_ai`；否则交互项降级为只读记录。 */
  canManage: boolean;
  /** 面板是否可见；隐藏时暂停自动跟随与交互聚焦。 */
  active: boolean;
  onRefresh: () => void;
  /** 单调递增的计数，变化即滚动到待确认交互并聚焦；重复值不会重复触发。 */
  focusRequest: number;
}) {
  const { execution } = view;
  const reportReady = view.artifacts.some((artifact) => artifact.name === 'assessment');
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const confirmation = useRef<HTMLDivElement>(null);
  const focusedRequest = useRef(0);
  const initialWatermark = useRef(view.watermark);
  const follow = useRef(['queued', 'running'].includes(execution.status));
  const [away, setAway] = useState(false);
  const reducedMotion = useReducedMotion();
  const prompt = taskPrompt(execution);
  const items = activityItems(view);
  const textLength = execution.message_blocks.reduce(
    (length, block) => length + block.text.length,
    0,
  );
  const fallback = jsonObject(execution.result).text;
  useLayoutEffect(() => {
    const node = viewport.current;
    if (active && follow.current && node) node.scrollTop = node.scrollHeight;
  }, [textLength, items.length, active]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!active || !node || !content.current) return;
    const observer = new ResizeObserver(() => {
      if (follow.current) node.scrollTop = node.scrollHeight;
      setAway(node.scrollHeight - node.scrollTop - node.clientHeight > 48);
    });
    observer.observe(node);
    observer.observe(content.current);
    return () => observer.disconnect();
  }, [active]);
  useLayoutEffect(() => {
    const node = viewport.current;
    const target = confirmation.current;
    if (focusRequest === focusedRequest.current || !active || !node || !target) return;
    focusedRequest.current = focusRequest;
    follow.current = false;
    target.focus({ preventScroll: true });
    node.scrollTo({
      top:
        node.scrollTop + target.getBoundingClientRect().top - node.getBoundingClientRect().top - 16,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [focusRequest, active, reducedMotion]);
  return (
    <div className={cn(fillStyles, 'relative')}>
      <div
        ref={viewport}
        className={scrollStyles}
        role="region"
        aria-label="任务活动"
        tabIndex={0}
        onScroll={(event) => {
          const node = event.currentTarget;
          follow.current = node.scrollHeight - node.scrollTop - node.clientHeight <= 48;
          setAway(!follow.current);
        }}
      >
        <div ref={content} className={readingWidthStyles}>
          {prompt && (
            <section
              aria-label="任务目标"
              className="mb-6 rounded-xl border border-[color:var(--line)] bg-page/60 px-4 py-3.5"
            >
              <p className="mb-2 flex items-center gap-2 text-caption font-medium text-muted-ink">
                <UserRound size={14} />
                任务目标
              </p>
              {prompt.length > 260 ? (
                <details
                  className={cn(
                    disclosureStyles,
                    'border-0 bg-transparent [&>summary]:px-0 [&>summary]:py-0',
                  )}
                >
                  <summary>
                    <span className="line-clamp-2 flex-1">{prompt.slice(0, 140)}…</span>
                    <ChevronDown size={14} className={disclosureChevronStyles} />
                  </summary>
                  <p className="mt-3 whitespace-pre-wrap break-words">{prompt}</p>
                </details>
              ) : (
                <p className="whitespace-pre-wrap break-words leading-relaxed">{prompt}</p>
              )}
            </section>
          )}
          <AgentRoster view={view} />
          {view.activity_truncated && (
            <p className="mb-4 text-caption text-muted-ink">
              展示最近 1000 条活动节点，较早的工具与交互过程已省略。
            </p>
          )}
          <div className={activityTrackStyles}>
            {items.map((item) => {
              const pending =
                item.kind === 'interaction' &&
                item.interaction.status === 'pending' &&
                execution.status === 'waiting_input';
              return (
                <motion.div
                  key={`${item.kind}:${item.id}`}
                  ref={pending ? confirmation : undefined}
                  tabIndex={pending ? -1 : undefined}
                  initial={
                    active && !reducedMotion && item.seq > initialWatermark.current
                      ? { opacity: 0, y: 6 }
                      : false
                  }
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.18 }}
                >
                  {item.kind === 'message' ? (
                    <AgentMessageCard
                      block={item.block}
                      reportReady={reportReady}
                      running={execution.status === 'running'}
                      active={active}
                    />
                  ) : item.kind === 'tool' ? (
                    <ToolActivityCard tool={item} />
                  ) : pending && canManage ? (
                    <InteractionForm
                      executionId={execution.id}
                      interaction={item.interaction}
                      onDone={onRefresh}
                    />
                  ) : (
                    <InteractionDecision interaction={item.interaction} />
                  )}
                </motion.div>
              );
            })}
          </div>
          {!execution.message_blocks.length && typeof fallback === 'string' && (
            <div className="mt-5">
              <AiText text={fallback} />
            </div>
          )}
          {!items.length && typeof fallback !== 'string' && (
            <div
              className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-[color:var(--line)] p-5 text-muted-ink"
              role="status"
            >
              {['queued', 'running'].includes(execution.status) ? (
                <>
                  <LoaderCircle
                    size={18}
                    className="shrink-0 text-brand motion-safe:animate-spin"
                  />
                  <span>
                    {execution.status === 'queued'
                      ? '任务已排队，准备开始…'
                      : 'Agent 已开始工作，正在准备内容…'}
                  </span>
                </>
              ) : (
                <>
                  <Bot size={20} />
                  <span>这次任务没有可展示的协作活动。</span>
                </>
              )}
            </div>
          )}
          {execution.status === 'running' &&
            items.length > 0 &&
            execution.message_blocks.every((block) => block.complete) && (
              <p role="status" className="mt-5 flex items-center gap-2 text-muted-ink">
                <LoaderCircle size={13} className="motion-safe:animate-spin" />
                正在推进后续步骤…
              </p>
            )}
        </div>
      </div>
      {away && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <button
            type="button"
            className={cn(
              btnStyles,
              'pointer-events-auto rounded-full bg-paper [box-shadow:var(--shadow)]',
            )}
            onClick={() => {
              follow.current = true;
              if (viewport.current) {
                viewport.current.focus({ preventScroll: true });
                viewport.current.scrollTop = viewport.current.scrollHeight;
              }
              setAway(false);
            }}
          >
            <ArrowDown size={14} />
            回到最新
          </button>
        </div>
      )}
    </div>
  );
}
