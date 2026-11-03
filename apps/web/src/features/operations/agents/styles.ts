import { cn } from '../../../shared/styles/cn.js';
import { segmentedStyles } from '../../../shared/styles/recipes.js';

export const agentViewSwitchStyles = cn(
  segmentedStyles,
  'inline-flex max-w-full flex-wrap items-center gap-0.5 rounded-lg p-0.5',
);

export const agentViewLinkStyles = cn(
  'inline-flex min-h-7 items-center justify-center rounded-md px-2.5 text-label leading-5 font-medium whitespace-nowrap text-muted-ink',
  'hover:text-ink aria-[current=page]:text-brand focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand',
  'transition-colors motion-reduce:transition-none pointer-coarse:min-h-11',
);

export const workspaceStyles = cn(
  'relative flex h-[clamp(520px,calc(100dvh_-_240px),980px)] min-h-0 shrink-0 overflow-hidden rounded-[22px] border border-[color:var(--line)] bg-paper',
  '[box-shadow:0_1px_0_var(--highlight)_inset,0_12px_48px_color-mix(in_srgb,_var(--shadow-ink)_6%,_transparent)]',
);
export const taskColumnStyles = 'mx-auto w-full max-w-200 px-5 sm:px-8';
export const dotFieldStyles = cn(
  'pointer-events-none absolute inset-x-0 top-0 -z-10 h-56',
  '[background-image:radial-gradient(var(--line)_1px,_transparent_1.5px)] [background-size:14px_14px]',
  '[mask-image:radial-gradient(ellipse_70%_100%_at_85%_0%,_var(--mask-solid),_transparent_75%)]',
);
export const operationStyles = cn(
  'group/operation relative flex min-w-0 flex-1 items-start gap-3 rounded-2xl border border-[color:var(--line)] bg-paper p-3.5 text-left',
  'transition-[background-color,border-color,box-shadow] hover:border-brand/35 hover:bg-brand-soft/25 disabled:opacity-60',
  'aria-pressed:border-brand/60 aria-pressed:bg-brand-soft/45',
  'aria-pressed:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--brand)_10%,_transparent)]',
);
export const composerStyles = cn(
  'overflow-hidden rounded-2xl border border-[color:var(--line)] bg-paper transition-[border-color,box-shadow]',
  '[box-shadow:0_2px_12px_color-mix(in_srgb,_var(--shadow-ink)_4%,_transparent)]',
  'focus-within:border-brand/50 focus-within:[box-shadow:0_0_0_4px_var(--brand-soft)]',
  '[&_textarea]:border-0 [&_textarea]:bg-transparent [&_textarea]:p-0 [&_textarea]:font-normal [&_textarea]:leading-relaxed [&_textarea:focus-visible]:outline-none',
);
export const composerToolbarStyles =
  'flex flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-[color:var(--line)] bg-page/50 px-3 py-2.5 sm:px-4';
export const modelSelectStyles =
  'w-full min-w-0 [&>button]:h-9 [&>button]:min-h-9 [&>button]:py-0 [&>button]:leading-[1.5] sm:w-60';
export const chipStyles =
  'inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-paper px-3 py-1.5 text-caption text-muted-ink transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand disabled:opacity-60';

export const operationsAgentListStyles = cn(
  'mt-4 [&_li]:grid [&_li]:grid-cols-[minmax(9rem,1fr)_2fr_auto] [&_li]:items-center',
  '[&_li]:gap-3 [&_li]:border-t [&_li]:border-line [&_li]:py-3',
  '[&_li]:text-label [&_strong]:font-medium [&_small]:text-caption [&_small]:text-muted-ink',
  'max-[760px]:[&_li]:grid-cols-1 max-[760px]:[&_li]:gap-1.5',
);
