import { cn } from '../../styles/cn.js';

export const gradientTextStyles = cn(
  'inline-block bg-clip-text text-transparent [background-size:200%_100%]',
  '[background-image:linear-gradient(110deg,var(--brand),var(--muted-ink),var(--brand-hover),var(--brand))]',
  'motion-safe:[animation:react-bits-gradient_4s_ease-in-out_both]',
  'forced-colors:bg-none forced-colors:text-ink',
);

export const spotlightCardStyles = cn(
  'relative isolate overflow-hidden rounded-2xl border border-line bg-paper',
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:opacity-0 before:transition-opacity before:duration-300 before:content-['']",
  'before:[background:radial-gradient(280px_circle_at_var(--spotlight-x,50%)_var(--spotlight-y,50%),color-mix(in_srgb,var(--brand)_12%,transparent),transparent_75%)]',
  '[@media(hover:hover)]:hover:before:opacity-100 motion-reduce:before:hidden forced-colors:before:hidden',
);

export const gradientAsciiStyles =
  'pointer-events-none absolute inset-0 -z-10 block size-full opacity-70 max-[760px]:opacity-40';

export const dotGridStyles =
  'pointer-events-none absolute inset-0 z-[-2] block size-full forced-colors:hidden';

export const shinyTextStyles = cn(
  'bg-clip-text text-transparent [background-size:250%_100%] [background-position:0%_50%]',
  '[background-image:linear-gradient(110deg,var(--ink)_40%,var(--brand)_50%,var(--ink)_60%)]',
  'motion-safe:[animation:react-bits-shine_1.6s_var(--ease-out)_0.2s_both]',
  'forced-colors:bg-none forced-colors:text-ink',
);

export const starBorderStyles = 'relative isolate overflow-hidden rounded-[14px]';

export const starBorderSurfaceStyles = 'rounded-[14px] border border-line bg-paper';

export const starBorderTopStyles = cn(
  'pointer-events-none absolute inset-x-0 top-0 z-[1] h-px opacity-0 [filter:drop-shadow(0_0_3px_var(--brand))]',
  '[background:linear-gradient(90deg,transparent_30%,var(--brand)_50%,transparent_70%)]',
  'motion-safe:[animation:react-bits-star-top_2.2s_ease-in-out_0.15s_both] forced-colors:hidden',
);

export const starBorderBottomStyles = cn(
  'pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-px opacity-0 [filter:drop-shadow(0_0_3px_var(--brand))]',
  '[background:linear-gradient(90deg,transparent_30%,var(--brand)_50%,transparent_70%)]',
  'motion-safe:[animation:react-bits-star-bottom_2.2s_ease-in-out_0.15s_both] forced-colors:hidden',
);

export const blurTextStyles = 'inline-block';

export const blurTextPieceStyles = 'inline-block max-w-full [overflow-wrap:anywhere]';

export const logoLoopStyles = 'relative min-w-0 overflow-x-clip';

export const logoLoopFadeStyles =
  '[mask-image:linear-gradient(90deg,transparent,var(--mask-solid)_7%,var(--mask-solid)_93%,transparent)] has-[:focus-visible]:[mask-image:none]';

export const logoLoopListStyles = 'm-0 flex shrink-0 list-none items-center p-0';

export const logoLoopWrapStyles = 'min-w-0 shrink flex-wrap gap-y-2';

export const logoLoopItemStyles = 'flex shrink-0 items-center';
