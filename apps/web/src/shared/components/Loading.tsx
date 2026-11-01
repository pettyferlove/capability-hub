import {
  loadingStyles,
  loadingPageStyles,
  loadingSectionStyles,
  loadingFillStyles,
  loadingInlineStyles,
  loadingIndicatorStyles,
  spinStyles,
  loadingLabelStyles,
} from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { LoaderCircle } from '../icons/lucide.js';
import { useLoadingDelay } from './LoadingScope.js';

/**
 * 加载占位；是否真正可见受 {@link useLoadingDelay} 的延迟控制，`data-loading-visible` 暴露该状态，
 * 短于阈值就跳过的请求只会留下这一属性而不闪现布局。
 * 始终是无障碍的 `role="status"`，因此延迟只影响视觉，不影响朗读文字（文字始终存在）。
 */
export function Loading({
  label = '正在加载…',
  variant = 'section',
}: {
  /** 朗读与可见文案，缺省「正在加载…」；需要说明加载对象时传入更具体的说法。 */
  label?: string;
  /** `page` 整页、`section` 区块、`fill` 撑满父容器、`inline` 行内，四者尺寸与对齐不同。 */
  variant?: 'page' | 'section' | 'fill' | 'inline';
}) {
  const visible = useLoadingDelay();
  return (
    <div
      className={cn(
        loadingStyles,
        {
          page: loadingPageStyles,
          section: loadingSectionStyles,
          fill: loadingFillStyles,
          inline: loadingInlineStyles,
        }[variant],
      )}
      role="status"
      aria-busy="true"
      data-loading-visible={visible}
    >
      <LoaderCircle
        size={20}
        className={cn(loadingIndicatorStyles, spinStyles)}
        aria-hidden="true"
      />
      <span className={loadingLabelStyles}>{label}</span>
    </div>
  );
}
