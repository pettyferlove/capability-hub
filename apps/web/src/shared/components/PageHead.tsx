import { pageHeadStyles, eyebrowStyles, subtleStyles } from '../styles/recipes.js';
import type { ReactNode } from 'react';

/**
 * 页面标题区：眉标 + `h1` + 说明。每个页面只应出现一个 `h1`，标题层级由它往下排，
 * 因此不要在同一页面复用本组件做二级标题。
 */
export function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  /** 眉标，通常为英文栏目名，全小写/大写由样式决定，不要在这里再拼格式。 */
  eyebrow: string;
  title: string;
  description: string;
  /** 右侧操作区（刷新、主按钮等），缺省时标题独占整行。 */
  action?: ReactNode;
}) {
  return (
    <div className={pageHeadStyles}>
      <div>
        <p className={eyebrowStyles}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={subtleStyles}>{description}</p>
      </div>
      {action}
    </div>
  );
}
