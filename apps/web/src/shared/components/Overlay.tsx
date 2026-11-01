import {
  hubShowcaseBackdropStyles,
  overlaySheetStyles,
  overlaySheetWideStyles,
  gutterStyles,
  hubShowcaseDialogStyles,
} from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { FocusScope, useOverlay, usePreventScroll } from 'react-aria';

import { softSpring, spring } from '../motion/transitions.js';
import { LoadingScope } from './LoadingScope.js';

/**
 * 弹层基座：portal 到 `body`，Esc 与点击遮罩都会走 `onClose`（`isDismissable`），
 * 打开期间锁滚动、把焦点圈在弹层内并在关闭后还给触发元素。
 * 内部自带 {@link LoadingScope}，因此弹层里的加载占位与页面占位各自计时，不会互相牵连。
 * `reduceMotion` 生效时动画时长归零，但仍保留挂载/卸载时序。
 */
export function Overlay({
  open,
  onClose,
  label,
  children,
  variant,
  size = 'default',
  loadingKey,
}: {
  open: boolean;
  /** 由外部持有开关状态；调用方负责同步路由或按钮状态。 */
  onClose: () => void;
  /** 弹层的无障碍名称（`aria-label`），同时是加载作用域的兜底 key。 */
  label: string;
  children: ReactNode;
  /** `sheet` 右侧抽屉、`palette` 顶部居中面板、`showcase` 居中展示，三者的遮罩与尺寸规则不同。 */
  variant: 'sheet' | 'palette' | 'showcase';
  /** 只在 `sheet` 上生效：`wide` 放宽抽屉，`workspace` 在宽屏占 60vw；其余变体忽略此值。 */
  size?: 'default' | 'wide' | 'workspace';
  /** 内容切换时用它重置加载计时（如详情 slug），缺省回落到 `label`。 */
  loadingKey?: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { overlayProps } = useOverlay({ isOpen: open, onClose, isDismissable: true }, dialog);
  // 与子菜单和选择框共享 React Aria 的滚动锁及弹层栈。
  usePreventScroll({ isDisabled: !open });

  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div {...overlayProps} className="fixed inset-0 z-[70]">
          <motion.div
            className={
              variant === 'showcase'
                ? cn(hubShowcaseBackdropStyles, 'absolute inset-0')
                : 'absolute inset-0 bg-backdrop backdrop-blur-[2px]'
            }
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
          />
          <LoadingScope scopeKey={loadingKey ?? label}>
            <FocusScope contain restoreFocus autoFocus>
              {variant === 'sheet' ? (
                <motion.div
                  ref={dialog}
                  role="dialog"
                  tabIndex={-1}
                  aria-modal="true"
                  aria-label={label}
                  className={cn(
                    overlaySheetStyles,
                    'absolute bottom-0 right-0 top-0 flex flex-col overflow-hidden bg-background shadow-overlay sm:rounded-l-[28px]',
                    size === 'wide' ? overlaySheetWideStyles : '',
                    size === 'workspace' && 'w-full max-w-[760px] lg:w-[60vw] lg:overflow-visible',
                  )}
                  style={{
                    paddingTop: 'env(safe-area-inset-top, 0px)',
                    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
                  }}
                  initial={reduceMotion ? false : { x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { x: 60, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : softSpring}
                >
                  {children}
                </motion.div>
              ) : (
                <div
                  className={
                    variant === 'showcase'
                      ? 'pointer-events-none absolute inset-0 flex items-center justify-center p-4'
                      : cn(
                          'pointer-events-none absolute inset-x-0 top-[12vh] flex justify-center',
                          gutterStyles,
                        )
                  }
                >
                  <motion.div
                    ref={dialog}
                    role="dialog"
                    tabIndex={-1}
                    aria-modal="true"
                    aria-label={label}
                    className={
                      variant === 'showcase'
                        ? cn(
                            hubShowcaseDialogStyles,
                            'pointer-events-auto w-full max-h-full overflow-y-auto',
                          )
                        : 'pointer-events-auto w-full max-w-[620px] overflow-hidden rounded-[22px] border border-separator bg-overlay shadow-overlay'
                    }
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: -6 }}
                    transition={reduceMotion ? { duration: 0 } : spring}
                  >
                    {children}
                  </motion.div>
                </div>
              )}
            </FocusScope>
          </LoadingScope>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
