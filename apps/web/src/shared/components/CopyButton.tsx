import {
  btnStyles,
  btnPrimaryStyles,
  copyInvitationStyles,
  formStackStyles,
  kfocusStyles,
} from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { Check, Copy } from '../icons/lucide.js';
import { useEffect, useRef, useState } from 'react';
import { DecryptedText } from './react-bits/DecryptedText.js';
import { DialogTitle } from './DialogTitle.js';
import { Overlay } from './Overlay.js';

/**
 * 复制按钮：写完剪贴板后 1.6s 内显示「已复制」再自动复原，并用 `aria-live` 播报结果。
 * 剪贴板不可用时提供可选中的完整原文，保留多行指令的换行。
 */
export function CopyButton({
  text,
  label = '复制',
  variant = 'code',
}: {
  text: string;
  /** 空闲态文案，同时作为 `aria-label`；成功态固定显示「已复制」。 */
  label?: string;
  /** `secondary` 与同一行标准按钮等高；`code` 仅用于紧凑的代码或编号操作。 */
  variant?: 'code' | 'primary' | 'secondary';
}) {
  const [done, setDone] = useState(false);
  const [manual, setManual] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setDone(false), 1600);
    } catch {
      setDone(false);
      setManual(true);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={onCopy}
        aria-label={done ? '已复制' : label}
        className={
          variant === 'code'
            ? cn(
                kfocusStyles,
                'relative inline-flex h-8 cursor-pointer items-center gap-1.5 overflow-hidden rounded-full bg-code-control px-3 text-xs text-[var(--code-fg)] transition-colors hover:bg-code-control-hover',
              )
            : cn(
                btnStyles,
                variant === 'primary' && btnPrimaryStyles,
                variant === 'primary' && copyInvitationStyles,
                kfocusStyles,
                'relative overflow-hidden',
              )
        }
      >
        <span className="inline-flex items-center gap-1.5">
          {done ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          <DecryptedText text={done ? '已复制' : label} />
        </span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {done ? '已复制到剪贴板' : ''}
      </span>
      {manual && (
        <Overlay open label="手动复制" variant="palette" onClose={() => setManual(false)}>
          <DialogTitle title="手动复制" onClose={() => setManual(false)} />
          <label className={cn(formStackStyles, 'p-4')}>
            请复制以下文本
            <textarea
              readOnly
              autoFocus
              value={text}
              onFocus={(event) => event.currentTarget.select()}
            />
          </label>
        </Overlay>
      )}
    </>
  );
}
