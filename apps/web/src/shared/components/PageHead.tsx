import { motion, useScroll, useTransform } from 'motion/react';
import type { ReactNode } from 'react';
import { pageHeadStyles, pageHeadLabelStyles, pageHeadTitleStyles } from '../styles/recipes.js';

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
  eyebrow: ReactNode;
  title: string;
  description: ReactNode;
  /** 右侧操作区（刷新、主按钮等），缺省时标题独占整行。 */
  action?: ReactNode;
}) {
  const { scrollY } = useScroll();
  const titleScale = useTransform(scrollY, [0, 64], [1, 0.92]);
  const labelOpacity = useTransform(scrollY, [0, 40], [1, 0]);
  return (
    <div className={pageHeadStyles}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <motion.h1 className={pageHeadTitleStyles} style={{ scale: titleScale }}>
            {title}
          </motion.h1>
          <motion.span className={pageHeadLabelStyles} style={{ opacity: labelOpacity }}>
            {eyebrow}
          </motion.span>
        </div>
        <p className="mt-1 text-body leading-normal text-muted-ink">{description}</p>
      </div>
      {action}
    </div>
  );
}
