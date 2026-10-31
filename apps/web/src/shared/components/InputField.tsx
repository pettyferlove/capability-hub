import { AppIcon } from '../icons/AppIcon.js';
import type { ComponentPropsWithRef, ReactNode } from 'react';
import { cn } from '../styles/cn.js';
import { inputIcons, type InputIconName } from './input-icons.js';

type InputFieldProps = Omit<ComponentPropsWithRef<'input'>, 'children'> & {
  icon: InputIconName;
  trailing?: ReactNode;
};

/** 保留原生输入、ref 和表单语义，装饰图标不参与焦点与无障碍名称。 */
export function InputField({ icon, trailing, className, ...props }: InputFieldProps) {
  return (
    <span className="relative block w-full min-w-0">
      <input
        {...props}
        className={cn(
          'min-h-[var(--control-height)] w-full min-w-0 rounded-[10px] border border-control-border bg-paper py-[9px] pl-9! pr-3 text-body leading-[1.5] text-ink outline-offset-2 focus-visible:outline-muted-ink disabled:cursor-not-allowed disabled:bg-page disabled:text-muted-ink',
          trailing && 'pr-14!',
          className,
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-ink',
          props.disabled && 'opacity-50',
        )}
      >
        <AppIcon icon={inputIcons[icon]} size={16} />
      </span>
      {trailing && <span className="absolute inset-y-0 right-3 flex items-center">{trailing}</span>}
    </span>
  );
}
