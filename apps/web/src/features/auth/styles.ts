import { cn } from '../../shared/styles/cn.js';

export const authLayoutStyles =
  'min-h-screen grid grid-cols-[1.05fr_1fr] max-[600px]:grid-cols-[1fr]';

export const authStoryStyles = cn(
  'group/auth-story relative flex flex-col justify-between bg-brand-soft pt-[45px] pr-[55px]',
  "pb-[45px] pl-[55px] overflow-hidden after:[content:''] after:absolute after:w-112.5 after:h-112.5",
  'after:border after:border-solid after:border-[color:color-mix(in_srgb,_var(--brand),_transparent_85%)] after:rounded-[50%]',
  'after:bottom-[-200px] after:right-[-150px]',
  'after:[box-shadow:0_0_0_45px_color-mix(in_srgb,_var(--brand),_transparent_98%),_0_0_0_90px_color-mix(in_srgb,_var(--brand),_transparent_98%)]',
  'after:pointer-events-none max-[850px]:pt-[35px] max-[850px]:pr-[35px] max-[850px]:pb-[35px]',
  'max-[850px]:pl-[35px] max-[600px]:pt-[25px] max-[600px]:pr-[25px] max-[600px]:pb-7',
  "max-[600px]:pl-[25px] max-[600px]:[&_[class~='group/brand']]:text-[length:17px]",
);

export const authPitchStyles = cn(
  'mt-15 mr-0 mb-15 ml-0 relative z-[1] [&_h1]:text-[length:49px]',
  '[&_h1]:leading-[1.4] [&_h1]:tracking-[-1.8px] [&_h1]:[font-weight:650] [&_h1]:mt-5 [&_h1]:mr-0',
  '[&_h1]:mb-5 [&_h1]:ml-0 [&_h1_span]:text-brand [&_>_p]:text-muted-ink [&_>_p]:leading-[1.95]',
  '[&_>_p]:text-[length:15px] max-[850px]:[&_h1]:text-[length:39px] max-[600px]:mt-8',
  'max-[600px]:mr-0 max-[600px]:mb-0 max-[600px]:ml-0 max-[600px]:[&_h1]:text-[length:31px]',
  'max-[600px]:[&_h1]:leading-[1.4] max-[600px]:[&_h1]:mt-3 max-[600px]:[&_h1]:mr-0',
  'max-[600px]:[&_h1]:mb-3 max-[600px]:[&_h1]:ml-0 max-[600px]:[&_h1]:tracking-[-0.7px]',
  'max-[600px]:[&_>_p]:text-[length:12px]',
);

export const authLinksStyles =
  'flex flex-wrap gap-5 text-[length:12px] text-muted-ink [&_a:hover]:text-brand max-[600px]:hidden';

export const authFormStyles = cn(
  'flex items-center justify-center pt-10 pr-[55px] pb-10 pl-[55px] bg-paper max-[850px]:pt-[35px]',
  'max-[850px]:pr-[35px] max-[850px]:pb-[35px] max-[850px]:pl-[35px] max-[600px]:pt-7.5',
  'max-[600px]:pr-[25px] max-[600px]:pb-10 max-[600px]:pl-[25px]',
);

export const authCardStyles = cn(
  'group/auth-card w-full max-w-87.5 [&_h2]:text-[length:27px] [&_h2]:mt-0 [&_h2]:mb-[9px]',
  '[&_h2]:tracking-[-0.7px] max-[600px]:max-w-110 max-[600px]:[&_h2]:text-[length:25px]',
  "[&_>_p[class~='group/subtle']]:text-[length:12px] [&_>_p[class~='group/subtle']]:leading-[1.8]",
  "[&_>_p[class~='group/subtle']]:mb-[25px]",
);

export const authFootStyles =
  'text-[length:12px] text-muted-ink leading-[1.9] mt-[25px] pt-5 border-t [border-top-style:solid] border-t-[color:var(--line)]';
