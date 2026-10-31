import { cn } from '../../shared/styles/cn.js';

export const targetEditorStyles = 'flex flex-col gap-[17px] pt-4.5 pr-4.5 pb-4.5 pl-4.5';

export const sourceCardStyles = cn(
  "group/source-card flex flex-col [&_[class~='group/source-actions']]:mt-auto",
  "[&_[class~='group/source-actions']]:pt-5",
);

export const sourceTopStyles = cn(
  'group/source-top flex items-center gap-2.5 [&_>_div]:flex-1 [&_>_div]:min-w-0',
  '[&_h3]:text-[length:12px] [&_h3]:[overflow-wrap:anywhere] max-[600px]:flex-wrap',
  'max-[600px]:[&_h3]:text-[length:12px] max-[600px]:[&_>_div]:min-w-35',
  "[&_[class~='group/mono']]:flex [&_[class~='group/mono']]:items-center",
  "[&_[class~='group/mono']]:gap-1 [&_[class~='group/mono']]:mt-[5px]",
  "[&_[class~='group/mono']]:text-[length:11px] [&_[class~='group/mono']]:min-w-0",
  "[&_[class~='group/mono']]:[overflow-wrap:anywhere] [&_[class~='group/mono']_>_svg]:shrink-0",
  "[&_>_[class~='group/tag']]:shrink-0",
);

export const sourceIconStyles = cn(
  'flex items-center justify-center shrink-0 pt-2.5 pr-2.5 pb-2.5 pl-2.5 rounded-[11px] bg-brand-soft',
  'text-brand',
);

export const sourceTargetsStyles = cn(
  'group/source-targets mt-5 mr-0 mb-5 ml-0 border-t [border-top-style:solid] border-t-[color:var(--line)] [&_>_div]:flex',
  '[&_>_div]:items-center [&_>_div]:gap-2 [&_>_div]:pt-3 [&_>_div]:pr-0 [&_>_div]:pb-3',
  '[&_>_div]:pl-0 [&_>_div]:border-b [&_>_div]:[border-bottom-style:solid] [&_>_div]:border-b-[color:var(--line)] [&_>_div_>_div]:flex-1',
  '[&_>_div_>_div]:min-w-0 [&_strong]:text-body [&_strong]:[overflow-wrap:anywhere] [&_code]:block',
  '[&_code]:text-caption [&_code]:[overflow-wrap:anywhere] [&_code]:text-muted-ink',
  '[&_small]:text-caption [&_small]:text-muted-ink [&_small]:whitespace-nowrap [&_small]:shrink-0',
  "[&_>_div_>_[class~='group/tag']]:shrink-0",
);

export const sourceStatusStyles =
  'flex items-center justify-between text-caption text-muted-ink gap-2 flex-wrap';

export const breakAllStyles = '[word-break:break-all]';

export const jobTargetStyles = cn(
  'group/job-target flex items-center gap-2.5 text-[length:11px] pt-2.5 pr-0 pb-2.5 pl-0 flex-wrap',
  '[&_>_span:nth-child(2)]:[flex:1_1_140px] [&_>_span:nth-child(2)]:min-w-0',
  "[&_>_span:nth-child(2)]:[overflow-wrap:anywhere] [&_>_[class~='group/text-btn']]:ml-auto",
  "[&_>_[class~='group/text-btn']]:shrink-0",
);
