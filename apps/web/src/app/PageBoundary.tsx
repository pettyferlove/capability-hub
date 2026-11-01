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
import { Component, type ReactNode } from 'react';

/**
 * 页面级错误边界：捕获子树渲染异常后上报 `react.error` 并换成可刷新的兜底页，
 * 不尝试保留任何局部状态。只覆盖渲染期错误，事件处理器与异步回调里的异常仍需各自上报。
 */
export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error): void {
    reportError('react.error', { error });
  }
  render() {
    if (this.state.failed)
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
          </div>
        </section>
      );
    return this.props.children;
  }
}
