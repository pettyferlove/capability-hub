import type { HubFeedbackDiagnostics, HubFeedbackFailedRequest } from '@capability-hub/contracts';

type WebDiagnostics = Extract<HubFeedbackDiagnostics['client'], { kind: 'web' }>;

/** 只传经过白名单筛选的触发记录，不传异常对象或请求正文。 */
export interface HubFeedbackSeed {
  request?: HubFeedbackFailedRequest;
  pageError?: NonNullable<WebDiagnostics['page_errors']>[number];
}

type HubFeedbackChange = { kind: 'submitted' | 'commented' } | { kind: 'read'; id: string };

declare global {
  interface WindowEventMap {
    'hub:feedback': CustomEvent<HubFeedbackSeed>;
    'hub:feedback-changed': CustomEvent<HubFeedbackChange>;
  }
}

/** 共享错误组件与应用外壳之间不依赖页面上下文。 */
export function openHubFeedback(seed?: HubFeedbackSeed): void {
  window.dispatchEvent(new CustomEvent('hub:feedback', { detail: seed }));
}

/** 提交者更新后通知外壳更新未读数，不启用轮询。 */
export function notifyHubFeedbackChanged(change: HubFeedbackChange): void {
  window.dispatchEvent(new CustomEvent('hub:feedback-changed', { detail: change }));
}
