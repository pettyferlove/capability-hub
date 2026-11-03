import { cn } from '../shared/styles/cn.js';

export const bootErrorStyles =
  'max-w-150 pt-12.5 pr-5 pb-12.5 pl-5 mt-auto mr-auto mb-auto ml-auto';

export const skipLinkStyles = cn(
  'fixed top-[-100px] left-5 z-[100] bg-brand text-on-brand pt-2.5 pr-5 pb-2.5 pl-5 rounded-[10px]',
  '[&:focus]:top-2.5',
);

export const mainShellStyles = cn(
  'max-w-310 pt-[var(--page-inset)] pr-7 pb-17.5 pl-7 mt-0 mr-auto mb-0 ml-auto',
  'min-h-[calc(100vh_-_150px)] min-[1400px]:pl-7 min-[1400px]:pr-7 max-[850px]:pt-0',
  'max-[850px]:pr-5.5 max-[850px]:pb-12.5 max-[850px]:pl-5.5 max-[600px]:pt-0 max-[600px]:pr-4',
  'max-[600px]:pb-10 max-[600px]:pl-4',
);

export const appFooterStyles = cn(
  'max-w-296 mt-0 mr-auto mb-0 ml-auto pt-5.5 pr-0 pb-5.5 pl-0 border-t [border-top-style:solid] border-t-[color:var(--line)]',
  'flex items-center justify-between flex-wrap gap-4 text-muted-ink text-[length:12px] [&_nav]:flex',
  '[&_nav]:flex-wrap [&_nav]:gap-5 [&_a:hover]:text-brand max-[850px]:mt-0 max-[850px]:mr-5.5',
  'max-[850px]:mb-0 max-[850px]:ml-5.5 max-[600px]:mt-0 max-[600px]:mr-4 max-[600px]:mb-0',
  'max-[600px]:ml-4',
);

export const appHeaderStyles = cn(
  'group/app-header sticky top-0 z-[50]',
  '[background:color-mix(in_srgb,_var(--page)_76%,_transparent)]',
  'border-b [border-bottom-style:solid] border-b-[color:color-mix(in_srgb,_var(--line)_80%,_transparent)]',
  '[backdrop-filter:blur(20px)]',
  '[transition:border-color_150ms_ease,_box-shadow_150ms_ease] [&_nav]:flex [&_nav]:gap-[5px]',
  '[&_nav_>_a]:flex [&_nav_>_a]:items-center [&_nav_>_a]:gap-[7px] [&_nav_>_a]:text-muted-ink',
  '[&_nav_>_a]:pt-2 [&_nav_>_a]:pr-[13px] [&_nav_>_a]:pb-2 [&_nav_>_a]:pl-[13px]',
  '[&_nav_>_a]:text-[length:12px] [&_nav_>_a]:whitespace-nowrap [&_nav_>_a]:rounded-[9px]',
  "[&_nav_>_a[class~='group/active']]:bg-brand-soft [&_nav_>_a[class~='group/active']]:text-brand",
  "[&_nav_>_a[class~='group/active']]:font-semibold max-[850px]:[&_nav]:[order:3]",
  'max-[850px]:[&_nav]:w-full max-[850px]:[&_nav]:border-t max-[850px]:[&_nav]:[border-top-style:solid] max-[850px]:[&_nav]:border-t-[color:var(--line)]',
  'max-[850px]:[&_nav]:pt-2.5 max-[850px]:[&_nav]:justify-center max-[850px]:[&_nav_>_a]:pt-[7px]',
  'max-[850px]:[&_nav_>_a]:pr-[15px] max-[850px]:[&_nav_>_a]:pb-[7px]',
  'max-[850px]:[&_nav_>_a]:pl-[15px] max-[600px]:[&_nav]:justify-start max-[600px]:[&_nav]:gap-[5px]',
  'max-[600px]:[&_nav]:overflow-x-auto max-[600px]:[&_nav]:flex-nowrap',
  'max-[600px]:[&_nav_>_a]:text-[length:12px] max-[600px]:[&_nav_>_a]:pt-[7px]',
  'max-[600px]:[&_nav_>_a]:pr-2.5 max-[600px]:[&_nav_>_a]:pb-[7px] max-[600px]:[&_nav_>_a]:pl-2.5',
  'max-[600px]:[&_nav_>_a]:gap-1.5 max-[600px]:[&_nav_>_a]:shrink-0',
  "[&[data-scrolled='true']]:border-b-[color:var(--line)]",
  "[&[data-scrolled='true']]:[box-shadow:0_4px_18px_color-mix(in_srgb,_var(--shadow-ink)_6%,_transparent)]",
  '[@media_(prefers-reduced-transparency:_reduce)]:bg-page',
  '[@media_(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]',
  "motion-reduce:[transition:none] [&_[class~='group/brand']]:[grid-column:1]",
  "[&_[class~='group/brand']]:[grid-row:1] [&_[class~='group/brand']]:gap-2.5",
  "[&_[class~='group/brand']]:text-[length:17px] [&_[class~='group/brand']]:tracking-[-0.4px]",
  "[&_[class~='group/brand']_small]:text-[length:11px]",
  "[&_[class~='group/brand']_small]:tracking-[1.5px] [&_[class~='group/brand']_small]:mt-[3px]",
  "[&_[class~='group/header-actions']_>_[class~='group/btn']]:shrink-0",
  "[&_[class~='group/header-actions']_>_[class~='group/btn']]:min-h-9.5",
  "[&_[class~='group/header-actions']_>_[class~='group/btn']]:pt-0",
  "[&_[class~='group/header-actions']_>_[class~='group/btn']]:pr-3",
  "[&_[class~='group/header-actions']_>_[class~='group/btn']]:pb-0",
  "[&_[class~='group/header-actions']_>_[class~='group/btn']]:pl-3",
  "[&_[class~='group/header-actions']_>_[class~='group/btn']]:rounded-[12px]",
  "[&_[class~='group/header-actions']_>_[class~='group/btn']]:text-[length:12px]",
);

export const headerProgressStyles =
  'pointer-events-none absolute inset-x-0 -bottom-px h-0.5 origin-left bg-brand/65 [transform:scaleX(0)] motion-reduce:hidden';

export const headerInnerStyles = cn(
  'max-w-310 mt-auto mr-auto mb-auto ml-auto min-h-[79px] pt-0 pr-7 pb-0 pl-7 flex items-center',
  'gap-9.5 max-[1100px]:gap-5 max-[850px]:gap-4.5 max-[850px]:pt-3.5 max-[850px]:pr-5.5',
  'max-[850px]:pb-3.5 max-[850px]:pl-5.5 max-[850px]:flex-wrap max-[600px]:pt-3 max-[600px]:pr-4',
  "max-[600px]:pb-3 max-[600px]:pl-4 max-[600px]:gap-3 [[class~='group/app-header']_&]:grid",
  "[[class~='group/app-header']_&]:grid-cols-[auto_auto_minmax(0,_1fr)]",
  "[[class~='group/app-header']_&]:items-center [[class~='group/app-header']_&]:gap-6",
  "[[class~='group/app-header']_&]:min-h-20 [[class~='group/app-header']_&]:pt-0",
  "[[class~='group/app-header']_&]:pr-7 [[class~='group/app-header']_&]:pb-0",
  "[[class~='group/app-header']_&]:pl-7 max-[1100px]:[[class~='group/app-header']_&]:gap-4",
  "max-[1100px]:[[class~='group/app-header']_&]:px-5",
  "max-[850px]:[[class~='group/app-header']_&]:px-4",
  "max-[600px]:[[class~='group/app-header']_&]:gap-2",
  "max-[600px]:[[class~='group/app-header']_&]:min-h-16",
  "max-[600px]:[[class~='group/app-header']_&]:pt-2.5",
  "max-[600px]:[[class~='group/app-header']_&]:pr-3",
  "max-[600px]:[[class~='group/app-header']_&]:pb-2.5",
  "max-[600px]:[[class~='group/app-header']_&]:pl-3 max-[380px]:[[class~='group/app-header']_&]:px-2",
  "max-[380px]:[[class~='group/app-header']_&]:gap-1.5",
  "max-[480px]:[[class~='group/app-header']_&]:grid-cols-[auto_minmax(0,_1fr)]",
);

export const brandMarkStyles = cn(
  'bg-paper border border-solid border-[color:var(--line)] rounded-[12px] pt-1.5 pr-1.5 pb-1.5 pl-1.5',
  '[box-shadow:var(--shadow)] max-[600px]:pt-[5px] max-[600px]:pr-[5px] max-[600px]:pb-[5px]',
  "max-[600px]:pl-[5px] [[class~='group/app-header']_&]:flex [[class~='group/app-header']_&]:pt-1.5",
  "[[class~='group/app-header']_&]:pr-1.5 [[class~='group/app-header']_&]:pb-1.5",
  "[[class~='group/app-header']_&]:pl-1.5",
  "[[class~='group/app-header']_&]:border-t-[color:color-mix(in_srgb,_var(--brand)_14%,_var(--line))]",
  "[[class~='group/app-header']_&]:border-r-[color:color-mix(in_srgb,_var(--brand)_14%,_var(--line))]",
  "[[class~='group/app-header']_&]:border-b-[color:color-mix(in_srgb,_var(--brand)_14%,_var(--line))]",
  "[[class~='group/app-header']_&]:border-l-[color:color-mix(in_srgb,_var(--brand)_14%,_var(--line))]",
  "[[class~='group/app-header']_&]:bg-paper",
  "[[class~='group/app-header']_&]:[box-shadow:0_2px_8px_color-mix(in_srgb,_var(--ink)_5%,_transparent)]",
  "[[class~='group/app-header']_&]:[transition:border-color_150ms_ease]",
  "[[class~='group/app-header']_[class~='group/brand']:hover_&]:border-t-[color:color-mix(in_srgb,_var(--brand)_45%,_var(--line))]",
  "[[class~='group/app-header']_[class~='group/brand']:hover_&]:border-r-[color:color-mix(in_srgb,_var(--brand)_45%,_var(--line))]",
  "[[class~='group/app-header']_[class~='group/brand']:hover_&]:border-b-[color:color-mix(in_srgb,_var(--brand)_45%,_var(--line))]",
  "[[class~='group/app-header']_[class~='group/brand']:hover_&]:border-l-[color:color-mix(in_srgb,_var(--brand)_45%,_var(--line))]",
  "max-[600px]:[[class~='group/app-header']_&]:pt-1 max-[600px]:[[class~='group/app-header']_&]:pr-1",
  "max-[600px]:[[class~='group/app-header']_&]:pb-1 max-[600px]:[[class~='group/app-header']_&]:pl-1",
  "max-[380px]:[[class~='group/app-header']_&]:pt-0.5",
  "max-[380px]:[[class~='group/app-header']_&]:pr-0.5",
  "max-[380px]:[[class~='group/app-header']_&]:pb-0.5",
  "max-[380px]:[[class~='group/app-header']_&]:pl-0.5",
  "motion-reduce:[[class~='group/app-header']_&]:[transition:none]",
);

export const brandCopyStyles = cn(
  "max-[760px]:[[class~='group/app-header']_&]:absolute",
  "max-[760px]:[[class~='group/app-header']_&]:w-px max-[760px]:[[class~='group/app-header']_&]:h-px",
  "max-[760px]:[[class~='group/app-header']_&]:overflow-hidden",
  "max-[760px]:[[class~='group/app-header']_&]:[clip-path:inset(50%)]",
  "max-[760px]:[[class~='group/app-header']_&]:whitespace-nowrap",
);

export const headerNavStyles = cn(
  "[[class~='group/app-header']_&]:[grid-column:2] [[class~='group/app-header']_&]:[grid-row:1]",
  "[[class~='group/app-header']_&]:[order:0] [[class~='group/app-header']_&]:w-[max-content]",
  "[[class~='group/app-header']_&]:min-w-0 [[class~='group/app-header']_&]:max-w-full",
  "[[class~='group/app-header']_&]:gap-[3px] [[class~='group/app-header']_&]:pt-1",
  "[[class~='group/app-header']_&]:pr-1 [[class~='group/app-header']_&]:pb-1",
  "[[class~='group/app-header']_&]:pl-1",
  "[[class~='group/app-header']_&]:border [[class~='group/app-header']_&]:border-solid [[class~='group/app-header']_&]:border-[color:color-mix(in_srgb,_var(--line)_75%,_transparent)]",
  "[[class~='group/app-header']_&]:rounded-[14px]",
  "[[class~='group/app-header']_&]:[background:color-mix(in_srgb,_var(--paper)_65%,_transparent)]",
  "[[class~='group/app-header']_&_>_a]:relative [[class~='group/app-header']_&_>_a]:justify-center",
  "[[class~='group/app-header']_&_>_a]:min-h-9 [[class~='group/app-header']_&_>_a]:pt-[7px]",
  "[[class~='group/app-header']_&_>_a]:pr-[11px] [[class~='group/app-header']_&_>_a]:pb-[7px]",
  "[[class~='group/app-header']_&_>_a]:pl-[11px] [[class~='group/app-header']_&_>_a]:rounded-[10px]",
  "[[class~='group/app-header']_&_>_a]:text-[length:12px]",
  "[[class~='group/app-header']_&_>_a]:[transition:background-color_150ms_ease,_color_150ms_ease,_box-shadow_150ms_ease]",
  "[[class~='group/app-header']_&_>_a]:font-medium",
  "[[class~='group/app-header']_&_>_a:hover]:[background:color-mix(in_srgb,_var(--brand-soft)_70%,_transparent)]",
  "[[class~='group/app-header']_&_>_a:hover]:text-brand",
  "[[class~='group/app-header']_&_>_a[class~='group/active']]:bg-brand-soft",
  "[[class~='group/app-header']_&_>_a[class~='group/active']]:text-brand",
  "[[class~='group/app-header']_&_>_a[class~='group/active']]:[box-shadow:0_1px_3px_color-mix(in_srgb,_var(--ink)_6%,_transparent)]",
  "[[class~='group/app-header']_&_>_a[class~='group/active']]:font-medium",
  "[[class~='group/app-header']_&_>_a:focus-visible]:[outline-offset:1px]",
  "max-[600px]:[[class~='group/app-header']_&_>_a]:shrink-0",
  "max-[600px]:[[class~='group/app-header']_&_>_a]:w-9",
  "max-[600px]:[[class~='group/app-header']_&_>_a]:pt-0",
  "max-[600px]:[[class~='group/app-header']_&_>_a]:pr-0",
  "max-[600px]:[[class~='group/app-header']_&_>_a]:pb-0",
  "max-[600px]:[[class~='group/app-header']_&_>_a]:pl-0",
  "max-[600px]:[[class~='group/app-header']_&_>_a]:gap-0",
  "max-[380px]:[[class~='group/app-header']_&_>_a]:w-8",
  "motion-reduce:[[class~='group/app-header']_&_>_a]:[transition:none]",
  "max-[480px]:[[class~='group/app-header']_&]:[grid-column:1_/_-1]",
  "max-[480px]:[[class~='group/app-header']_&]:[grid-row:2]",
  "max-[480px]:[[class~='group/app-header']_&]:w-full",
  "max-[480px]:[[class~='group/app-header']_&_>_a]:flex-1",
);

export const headerNavLabelStyles = cn(
  "max-[600px]:[[class~='group/app-header']_&]:absolute",
  "max-[600px]:[[class~='group/app-header']_&]:w-px max-[600px]:[[class~='group/app-header']_&]:h-px",
  "max-[600px]:[[class~='group/app-header']_&]:overflow-hidden",
  "max-[600px]:[[class~='group/app-header']_&]:[clip-path:inset(50%)]",
  "max-[600px]:[[class~='group/app-header']_&]:whitespace-nowrap",
);

export const navCountStyles = cn(
  'text-[length:11px] pt-0 pr-[5px] pb-0 pl-[5px] rounded-[5px] bg-brand text-on-brand',
  "[[class~='group/app-header']_&]:rounded-[6px] [[class~='group/app-header']_&]:tabular-nums",
  "max-[600px]:[[class~='group/app-header']_&]:absolute",
  "max-[600px]:[[class~='group/app-header']_&]:top-0",
  "max-[600px]:[[class~='group/app-header']_&]:right-[-2px]",
  "max-[600px]:[[class~='group/app-header']_&]:pt-0",
  "max-[600px]:[[class~='group/app-header']_&]:pr-[3px]",
  "max-[600px]:[[class~='group/app-header']_&]:pb-0",
  "max-[600px]:[[class~='group/app-header']_&]:pl-[3px]",
  "max-[600px]:[[class~='group/app-header']_&]:text-[length:9px]",
);

export const headerActionsStyles = cn(
  'group/header-actions ml-auto flex items-center gap-3.5 max-[850px]:gap-2.5 max-[600px]:gap-1.5',
  "[[class~='group/app-header']_&]:[grid-column:3] [[class~='group/app-header']_&]:[grid-row:1]",
  "[[class~='group/app-header']_&]:w-full [[class~='group/app-header']_&]:min-w-0",
  "[[class~='group/app-header']_&]:ml-0 [[class~='group/app-header']_&]:justify-end",
  "[[class~='group/app-header']_&]:gap-2.5 max-[600px]:[[class~='group/app-header']_&]:gap-2",
  "max-[380px]:[[class~='group/app-header']_&]:gap-1.5",
  "max-[480px]:[[class~='group/app-header']_&]:[grid-column:2]",
);

export const searchTriggerStyles = cn(
  'group/search-trigger flex items-center gap-[9px] text-[length:12px]',
  'border border-solid border-[color:var(--line)] bg-paper text-muted-ink pt-[7px] pr-2.5 pb-[7px] pl-2.5',
  'rounded-[9px] [&_kbd]:text-[length:11px] [&_kbd]:border-l [&_kbd]:[border-left-style:solid] [&_kbd]:border-l-[color:var(--line)]',
  '[&_kbd]:pl-[7px] max-[1100px]:[&_>_span]:hidden max-[600px]:pt-[7px] max-[600px]:pr-[7px]',
  'max-[600px]:pb-[7px] max-[600px]:pl-[7px] max-[600px]:[&_kbd]:hidden',
  "[[class~='group/app-header']_&]:[container:header-search_/_inline-size]",
  "[[class~='group/app-header']_&]:flex-1",
  "[[class~='group/app-header']_&]:w-[clamp(220px,_25vw,_360px)]",
  "[[class~='group/app-header']_&]:max-w-90 [[class~='group/app-header']_&]:min-w-11",
  "[[class~='group/app-header']_&]:h-10 [[class~='group/app-header']_&]:pt-0",
  "[[class~='group/app-header']_&]:pr-3 [[class~='group/app-header']_&]:pb-0",
  "[[class~='group/app-header']_&]:pl-3 [[class~='group/app-header']_&]:gap-2.5",
  "[[class~='group/app-header']_&]:rounded-[12px]",
  "[[class~='group/app-header']_&]:[background:color-mix(in_srgb,_var(--paper)_60%,_transparent)]",
  "[[class~='group/app-header']_&]:text-[length:12px] [[class~='group/app-header']_&]:font-normal",
  "[[class~='group/app-header']_&]:[transition:border-color_150ms_ease,_background-color_150ms_ease]",
  "[[class~='group/app-header']_&_>_svg]:shrink-0 [[class~='group/app-header']_&_>_svg]:text-brand",
  "[[class~='group/app-header']_&_kbd]:inline-flex [[class~='group/app-header']_&_kbd]:items-center",
  "[[class~='group/app-header']_&_kbd]:justify-center [[class~='group/app-header']_&_kbd]:gap-[3px]",
  "[[class~='group/app-header']_&_kbd]:min-h-5.5 [[class~='group/app-header']_&_kbd]:pt-[3px]",
  "[[class~='group/app-header']_&_kbd]:pr-1.5 [[class~='group/app-header']_&_kbd]:pb-[3px]",
  "[[class~='group/app-header']_&_kbd]:pl-1.5",
  "[[class~='group/app-header']_&_kbd]:border [[class~='group/app-header']_&_kbd]:border-solid [[class~='group/app-header']_&_kbd]:border-[color:var(--line)]",
  "[[class~='group/app-header']_&_kbd]:rounded-[6px] [[class~='group/app-header']_&_kbd]:bg-page",
  "[[class~='group/app-header']_&_kbd]:text-[length:11px]",
  "[[class~='group/app-header']_&_kbd]:leading-[1] [[class~='group/app-header']_&_kbd]:shrink-0",
  "[@container_header-search_(max-width:_220px)]:[[class~='group/app-header']_&_kbd]:hidden",
  "max-[380px]:[[class~='group/app-header']_&]:min-w-9",
  "max-[380px]:[[class~='group/app-header']_&]:pt-0 max-[380px]:[[class~='group/app-header']_&]:pr-2",
  "max-[380px]:[[class~='group/app-header']_&]:pb-0 max-[380px]:[[class~='group/app-header']_&]:pl-2",
  "motion-reduce:[[class~='group/app-header']_&]:[transition:none]",
  '[&[data-focus-visible]]:outline-muted-ink',
);

export const headerSearchCopyStyles = cn(
  "[[class~='group/app-header']_[class~='group/search-trigger']_>_&]:block",
  "[[class~='group/app-header']_[class~='group/search-trigger']_>_&]:flex-1",
  "[[class~='group/app-header']_[class~='group/search-trigger']_>_&]:min-w-0",
  "[[class~='group/app-header']_[class~='group/search-trigger']_>_&]:text-left",
  "[[class~='group/app-header']_[class~='group/search-trigger']_>_&]:whitespace-nowrap",
  "[[class~='group/app-header']_[class~='group/search-trigger']_>_&]:overflow-hidden",
  "[[class~='group/app-header']_[class~='group/search-trigger']_>_&]:text-ellipsis",
  "[@container_header-search_(max-width:_80px)]:[[class~='group/app-header']_[class~='group/search-trigger']_>_&]:hidden",
);

export const headerSearchWideStyles = '[@container_header-search_(max-width:_180px)]:hidden';

export const headerSearchSmallStyles =
  'hidden [@container_header-search_(max-width:_180px)]:inline';

export const avatarMenuStyles = "[[class~='group/app-header']_&]:shrink-0";

export const avatarMenuTriggerStyles = cn(
  'group/avatar-menu-trigger flex items-center gap-1.5 border-0 rounded-[24px] pt-1 pr-1 pb-1 pl-1',
  'bg-transparent text-muted-ink cursor-pointer [&[data-hovered]]:bg-brand-soft',
  '[&[data-pressed]]:bg-brand-soft [&[data-focus-visible]]:[outline:none]',
  '[&[data-focus-visible]]:border-t-[color:var(--brand)]',
  '[&[data-focus-visible]]:border-r-[color:var(--brand)]',
  '[&[data-focus-visible]]:border-b-[color:var(--brand)]',
  '[&[data-focus-visible]]:border-l-[color:var(--brand)]',
  '[&[data-focus-visible]]:[box-shadow:inset_0_0_0_1px_var(--brand)]',
  "[[class~='group/app-header']_&]:pt-[3px] [[class~='group/app-header']_&]:pr-[3px]",
  "[[class~='group/app-header']_&]:pb-[3px] [[class~='group/app-header']_&]:pl-[3px]",
  "[[class~='group/app-header']_&]:border [[class~='group/app-header']_&]:border-solid [[class~='group/app-header']_&]:border-transparent",
  "[[class~='group/app-header']_&[data-hovered]]:border-t-[color:color-mix(in_srgb,_var(--brand)_25%,_var(--line))]",
  "[[class~='group/app-header']_&[data-hovered]]:border-r-[color:color-mix(in_srgb,_var(--brand)_25%,_var(--line))]",
  "[[class~='group/app-header']_&[data-hovered]]:border-b-[color:color-mix(in_srgb,_var(--brand)_25%,_var(--line))]",
  "[[class~='group/app-header']_&[data-hovered]]:border-l-[color:color-mix(in_srgb,_var(--brand)_25%,_var(--line))]",
  "[[class~='group/app-header']_&[data-pressed]]:border-t-[color:color-mix(in_srgb,_var(--brand)_25%,_var(--line))]",
  "[[class~='group/app-header']_&[data-pressed]]:border-r-[color:color-mix(in_srgb,_var(--brand)_25%,_var(--line))]",
  "[[class~='group/app-header']_&[data-pressed]]:border-b-[color:color-mix(in_srgb,_var(--brand)_25%,_var(--line))]",
  "[[class~='group/app-header']_&[data-pressed]]:border-l-[color:color-mix(in_srgb,_var(--brand)_25%,_var(--line))]",
  "[[class~='group/app-header']_&[data-focus-visible]]:border-t-[color:var(--brand)]",
  "[[class~='group/app-header']_&[data-focus-visible]]:border-r-[color:var(--brand)]",
  "[[class~='group/app-header']_&[data-focus-visible]]:border-b-[color:var(--brand)]",
  "[[class~='group/app-header']_&[data-focus-visible]]:border-l-[color:var(--brand)]",
);

export const avatarMenuChevronStyles = cn(
  "max-[760px]:[[class~='group/avatar-menu-trigger']_>_&]:hidden",
  "max-[600px]:[[class~='group/app-header']_&]:hidden",
);

export const avatarMenuPopoverStyles = cn(
  '[&[data-entering]]:[animation:popover-in_var(--duration-fast)_ease-out]',
  '[&[data-exiting]]:[animation:popover-out_var(--duration-fast)_ease-in] z-[100] w-65',
  'max-w-[calc(100vw_-_24px)] border border-solid border-[color:var(--line)] rounded-[16px] pt-2 pr-2 pb-2 pl-2',
  'bg-paper [box-shadow:var(--shadow-floating)] [outline:none]',
);

export const avatarMenuIdentityStyles = cn(
  'flex gap-3 items-center pt-3.5 pr-3 pb-4.5 pl-3 border-b [border-bottom-style:solid] border-b-[color:var(--line)] mb-1.5',
  '[&_>_span:last-child]:min-w-0 [&_strong]:block [&_strong]:overflow-hidden',
  '[&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-body [&_small]:block',
  '[&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap',
  '[&_small]:text-[length:12px] [&_small]:text-muted-ink [&_small]:mt-[3px]',
);

export const avatarMenuItemsStyles = cn(
  "group/avatar-menu-items [outline:none] [&_[role='menuitem']]:flex",
  "[&_[role='menuitem']]:items-center [&_[role='menuitem']]:gap-3 [&_[role='menuitem']]:min-h-10.5",
  "[&_[role='menuitem']]:pt-2.5 [&_[role='menuitem']]:pr-3 [&_[role='menuitem']]:pb-2.5",
  "[&_[role='menuitem']]:pl-3 [&_[role='menuitem']]:text-body [&_[role='menuitem']]:text-ink",
  "[&_[role='menuitem']]:rounded-[8px] [&_[role='menuitem']]:[outline:none]",
  "[&_[role='menuitem']]:cursor-pointer [&_[role='menuitem'][data-focused]]:bg-brand-soft",
  "[&_[role='menuitem'][data-focused]]:text-brand [&_[role='menuitem'][data-hovered]]:bg-brand-soft",
  "[&_[role='menuitem'][data-hovered]]:text-brand [&_[role='separator']]:h-px",
  "[&_[role='separator']]:bg-line [&_[role='separator']]:mt-1.5 [&_[role='separator']]:mr-1",
  "[&_[role='separator']]:mb-1.5 [&_[role='separator']]:ml-1",
  "[&_[role='menuitem'][class~='group/danger-text']]:text-danger",
  "[&_[role='menuitem'][class~='group/danger-text'][data-focused]]:bg-danger-soft",
  "[&_[role='menuitem'][class~='group/danger-text'][data-hovered]]:bg-danger-soft",
);

export const paletteSearchStyles = cn(
  'flex items-center gap-3 pt-5 pr-5 pb-5 pl-5 text-muted-ink border-b [border-bottom-style:solid] border-b-[color:var(--line)]',
  '[&_input]:border-0 [&_input]:bg-transparent [&_input]:[outline:0] [&_input]:text-ink',
  '[&_input]:flex-1 [&_input]:min-w-0 [&_input]:text-[length:15px]',
);

export const kbdStyles = cn(
  'font-mono text-[length:11px] pt-px pr-1.5 pb-px pl-1.5 rounded-[6px]',
  'border border-solid border-[color:var(--border)] text-muted bg-surface',
);

export const paletteResultsStyles = cn(
  'pt-2 pr-2 pb-2 pl-2 max-h-[min(440px,_calc(76dvh_-_132px))] overflow-y-auto',
  '[overscroll-behavior:contain] [scrollbar-width:thin] [&:empty]:hidden [&_>_button]:flex',
  '[&_>_button]:items-center [&_>_button]:gap-3 [&_>_button]:pt-3 [&_>_button]:pr-3',
  '[&_>_button]:pb-3 [&_>_button]:pl-3 [&_>_button]:w-full [&_>_button]:bg-transparent',
  '[&_>_button]:border-0 [&_>_button]:rounded-[8px] [&_>_button]:text-left [&_>_button]:text-ink',
  "[&_>_button]:text-[length:12px] [&_>_button[aria-selected='true']]:bg-brand-soft",
  "[&_>_button[aria-selected='true']]:text-brand [&_>_button_>_span]:flex-1",
  '[&_>_button_>_svg]:shrink-0',
);

export const paletteResultCopyStyles = cn(
  'min-w-0 flex flex-col gap-0.5 [&_strong]:overflow-hidden [&_strong]:text-ellipsis',
  '[&_strong]:whitespace-nowrap [&_strong]:text-[length:12px] [&_strong]:font-medium',
  '[&_strong]:leading-[1.5] [&_small]:overflow-hidden [&_small]:text-ellipsis',
  '[&_small]:whitespace-nowrap [&_small]:text-muted-ink [&_small]:text-[length:11px]',
  '[&_small]:leading-[1.5]',
);

export const paletteStatusStyles =
  'text-muted-ink text-center pt-7.5 pr-7.5 pb-7.5 pl-7.5 text-[length:12px]';

export const paletteFooterStyles = cn(
  'flex justify-between text-[length:11px] text-muted-ink pt-[13px] pr-5 pb-[13px] pl-5',
  'border-t [border-top-style:solid] border-t-[color:var(--line)] max-[600px]:[&_>_span]:hidden',
);

export const pageResourceErrorStyles = 'flex justify-center py-[clamp(24px,_4vw,_48px)] pt-0';

export const pageResourceErrorCardStyles = cn(
  "group/page-resource-error-card [&_>_[class~='group/btn']]:min-h-11",
  "[&_>_[class~='group/btn']]:px-5",
);

export const pageResourceErrorIconStyles = cn(
  'flex items-center justify-center shrink-0 w-16 h-16',
  'border border-solid border-[color:color-mix(in_srgb,_var(--warning)_15%,_var(--line))] rounded-[20px] bg-warning-soft',
  'text-warning',
);

export const pageResourceErrorCopyStyles = cn(
  'flex flex-col gap-3 min-w-0 max-w-105 [&_h1]:text-[length:23px]',
  '[&_h1]:font-semibold [&_h1]:leading-[1.4] [&_h1]:tracking-[-0.015em] [&_p]:text-muted-ink',
  '[&_p]:text-body [&_p]:leading-[1.8] [&_p]:[overflow-wrap:anywhere]',
);
