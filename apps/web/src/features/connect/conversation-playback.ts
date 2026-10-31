import type { ConversationStep } from './conversation-examples.js';

export type ConversationDecision = 'allowed' | 'denied' | null;

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
