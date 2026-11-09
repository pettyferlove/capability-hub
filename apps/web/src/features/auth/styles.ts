import { cn } from '../../shared/styles/cn.js';

export const authLayoutStyles =
  'grid min-h-dvh grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4 bg-paper p-4 max-[760px]:grid-cols-1 max-[760px]:gap-0 max-[760px]:p-0';

export const authStoryStyles = cn(
  'group/auth-story relative isolate flex min-w-0 flex-col justify-between overflow-hidden rounded-3xl bg-brand-soft p-[clamp(28px,3.5vw,56px)]',
  '[background-image:radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--paper)_65%,transparent),transparent_70%)]',
  'max-[760px]:rounded-none max-[760px]:px-6 max-[760px]:py-7',
);

export const authPitchStyles = cn(
  'relative my-10 w-full max-w-136 self-center [&_h1]:my-6 [&_h1]:text-[clamp(32px,4vw,52px)]',
  '[&_h1]:font-semibold [&_h1]:leading-[1.35] [&_h1]:tracking-[-0.04em]',
  'max-[760px]:mb-0 max-[760px]:mt-8 max-[760px]:max-w-none max-[760px]:[&_h1]:my-3 max-[760px]:[&_h1]:text-[30px]',
);

export const authEyebrowStyles = 'font-mono text-[10px] font-medium tracking-[0.2em] text-brand';

export const authResourcesStyles =
  'mt-8 grid grid-cols-2 gap-3 max-[1000px]:grid-cols-1 max-[760px]:hidden';

export const authResourceStyles = cn(
  'border-brand/15 bg-paper/60 p-4 [box-shadow:0_6px_24px_color-mix(in_srgb,var(--shadow-ink)_3%,transparent)]',
  '[&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_p]:text-xs [&_p]:leading-6 [&_p]:text-muted-ink',
  'max-[1000px]:grid max-[1000px]:grid-cols-[auto_1fr] max-[1000px]:gap-x-4 max-[1000px]:py-4',
  'max-[1000px]:[&_h2]:mb-0 max-[1000px]:[&_p]:col-start-2',
);

export const authResourceIconStyles =
  'mb-4 inline-flex size-10 items-center justify-center rounded-xl border border-brand/10 bg-brand-soft text-brand max-[1000px]:row-span-2 max-[1000px]:mb-0';

export const authLinksStyles =
  'relative flex flex-wrap gap-6 text-xs [&_a]:inline-flex [&_a]:min-h-8 [&_a]:items-center [&_a]:gap-1.5 [&_a]:text-muted-ink [&_a:hover]:text-brand max-[760px]:hidden';

export const authAnimationStyles = cn(
  'hidden min-h-8 items-center gap-1.5 rounded-lg border-0 bg-transparent px-2 text-xs text-muted-ink hover:text-brand',
  'motion-safe:group-has-[[data-background-ready]]/auth-story:inline-flex',
);

export const authFormStyles = cn(
  'flex min-w-0 items-center justify-center px-[clamp(24px,4vw,64px)] py-12',
  'max-[760px]:px-6 max-[760px]:py-9',
);

export const authCardStyles = cn(
  'w-full max-w-96 [&_h2]:mb-3 [&_h2]:text-[28px] [&_h2]:tracking-[-0.035em] max-[760px]:[&_h2]:text-2xl',
  "[&_>_p[class~='group/subtle']]:mb-8 [&_>_p[class~='group/subtle']]:leading-7",
);

export const authWelcomeStyles = 'mb-2 text-sm font-medium text-brand';

export const authSubmitStyles = 'mt-2 min-h-11 w-full justify-center gap-3';

export const authFootStyles =
  'mb-3 mt-7 border-t border-line pt-6 text-xs leading-6 text-muted-ink';
