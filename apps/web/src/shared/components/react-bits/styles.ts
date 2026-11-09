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
