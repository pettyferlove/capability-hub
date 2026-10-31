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

export function Loading({
  label = '正在加载…',
  variant = 'section',
}: {
  label?: string;
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
