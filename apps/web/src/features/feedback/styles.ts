import { cn } from '../../shared/styles/cn.js';
import { btnStyles, kfocusStyles, sheetScrollStyles } from '../../shared/styles/recipes.js';

export const feedbackHeaderStyles =
  'flex shrink-0 items-center justify-between gap-3 bg-paper px-6 pt-4 pb-2 max-[600px]:px-[17px]';

export const feedbackScrollStyles = cn(sheetScrollStyles, 'bg-page py-5');

export const feedbackFooterStyles =
  'flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line bg-paper px-6 py-4 max-[600px]:px-[17px]';

export const feedbackTabStyles = cn(
  kfocusStyles,
  'inline-flex min-h-8.5 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 text-label font-medium whitespace-nowrap text-muted-ink',
  'hover:text-ink data-[selected]:text-brand data-[disabled]:cursor-default data-[disabled]:opacity-50 pointer-coarse:min-h-11',
);

export const feedbackFieldStyles = 'grid min-w-0 gap-1.5 text-label font-medium';

export const feedbackRadioStyles = cn(
  btnStyles,
  'min-h-8.5 cursor-pointer px-2.5 py-1.5 data-[selected]:border-brand data-[selected]:bg-brand-soft',
  'data-[selected]:text-brand data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-brand',
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
);

export const feedbackCheckStyles = cn(
  'group/feedback-check flex min-h-8.5 min-w-0 cursor-pointer flex-row items-start gap-2 py-1.5 text-label',
  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
);

export const feedbackCheckMarkStyles = cn(
  'mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm border border-control-border bg-paper text-brand',
  'group-data-[selected]/feedback-check:border-brand group-data-[selected]/feedback-check:bg-brand-soft',
  'group-data-[indeterminate]/feedback-check:border-brand group-data-[indeterminate]/feedback-check:bg-brand-soft',
  'group-data-[focus-visible]/feedback-check:outline-2 group-data-[focus-visible]/feedback-check:outline-offset-2 group-data-[focus-visible]/feedback-check:outline-brand',
);

export const feedbackEvidenceStyles =
  'grid min-w-0 grid-cols-1 gap-4 rounded-[14px] border border-line bg-paper px-4 py-4';

export const feedbackDisclosureStyles = cn(
  kfocusStyles,
  'cursor-pointer rounded-sm py-1.5 text-label font-medium text-brand',
);

export const feedbackCapsuleStyles = cn(
  btnStyles,
  'fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-[9]',
  'rounded-full border-brand bg-paper text-brand shadow-[var(--shadow-floating)]',
);
