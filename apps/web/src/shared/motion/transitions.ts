/** 主交互的弹簧参数（偏硬、回弹小），用于按钮、面板等需要迅速到位的元素。 */
export const spring = { type: 'spring', stiffness: 380, damping: 32 } as const;

/** 大块面板的弹簧参数（更软），位移距离大时比 {@link spring} 更不容易显得生硬。 */
export const softSpring = { type: 'spring', stiffness: 260, damping: 30 } as const;

/** 内容切换的固定时长过渡（约 180ms）；时长与缓动都硬编码，因此不受弹簧参数调整影响。 */
export const contentTransition = { duration: 0.18, ease: [0.22, 1, 0.36, 1] } as const;
