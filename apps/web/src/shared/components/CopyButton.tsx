import {
  btnStyles,
  btnPrimaryStyles,
  copyInvitationStyles,
  kfocusStyles,
} from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { Toast } from '@heroui/react/toast';
import { Check, Copy } from '../icons/lucide.js';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import { spring } from '../motion/transitions.js';
export function CopyButton({
  text,
  label = '复制',
  variant = 'code',
}: {
  text: string;
  label?: string;
  variant?: 'code' | 'primary';
}) {
  const [done, setDone] = useState(false);
  const reduceMotion = useReducedMotion();
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 1600);
    } catch {
      Toast.toast.warning('浏览器拒绝了复制，请手动选中文本');
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={onCopy}
        aria-label={done ? '已复制' : label}
        className={
          variant === 'primary'
            ? cn(
                btnStyles,
                btnPrimaryStyles,
                copyInvitationStyles,
                kfocusStyles,
                'relative overflow-hidden',
              )
            : cn(
                kfocusStyles,
                'relative inline-flex h-8 cursor-pointer items-center gap-1.5 overflow-hidden rounded-full bg-code-control px-3 text-xs text-[var(--code-fg)] transition-colors hover:bg-code-control-hover',
              )
        }
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={done ? 'done' : 'copy'}
            className="inline-flex items-center gap-1.5"
            initial={reduceMotion ? false : { y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: -12, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : spring}
          >
            {done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            {done ? '已复制' : label}
          </motion.span>
        </AnimatePresence>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {done ? '已复制到剪贴板' : ''}
      </span>
    </>
  );
}
