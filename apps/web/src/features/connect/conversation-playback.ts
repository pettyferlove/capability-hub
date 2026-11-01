import type { ConversationStep } from './conversation-examples.js';

/**
 * 确认步骤的裁决结果；`null` 表示用户尚未回应，回放会停在该步骤等待。
 * `denied` 是终止态：拒绝后不再展示后续步骤。
 */
export type ConversationDecision = 'allowed' | 'denied' | null;

/**
 * 由「已展示步数 + 裁决 + 播放开关」推导回放的三个派生状态，本身不持有时序，也不推进 `visible`。
 *
 * - `waiting`：当前最后一步是确认且尚无裁决，必须停住等待用户；
 * - `complete`：已展示到末步，或被裁决为 `denied`（提前终止）；
 * - `advancing`：仍在播放，且既不等待也未结束。
 *
 * `visible` 初值为 2（首步是用户指令，第二步即已可读），由调用方按节拍递增；
 * 本函数不做边界钳制，`visible` 越过 `steps.length` 只会判为结束。
 */
export function conversationPlayback(
  steps: readonly ConversationStep[],
  visible: number,
  decision: ConversationDecision,
  playing: boolean,
) {
  const waiting = steps[visible - 1]?.kind === 'confirmation' && decision === null;
  const complete = !waiting && (visible >= steps.length || decision === 'denied');
  return { waiting, complete, advancing: playing && !waiting && !complete };
}

/** 阅读历史消息只停止跟随滚动，不暂停播放。 */
export function isTranscriptAtEnd({
  scrollTop,
  scrollHeight,
  clientHeight,
}: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}) {
  return scrollHeight - clientHeight - scrollTop <= 24;
}
