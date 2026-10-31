import { motion, useIsPresent, useReducedMotion } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { contentTransition, softSpring } from '../../shared/motion/transitions.js';

/** 退场期间保留视觉节点，但立即移出键盘与指针交互。 */
export const CatalogMotionItem = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className: string; index?: number }
>(function CatalogMotionItem({ children, className, index = 0 }, ref) {
  const present = useIsPresent();
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      className={className}
      inert={!present}
      aria-hidden={present ? undefined : true}
      layout={reduceMotion ? false : 'position'}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{
        opacity: 1,
        y: 0,
        transition: reduceMotion
          ? { duration: 0 }
          : { ...contentTransition, duration: 0.24, delay: Math.min(index, 6) * 0.025 },
      }}
      exit={{
        opacity: 0,
        y: reduceMotion ? 0 : -6,
        transition: { duration: reduceMotion ? 0 : 0.16 },
      }}
      transition={{ layout: reduceMotion ? { duration: 0 } : softSpring }}
    >
      {children}
    </motion.div>
  );
});
