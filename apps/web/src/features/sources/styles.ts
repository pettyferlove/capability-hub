import { cn } from '../../shared/styles/cn.js';

export const sourceCardStyles = 'min-w-0 overflow-hidden rounded-2xl border border-line bg-paper';

export const sourceCardHeaderStyles = cn(
  'flex min-w-0 flex-col items-start gap-4 px-4 py-4 sm:px-5',
  'md:flex-row md:items-center md:justify-between',
);

export const sourceCardBodyStyles = cn(
  'grid min-w-0 gap-4 border-t border-line px-4 py-4 sm:px-5',
  'md:grid-cols-[minmax(0,1.8fr)_minmax(13rem,1fr)] md:gap-5',
);

export const sourceSectionTitleStyles =
  'inline-flex items-center gap-2 text-label font-semibold text-ink';

export const sourceTargetRowStyles = cn(
  'grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2',
  'max-[480px]:grid-cols-[auto_minmax(0,1fr)] max-[480px]:[&>div:last-child]:col-start-2',
  'max-[480px]:[&>div:last-child]:justify-start',
);

export const sourceMetaStyles = cn(
  'mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-body',
  '[&_dt]:text-muted-ink [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:[overflow-wrap:anywhere]',
);

export const sourceIssueStyles = cn(
  'mx-4 mb-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1',
  'rounded-lg border-l-2 border-danger bg-danger-soft px-3 py-2.5 text-body text-ink sm:mx-5',
  '[&_a]:col-start-2 md:grid-cols-[auto_minmax(0,1fr)_auto] md:[&_a]:col-start-3',
);

export const sourceLinkStyles = cn(
  'inline-flex min-h-7 items-center gap-1.5 justify-self-start rounded-sm border-0 bg-transparent',
  'p-0 text-label font-medium text-brand underline-offset-4 hover:underline',
);

export const editorSectionStyles = 'grid min-w-0 gap-4';
export const editorHeadingStyles =
  'flex items-center gap-2 border-b border-line pb-2 text-base font-semibold';
export const targetEditorStyles = 'grid min-w-0 gap-4 rounded-xl border-line bg-paper p-4';
export const editorFooterStyles =
  'grid shrink-0 gap-2 border-t border-line bg-paper px-4 py-3 sm:px-6';
