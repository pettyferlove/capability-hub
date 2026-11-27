import {
  pageResourceErrorStyles,
  pageResourceErrorCardStyles,
  pageResourceErrorIconStyles,
  pageResourceErrorCopyStyles,
} from './styles.js';
import { panelStyles, btnStyles, btnPrimaryStyles } from '../shared/styles/recipes.js';
import { cn } from '../shared/styles/cn.js';
import { FileWarning, RefreshCw } from '../shared/icons/lucide.js';
import { reportError } from '../shared/logging.js';
import { openHubFeedback, type HubFeedbackSeed } from '../shared/hub-feedback-events.js';
import { Component, type ReactNode } from 'react';

/**
 * 捕获子树渲染异常并上报 `react.error`；未指定区块占位时显示可刷新的兜底页。
 * 不覆盖事件处理器和异步回调中的异常。
 */
export class PageBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onError?: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  private feedbackError: HubFeedbackSeed['pageError'];
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error): void {
    const entry = reportError('react.error', { error });
    this.feedbackError = {
      event: 'react.error',
      type: entry?.error?.type || 'Error',
      stack: entry?.error?.stack?.slice(0, 2000),
    };
    this.props.onError?.();
  }
  render() {
    if (this.state.failed) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <section className={pageResourceErrorStyles}>
          <div
            className={cn(panelStyles, pageResourceErrorCardStyles)}
            role="alert"
            aria-labelledby="page-resource-error-title"
            aria-describedby="page-resource-error-description"
          >
            <span className={pageResourceErrorIconStyles} aria-hidden="true">
              <FileWarning size={28} strokeWidth={1.6} />
            </span>
            <div className={pageResourceErrorCopyStyles}>
              <h1 id="page-resource-error-title">页面暂时无法载入</h1>
              <p id="page-resource-error-description">
                页面发生了加载或运行错误。请刷新页面后重试。
              </p>
            </div>
            <button
              type="button"
              className={cn(btnStyles, btnPrimaryStyles)}
              onClick={() => location.reload()}
            >
              <RefreshCw size={16} aria-hidden="true" />
              刷新页面
            </button>
            <button
              type="button"
              className={btnStyles}
              onClick={() => openHubFeedback({ pageError: this.feedbackError })}
            >
              反馈此问题
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}
