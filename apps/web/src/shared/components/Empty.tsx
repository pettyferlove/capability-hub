import { emptyStyles, emptyIconStyles } from '../styles/recipes.js';
import { ShieldCheck } from '../icons/lucide.js';
import type { ReactNode } from 'react';
import { ShinyText } from './react-bits/ShinyText.js';

/**
 * 空态占位：说明 + 可选图标与操作，用于「没有数据」而不是「加载失败」的场景，
 * 失败请用 {@link ErrorState}，两者措辞与视觉不可混用以免误导用户重试成功与否。
 */
export function Empty({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  /** 补充说明，渲染在 `<p>` 内，避免只给标题让用户不知道下一步做什么。 */
  children: ReactNode;
  /** 主操作（如「去发布」），缺省时不渲染。 */
  action?: ReactNode;
  /** 自定义图标，缺省为盾牌图标。 */
  icon?: ReactNode;
}) {
  return (
    <div className={emptyStyles}>
      <span className={emptyIconStyles}>{icon ?? <ShieldCheck size={28} />}</span>
      <h3>
        <ShinyText>{title}</ShinyText>
      </h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
