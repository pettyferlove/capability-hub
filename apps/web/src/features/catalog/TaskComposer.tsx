import type { DiscoveryEntryResponse } from '@capability-hub/contracts/http';
import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, LayoutGrid, Pause, ShieldCheck, Sparkles } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { TextType } from '../../shared/components/react-bits/TextType.js';
import {
  browseEntryCountStyles,
  browseEntryStyles,
  stopButtonStyles,
  taskActionsStyles,
  taskChipStyles,
  taskComposerStyles,
  taskCountStyles,
  taskFieldMeasureStyles,
  taskFieldStyles,
  taskInputFieldStyles,
  taskInputIconStyles,
  taskInputStyles,
  taskInputTypingStyles,
  taskKbdStyles,
  taskMetaRowStyles,
  taskPrivacyNoteStyles,
  taskSubmitIconStyles,
  taskSubmitStyles,
  taskSuggestLabelStyles,
  taskSuggestRowStyles,
  taskTopicHashStyles,
  taskTypingCursorStyles,
  taskTypingStyles,
} from './styles.js';

const placeholder = '你想完成什么？不确定从哪开始，也可以直接问';
// 对话进行中顶部输入框开始新的一轮，追问在回应下方。
const restartPlaceholder = '换个问题重新查找；接着这轮问，请用下方的追问';
// 长提示在单行布局里放不下时换用的短句：空输入框不折行，开始输入时高度也不跳。
const shortPlaceholder = '你想完成什么？';
const shortRestartPlaceholder = '换个问题重新查找';
const draftLimit = 500;
// 剩余一百字起显示字数。
const draftCountAt = draftLimit - 100;
// 打字提示只在宽屏显示，与样式断点一致。
const wideQuery = '(min-width: 601px)';

function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(wideQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/**
 * 首页输入区：示例与主题只填入不发送；空输入可发送完整展示的轮播提问，预览不全则先填入草稿。
 * 没有开场示例时用目录里的常见主题兜底；对话模式始终说明问题的去向。有进行中的对话时提交即开始新的一轮，
 * 不沿用上一轮条件。
 */
export function TaskComposer({
  entry,
  draft,
  busy,
  submitDisabled,
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
  submitDisabled: boolean;
  total: number | undefined;
  topics: string[];
  onDraft: (value: string) => void;
  onSubmit: (suggestion?: { text: string; suggestion_ref: string }) => void;
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
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches);
  const [position, setPosition] = useState(0);
  const [pointed, setPointed] = useState(false);
  const [buttonFocused, setButtonFocused] = useState(false);
  const offerId = useId();
  const measure = useRef<HTMLSpanElement>(null);
  const preview = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const prompt = restart ? restartPlaceholder : placeholder;
  // 量尺按单行布局的文字列宽排版草稿，空草稿时排版长提示：草稿一行放不下时文本域才占满整行、
  // 操作移到下一行，长提示放不下时换用短句。切换不改变量尺的列宽，临界长度上不会来回跳。
  useLayoutEffect(() => {
    const node = measure.current;
    if (!node) return;
    const check = () => setOverflow(node.scrollHeight > node.clientHeight);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(node);
    return () => observer.disconnect();
  }, [draft, prompt]);
  const multiline = overflow && !!draft;
  const hint = overflow && !draft ? (restart ? shortRestartPlaceholder : shortPlaceholder) : prompt;
  const full = draft.length >= draftLimit;
  const filled = !!draft.trim();
  const typing = !draft && !focused && !restart && wide;
  // 指针停在框上或按钮获得焦点时，轮播停在当前整句。
  const current = position > 0 ? suggestions[position - 1] : undefined;
  const offered = typing ? current : undefined;
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
    if (!entry || busy || submitDisabled) return;
    if (filled) onSubmit();
    else if (offered) {
      const line = preview.current;
      const text = line?.firstElementChild;
      const width = text?.getBoundingClientRect().width ?? 0;
      if (
        line &&
        text?.textContent === offered.text &&
        width > 0 &&
        width <= line.getBoundingClientRect().width
      )
        onSubmit(offered);
      else onSuggestion(offered);
    }
  };
  return (
    <>
      <div className={taskComposerStyles} data-busy={busy || undefined}>
        <form
          className={taskInputStyles}
          data-multiline={multiline || undefined}
          onPointerEnter={() => setPointed(true)}
          onPointerLeave={() => setPointed(false)}
          onMouseDown={(event) => {
            // 点在框内按钮以外的地方直接聚焦文本域，且不先失焦，辉光与打字提示不闪。
            if (event.target instanceof Element && !event.target.closest('button, textarea')) {
              event.preventDefault();
              inputRef.current?.focus();
            }
          }}
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
              maxLength={draftLimit}
              enterKeyHint="send"
              autoComplete="off"
              placeholder={hint}
              className={cn(taskInputFieldStyles, typing && taskInputTypingStyles)}
            />
            {typing && (
              <span ref={preview} className={taskTypingStyles} aria-hidden="true">
                <TextType
                  key={position}
                  text={current?.text.replace(/[\r\n]+/g, ' ') ?? hint}
                  onNext={
                    suggestions.length
                      ? () => setPosition((at) => (at >= suggestions.length ? 1 : at + 1))
                      : undefined
                  }
                  paused={pointed || buttonFocused}
                  cursorClassName={taskTypingCursorStyles}
                />
              </span>
            )}
          </span>
          <span
            ref={measure}
            className={taskFieldMeasureStyles}
            data-value={draft || prompt}
            aria-hidden="true"
          />
          {multiline && draft.length >= draftCountAt && (
            <span className={taskCountStyles} data-full={full || undefined} aria-hidden="true">
              {draft.length}/{draftLimit}
            </span>
          )}
          <span className="sr-only" role="status">
            {full ? `已达到 ${draftLimit} 字上限` : ''}
          </span>
          <span className={taskActionsStyles}>
            {!busy && (
              <kbd className={taskKbdStyles} aria-hidden="true">
                Ctrl/⌘ + Enter
              </kbd>
            )}
            <button
              type="submit"
              className={busy ? stopButtonStyles : taskSubmitStyles}
              disabled={!busy && (submitDisabled || !entry || (!filled && !offered))}
              aria-describedby={offered && !busy ? offerId : undefined}
              onFocus={() => setButtonFocused(true)}
              onBlur={() => setButtonFocused(false)}
            >
              {busy ? (
                <>
                  <Pause size={13} aria-hidden="true" />
                  停止
                </>
              ) : (
                <>
                  {dialogue ? '帮我找' : '搜索'}
                  <ArrowRight size={14} aria-hidden="true" className={taskSubmitIconStyles} />
                </>
              )}
            </button>
            {offered && !busy && (
              <span id={offerId} hidden>
                示例：{offered.text}（未完整显示时会先填入输入框）
              </span>
            )}
          </span>
        </form>
      </div>
      <div
        className={taskSuggestRowStyles}
        onFocus={({ currentTarget, target }) => {
          if (
            currentTarget.scrollWidth > currentTarget.clientWidth &&
            target.matches(':focus-visible')
          ) {
            target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }
        }}
      >
        {chips.length > 0 && (
          <>
            <span className={taskSuggestLabelStyles}>
              {suggestions.length ? '示例' : '常见主题'}
            </span>
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={taskChipStyles}
                title={chip.label}
                onClick={chip.pick}
              >
                {chip.topic && (
                  <span className={taskTopicHashStyles} aria-hidden="true">
                    #
                  </span>
                )}
                {chip.label}
              </button>
            ))}
          </>
        )}
      </div>
      <div className={taskMetaRowStyles}>
        <span className={taskPrivacyNoteStyles}>
          {dialogue ? (
            <>
              <ShieldCheck size={13} aria-hidden="true" className="shrink-0" />
              问题会交由本站配置的模型处理，勿填凭据
            </>
          ) : entry ? (
            '当前为关键词匹配，不会询问模型；换个说法或使用资源目录。'
          ) : null}
        </span>
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
