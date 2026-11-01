import { createContext } from 'react';

/** 采纳动作的来源锚点：哪次执行，以及触发按钮中心点在视口坐标系中的像素位置。 */
export interface ReviewOrigin {
  executionId: string;
  x: number;
  y: number;
}

/**
 * 快速确认插槽：Provider 未挂载时为 `null`，调用方必须按「无 Provider」分支处理，
 * 不得依赖 `slot` 或 `onAdopt` 存在；`slot` 是浮层挂载点，`onAdopt` 仅在用户采纳草案后才回调。
 */
export const QuickReview = createContext<{
  slot: HTMLDivElement | null;
  onAdopt?: (origin: ReviewOrigin) => void;
} | null>(null);
