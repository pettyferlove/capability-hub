import { errorStateStyles, errorStateMessageStyles, textBtnStyles } from '../styles/recipes.js';
import type { HubFeedbackFailedRequest } from '@capability-hub/contracts';
import { latestFailedRequest } from '../api/client.js';
import { openHubFeedback } from '../hub-feedback-events.js';
import { CopyButton } from './CopyButton.js';
import { RefreshCw } from '../icons/lucide.js';
import { Message } from './Message.js';

/**
 * 失败占位：展示服务端或客户端给出的文案，并可选提供重试。
 * `message` 原样显示（通常来自 {@link ApiError.message}），不再套一层「出错了」，
 * 因为后端的错误文案已经区分了权限、冲突等情况。
 *
 * @param retry - 需要用户主动触发的重取；缺省时不显示按钮，表示该错误无法通过重试解决。
 */
export function ErrorState({
  message,
  retry,
  status,
  requestId,
  failure,
}: {
  message: string;
  retry?: () => void;
  status?: number;
  requestId?: string;
  failure?: HubFeedbackFailedRequest;
}) {
  const offerFeedback = status === 0 || (status !== undefined && status >= 500 && status <= 599);
  return (
    <Message error className={errorStateStyles}>
      <span className={errorStateMessageStyles}>{message}</span>
      {requestId && (
        <span className="inline-flex flex-wrap items-center gap-2 text-caption">
          <span>
            请求编号 <code title={requestId}>{requestId.slice(0, 8)}…</code>
          </span>
          <CopyButton text={requestId} label="复制请求编号" />
        </span>
      )}
      {offerFeedback && (
        <button
          type="button"
          className={textBtnStyles}
          onClick={() => {
            const request =
              failure ??
              (requestId
                ? latestFailedRequest((entry) => entry.request_id === requestId)
                : undefined);
            openHubFeedback({ request });
          }}
        >
          反馈此问题
        </button>
      )}
      {retry && (
        <button type="button" className={textBtnStyles} onClick={retry}>
          <RefreshCw size={14} />
          重新加载
        </button>
      )}
    </Message>
  );
}
