import { emptyStyles, emptyIconStyles } from '../styles/recipes.js';
import { ShieldCheck } from '../icons/lucide.js';
import type { ReactNode } from 'react';

export function Empty({
  title,
  children,
  action,
  icon,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className={emptyStyles}>
      <span className={emptyIconStyles}>{icon ?? <ShieldCheck size={28} />}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
