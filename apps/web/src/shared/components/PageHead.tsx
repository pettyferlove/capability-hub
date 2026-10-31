import { pageHeadStyles, eyebrowStyles, subtleStyles } from '../styles/recipes.js';
import type { ReactNode } from 'react';

export function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
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
