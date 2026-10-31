import {
  agentExperienceStyles,
  conversationDemoStyles,
  conversationDemoHeaderStyles,
  demoControlsStyles,
  demoLabelStyles,
  demoReplayStyles,
  conversationDemoThreadStyles,
  demoStepStyles,
  demoStepUserStyles,
  demoStepToolStyles,
  demoStepConfirmationStyles,
  demoToolStyles,
  demoToolHeadingStyles,
  demoToolStatusStyles,
  demoToolInputStyles,
  demoConfirmationStyles,
  demoDecisionStyles,
  demoConfirmationActionsStyles,
  demoAvatarStyles,
  demoBubbleStyles,
  demoTypingStyles,
  conversationDemoFooterStyles,
  demoFollowStyles,
} from './styles.js';
import {
  iconBtnStyles,
  btnStyles,
  btnPrimaryStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import {
  Bot,
  ArrowDown,
  Check,
  CirclePause,
  Play,
  RotateCcw,
  ShieldCheck,
  UserRound,
  Wrench,
  X,
} from '../../shared/icons/lucide.js';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { CopyButton } from '../../shared/components/CopyButton.js';
import { Segmented } from '../../shared/components/Segmented.js';
import { conversationExamples } from './conversation-examples.js';
import {
  conversationPlayback,
  isTranscriptAtEnd,
  type ConversationDecision,
} from './conversation-playback.js';

export function AgentConversationDemo() {
  const reduceMotion = useReducedMotion();
  const [scenario, setScenario] = useState('task');
  const [visible, setVisible] = useState(2);
  const [playing, setPlaying] = useState(true);
  const [decision, setDecision] = useState<ConversationDecision>(null);
  const [following, setFollowing] = useState(true);
  const followLatest = useRef(true);
  const thread = useRef<HTMLDivElement>(null);
  const example = conversationExamples.find((item) => item.id === scenario)!;
  const { waiting, complete, advancing } = conversationPlayback(
    example.steps,
    visible,
    decision,
    playing,
  );
  useEffect(() => {
    if (!advancing) return;
    const timer = setTimeout(() => setVisible((value) => value + 1), 1100);
    return () => clearTimeout(timer);
  }, [advancing, visible, scenario]);
  useEffect(() => {
    const element = thread.current;
    if (element && followLatest.current)
      element.scrollTo({ top: element.scrollHeight, behavior: 'instant' });
  }, [visible, decision, scenario]);
  function showLatest() {
    followLatest.current = true;
    setFollowing(true);
    const element = thread.current;
    element?.scrollTo({ top: element.scrollHeight, behavior: 'instant' });
  }
  function replay(next = scenario) {
    setScenario(next);
    setVisible(2);
    setPlaying(true);
    setDecision(null);
    followLatest.current = true;
    setFollowing(true);
    thread.current?.scrollTo({ top: 0, behavior: 'instant' });
  }
  return (
    <section className={agentExperienceStyles} aria-label="Agent 对话使用演示">
      <div className={conversationDemoStyles}>
        <header className={conversationDemoHeaderStyles}>
          <Segmented
            id="conversation-example"
            label="演示场景"
            value={scenario}
            onChange={replay}
            options={conversationExamples.map(({ id, label }) => ({ id, label }))}
          />
          <div className={demoControlsStyles}>
            <span className={demoLabelStyles}>演示</span>
            {!complete && !waiting && (
              <button
                type="button"
                className={iconBtnStyles}
                aria-label={playing ? '暂停演示' : '继续演示'}
                onClick={() => setPlaying((value) => !value)}
              >
                {playing ? <CirclePause size={16} /> : <Play size={16} />}
              </button>
            )}
            <button
              type="button"
              className={demoReplayStyles}
              aria-label="重播演示"
              title="重播演示"
              onClick={() => replay()}
            >
              <RotateCcw size={14} />
              <span>重播</span>
            </button>
          </div>
        </header>
        <div
          className={conversationDemoThreadStyles}
          ref={thread}
          role="log"
          aria-label="示例对话记录"
          aria-live={playing ? 'polite' : 'off'}
          tabIndex={0}
          onScroll={(event) => {
            const atEnd = isTranscriptAtEnd(event.currentTarget);
            followLatest.current = atEnd;
            setFollowing(atEnd);
          }}
        >
          {example.steps.slice(0, visible).map((step, index) => (
            <motion.div
              key={scenario + index}
              className={cn(
                demoStepStyles,
                {
                  user: demoStepUserStyles,
                  agent: '',
                  tool: demoStepToolStyles,
                  confirmation: demoStepConfirmationStyles,
                }[step.kind],
              )}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
            >
              {step.kind === 'tool' ? (
                <div className={demoToolStyles}>
                  <div className={demoToolHeadingStyles}>
                    <Wrench size={15} />
                    <code>{step.name}</code>
                    {step.status && <span className={demoToolStatusStyles}>{step.status}</span>}
                  </div>
                  <span className={demoToolInputStyles}>{step.input}</span>
                  {step.result && <p>{step.result}</p>}
                </div>
              ) : step.kind === 'confirmation' ? (
                <div className={demoConfirmationStyles}>
                  <ShieldCheck size={20} />
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.text}</p>
                    {decision ? (
                      <span className={demoDecisionStyles}>
                        {decision === 'allowed' ? '已确认' : '已取消'}
                      </span>
                    ) : (
                      <div className={demoConfirmationActionsStyles}>
                        <button
                          type="button"
                          className={cn(btnStyles, btnPrimaryStyles)}
                          onClick={() => {
                            setDecision('allowed');
                            setPlaying(true);
                          }}
                        >
                          <Check size={14} />
                          {step.action}
                        </button>
                        <button
                          type="button"
                          className={btnStyles}
                          onClick={() => {
                            setDecision('denied');
                            setPlaying(false);
                          }}
                        >
                          <X size={14} />
                          取消
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <span className={demoAvatarStyles} aria-hidden="true">
                    {step.kind === 'user' ? <UserRound size={15} /> : <Bot size={16} />}
                  </span>
                  <p className={demoBubbleStyles}>{step.text}</p>
                </>
              )}
            </motion.div>
          ))}
          {playing && !waiting && !complete && (
            <span className={demoTypingStyles} aria-label="Agent 正在继续演示">
              <i />
              <i />
              <i />
            </span>
          )}
        </div>
        <footer className={conversationDemoFooterStyles}>
          <span>
            {waiting
              ? '等待确认'
              : decision === 'denied'
                ? '已取消'
                : complete
                  ? '已完成'
                  : playing
                    ? '正在处理…'
                    : '已暂停'}
          </span>
          {!following && (
            <button
              type="button"
              className={cn(textBtnStyles, demoFollowStyles)}
              onClick={showLatest}
            >
              <ArrowDown size={14} />
              {waiting ? '查看确认' : '回到最新'}
            </button>
          )}
          <CopyButton text={example.prompt} label="复制任务" />
        </footer>
      </div>
    </section>
  );
}
