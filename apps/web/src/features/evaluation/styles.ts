import { cn } from '../../shared/styles/cn.js';

export const evaluationPanelStyles =
  '@container/evaluation flex min-w-0 flex-col gap-3 rounded-xl border border-line bg-paper p-3 text-ink sm:p-5';
export const evaluationLayoutStyles =
  'grid min-w-0 items-start gap-3 @min-[768px]/evaluation:grid-cols-[minmax(0,360px)_minmax(0,1fr)] @min-[768px]/evaluation:gap-5';
export const evaluationRowStyles = cn(
  'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_14px] items-center gap-2.5 rounded-md px-2 py-2.5 text-left',
  'transition-colors duration-(--duration-fast) enabled:hover:bg-page aria-expanded:bg-page focus-visible:outline-2 focus-visible:outline-brand',
);
export const evaluationDisclosureStyles =
  'flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-2 text-label font-semibold text-ink transition-colors duration-(--duration-fast) hover:bg-page focus-visible:outline-2 focus-visible:outline-brand';
export const evaluationChevronStyles =
  'shrink-0 transition-transform duration-(--duration-normal) ease-(--ease-out)';
export const evaluationRevealStyles =
  'motion-safe:animate-[audit-action-in_220ms_var(--ease-out)_both]';
export const evaluationScoreStyles =
  'shrink-0 text-right motion-safe:animate-[audit-action-in_320ms_var(--ease-out)_both]';
export const evaluationStageStyles = 'relative min-w-0 flex-1 overflow-hidden rounded-full bg-line';
export const evaluationStageFillStyles =
  'absolute inset-0 origin-left rounded-full bg-brand transition-transform duration-500 ease-(--ease-out)';

/** 只标记服务端正在处理的下一阶段，不表示阶段内完成比例。 */
export const evaluationStageActiveStyles =
  'after:absolute after:inset-y-0 after:left-0 after:w-1/2 after:rounded-full after:bg-linear-to-r after:from-transparent after:via-brand after:to-transparent motion-safe:after:animate-[agent-sweep_1.4s_ease-in-out_infinite]';
export const evaluationLinkStyles =
  'inline-flex min-h-8 max-w-full items-center gap-1 rounded-md text-left text-label text-brand [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-brand';
export const evaluationActionStyles =
  'inline-flex min-h-9 items-center rounded-lg border border-line bg-paper px-3 text-label font-medium text-ink hover:bg-page focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50';
export const evaluationNoteStyles =
  'min-w-0 text-caption leading-relaxed text-muted-ink [overflow-wrap:anywhere]';
export const evaluationDetailsStyles = 'min-w-0 text-label [overflow-wrap:anywhere]';
export const evaluationPopoverStyles =
  'z-100 max-h-[75vh] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-line bg-paper p-4 text-ink [box-shadow:var(--shadow-floating)]';
export const evaluationStripStyles =
  'relative mb-4 grid min-w-0 items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-page px-3 py-2.5 text-ink transition-colors hover:border-brand-line sm:px-4 sm:py-3';
export const evaluationStripActionStyles = cn(
  'col-end-[-1] row-start-1 inline-flex min-h-8 items-center gap-1 text-label font-medium whitespace-nowrap text-brand outline-none',
  'after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-brand',
);
export const evaluationStripReadingsStyles =
  'col-span-full row-start-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-label leading-5 sm:col-span-1 sm:col-end-[-2]';
