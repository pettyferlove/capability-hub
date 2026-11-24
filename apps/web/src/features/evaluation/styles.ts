import { cn } from '../../shared/styles/cn.js';

export const evaluationPanelStyles =
  '@container/evaluation flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-paper p-3 text-ink sm:p-5';
export const evaluationLayoutStyles =
  'grid min-w-0 items-start gap-3 @min-[768px]/evaluation:grid-cols-[minmax(0,360px)_minmax(0,1fr)] @min-[768px]/evaluation:gap-5';
export const evaluationRowStyles = cn(
  'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_14px] items-center gap-2.5 rounded-md px-2 py-2.5 text-left',
  'enabled:hover:bg-page aria-expanded:bg-page focus-visible:outline-2 focus-visible:outline-brand',
);
export const evaluationDisclosureStyles =
  'flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-label font-semibold text-ink hover:bg-page focus-visible:outline-2 focus-visible:outline-brand';
export const evaluationLinkStyles =
  'inline-flex min-h-8 max-w-full items-center gap-1 rounded-md text-left text-label text-brand [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-brand';
export const evaluationActionStyles =
  'inline-flex min-h-9 items-center rounded-lg border border-line bg-paper px-3 text-label font-medium text-ink hover:bg-page focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50';
export const evaluationNoteStyles =
  'min-w-0 text-caption leading-relaxed text-muted-ink [overflow-wrap:anywhere]';
export const evaluationDetailsStyles = 'min-w-0 text-label [overflow-wrap:anywhere]';
export const evaluationPopoverStyles =
  'z-100 max-h-[75vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-line bg-paper p-4 text-ink [box-shadow:var(--shadow-floating)]';
