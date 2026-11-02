import { cn } from '../../shared/styles/cn.js';

export const agentDockStyles =
  '@container/dock pointer-events-none fixed w-[800px] bottom-[max(16px,env(safe-area-inset-bottom))] right-4 z-[75] flex max-w-[calc(100%_-_32px)] flex-col items-end gap-2';
export const stackStyles = 'flex min-w-0 flex-col gap-4';
export const fillStyles = 'flex min-h-0 min-w-0 flex-1 flex-col';
export const scrollStyles =
  'min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:thin] [scrollbar-gutter:stable]';
export const eyebrowStyles = 'text-caption font-semibold tracking-[0.16em] text-brand uppercase';
export const iconTileStyles =
  'inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand/15 bg-brand-soft text-brand';
export const fieldStyles = 'flex min-w-0 flex-col gap-2 text-body font-medium';
export const controlStyles = cn(
  'w-full min-w-0 rounded-xl border border-[color:var(--line)] bg-paper px-3 py-2.5 text-ink',
  'outline-none transition-colors placeholder:text-muted-ink/70 focus:border-brand disabled:opacity-50',
  'max-h-52 resize-y [scrollbar-width:thin]',
);
export const disclosureStyles = cn(
  'group/disclosure rounded-xl border border-[color:var(--line)] bg-paper',
  '[&>summary]:flex [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-2 [&>summary]:px-4 [&>summary]:py-3',
  '[&>summary::-webkit-details-marker]:hidden [&>summary]:text-muted-ink [&>summary:hover]:text-ink',
  '[&[open]>summary]:border-b [&[open]>summary]:border-[color:var(--line)] [&[open]>summary]:text-ink',
);
export const disclosureChevronStyles =
  'ml-auto shrink-0 transition-transform group-open/disclosure:rotate-180 motion-reduce:transition-none';
export const codeStyles =
  'max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-page p-4 font-mono text-caption text-ink';
export const messageStyles = cn(
  'min-w-0 break-words text-body leading-[1.9] text-ink [overflow-wrap:anywhere] [&>:first-child]:mt-0 [&>:last-child]:mb-0',
  '[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1',
  '[&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-section [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-base [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-body [&_h3]:font-semibold',
  '[&_pre]:my-4 [&_pre]:overflow-auto [&_pre]:whitespace-pre [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-[color:var(--line)] [&_pre]:bg-page [&_pre]:p-4',
  '[&_code]:rounded [&_code]:bg-brand-soft/60 [&_code]:px-1 [&_code]:py-0.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:my-4 [&_table]:block [&_table]:overflow-auto [&_th]:border [&_td]:border [&_th]:border-[color:var(--line)] [&_td]:border-[color:var(--line)] [&_th]:bg-page [&_th]:p-2.5 [&_td]:p-2.5 [&_th]:text-left',
  '[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-brand/40 [&_blockquote]:pl-4 [&_blockquote]:text-muted-ink [&_hr]:my-5 [&_hr]:border-[color:var(--line)]',
);
export const readingWidthStyles =
  'mx-auto w-full min-w-0 max-w-220 px-4 py-4 @min-[640px]/execution:px-8 @min-[640px]/execution:py-6';
export const statusStyles =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-caption font-medium';
export const statusToneStyles = {
  queued: 'bg-page text-muted-ink ring-1 ring-inset ring-[color:var(--line)]',
  running: 'bg-brand-soft text-brand',
  waiting_input: 'bg-warning-soft text-warning',
  succeeded: 'bg-success-soft text-success',
  failed: 'bg-danger-soft text-danger',
  cancelled: 'bg-page text-muted-ink ring-1 ring-inset ring-[color:var(--line)]',
  timed_out: 'bg-danger-soft text-danger',
};
export const statusDotStyles = {
  queued: 'bg-muted-ink/50',
  running: 'bg-brand',
  waiting_input: 'bg-warning',
  succeeded: 'bg-success',
  failed: 'bg-danger',
  cancelled: 'bg-muted-ink/40',
  timed_out: 'bg-danger',
};
export const resultCardStyles =
  'overflow-hidden rounded-2xl border border-[color:var(--line)] bg-paper';
export const metricStyles =
  'flex min-w-0 flex-col gap-1 rounded-xl border border-[color:var(--line)] bg-page/50 p-4';

export const activityTrackStyles =
  'flex min-w-0 flex-col gap-4 [&>div]:relative [&>div+div]:before:pointer-events-none [&>div+div]:before:absolute [&>div+div]:before:-top-4 [&>div+div]:before:left-5 [&>div+div]:before:h-4 [&>div+div]:before:w-px [&>div+div]:before:bg-[color:var(--line)]';
export const agentCardStyles =
  'relative min-w-0 overflow-hidden rounded-2xl border bg-paper [box-shadow:0_2px_8px_color-mix(in_srgb,_var(--shadow-ink)_3%,_transparent)]';
export const agentToneStyles = {
  assistant: {
    border: 'border-brand/20',
    header: 'bg-brand-soft/35',
    mark: 'bg-brand-soft text-brand',
    rail: 'bg-brand',
  },
  planner: {
    border: 'border-info/30',
    header: 'bg-info-soft/50',
    mark: 'bg-info-soft text-info',
    rail: 'bg-info',
  },
  editor: {
    border: 'border-success/30',
    header: 'bg-success-soft/50',
    mark: 'bg-success-soft text-success',
    rail: 'bg-success',
  },
  reviewer: {
    border: 'border-warning/35',
    header: 'bg-warning-soft/50',
    mark: 'bg-warning-soft text-warning',
    rail: 'bg-warning',
  },
};
export const toolGroupStyles =
  'overflow-hidden rounded-2xl border border-[color:var(--line)] bg-paper [box-shadow:0_1px_3px_color-mix(in_srgb,_var(--shadow-ink)_3%,_transparent)]';
export const toolCardStyles = cn(
  'group/disclosure',
  '[&>summary]:flex [&>summary]:cursor-pointer [&>summary]:list-none [&>summary]:items-center [&>summary]:gap-3 [&>summary]:px-4 [&>summary]:py-2.5',
  '[&>summary::-webkit-details-marker]:hidden [&>summary:hover]:bg-page/60 [&>summary]:transition-colors',
  '[&[open]>summary]:bg-page/40',
);
export const interactionCardStyles =
  'relative overflow-hidden rounded-2xl border border-warning/40 bg-paper [box-shadow:0_0_0_3px_var(--warning-soft)]';
