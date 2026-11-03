import { cn } from '../../shared/styles/cn.js';

export const avatarPalettePickerStyles = cn(
  'min-w-0 pt-0 pr-0 pb-0 pl-0 mt-0 mr-0 mb-0 ml-0 border-0 [&_legend]:pt-0 [&_legend]:pr-0',
  '[&_legend]:pb-0 [&_legend]:pl-0 [&_legend]:mb-2.5 [&_legend]:text-ink [&_legend]:text-body',
);

export const avatarPaletteOptionsStyles =
  'grid grid-cols-[repeat(5,_minmax(0,_1fr))] gap-2 max-w-95 max-[400px]:gap-1';

export const avatarPaletteOptionStyles = cn(
  'group/avatar-palette-option relative flex flex-col items-center gap-2 min-w-0 mt-0 mr-0 mb-0 ml-0',
  'pt-2.5 pr-1 pb-2 pl-1 border border-solid border-[color:var(--line)] rounded-[12px] bg-paper text-muted-ink',
  'cursor-pointer',
  '[transition:border-color_var(--duration-fast),_background-color_var(--duration-normal),_color_var(--duration-fast),_box-shadow_var(--duration-normal)]',
  "[&_>_span]:whitespace-nowrap [&_>_span]:text-caption [&_input[type='radio']]:absolute",
  "[&_input[type='radio']]:top-0 [&_input[type='radio']]:right-0 [&_input[type='radio']]:bottom-0",
  "[&_input[type='radio']]:left-0 [&_input[type='radio']]:w-full [&_input[type='radio']]:h-full",
  "[&_input[type='radio']]:min-h-0 [&_input[type='radio']]:pt-0 [&_input[type='radio']]:pr-0",
  "[&_input[type='radio']]:pb-0 [&_input[type='radio']]:pl-0 [&_input[type='radio']]:mt-0",
  "[&_input[type='radio']]:mr-0 [&_input[type='radio']]:mb-0 [&_input[type='radio']]:ml-0",
  "[&_input[type='radio']]:border-0 [&_input[type='radio']]:opacity-0",
  "[&_input[type='radio']]:cursor-pointer hover:border-t-[color:var(--brand)]",
  'hover:border-r-[color:var(--brand)] hover:border-b-[color:var(--brand)]',
  'hover:border-l-[color:var(--brand)] [&:has(input:checked)]:border-t-[color:var(--brand)]',
  '[&:has(input:checked)]:border-r-[color:var(--brand)]',
  '[&:has(input:checked)]:border-b-[color:var(--brand)]',
  '[&:has(input:checked)]:border-l-[color:var(--brand)] [&:has(input:checked)]:bg-brand-soft',
  '[&:has(input:checked)]:text-brand [&:has(input:checked)]:[box-shadow:inset_0_0_0_1px_var(--brand)]',
  '[&:has(input:focus-visible)]:[outline:2px_solid_var(--brand)]',
  '[&:has(input:focus-visible)]:[outline-offset:3px]',
  "max-[400px]:[&_>_[class~='group/user-avatar']]:w-8",
  "max-[400px]:[&_>_[class~='group/user-avatar']]:h-8",
);

export const credentialFormStyles = cn(
  "pb-8 [&_textarea[name='secret']]:min-h-40 [&_textarea[name='secret']]:text-[length:12px]",
  "[&_textarea[name='host\\_key']]:min-h-22 [&_textarea[name='host\\_key']]:text-[length:12px]",
);

export const credentialCenterStyles = cn(
  "group/credential-center max-[760px]:[&_>_[class~='group/section-heading']]:items-start",
  "max-[760px]:[&_>_[class~='group/section-heading']]:flex-col",
);

export const credentialGuideStyles = cn(
  'flex gap-3.5 items-start pt-5 pr-6 pb-5 pl-6 border border-solid border-[color:var(--line)] rounded-[14px]',
  'bg-brand-soft text-brand [&_>_svg]:shrink-0 [&_>_svg]:mt-0.5 [&_p]:text-[length:12px]',
  '[&_p]:leading-[1.7] [&_p]:mt-[5px] [&_p]:mr-0 [&_p]:mb-0 [&_p]:ml-0 [&_p]:text-muted-ink',
  '[&_>_a]:flex [&_>_a]:items-center [&_>_a]:gap-[7px] [&_>_a]:text-[length:12px]',
  '[&_>_a]:whitespace-nowrap [&_>_a]:ml-auto max-[760px]:flex-wrap max-[760px]:pt-4.5',
  'max-[760px]:pr-4.5 max-[760px]:pb-4.5 max-[760px]:pl-4.5 max-[760px]:[&_>_div]:flex-1',
  'max-[760px]:[&_>_div]:min-w-50 max-[760px]:[&_>_a]:mt-0 max-[760px]:[&_>_a]:mr-0',
  'max-[760px]:[&_>_a]:mb-0 max-[760px]:[&_>_a]:ml-8.5',
);

export const credentialGridStyles =
  'grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-5 items-start max-[1000px]:grid-cols-[1fr]';

export const credentialCardStyles = 'flex flex-col';

export const credentialCardHeadStyles = cn(
  'group/credential-card-head flex items-center gap-3.5 [&_>_div]:min-w-0 [&_>_div]:flex-1',
  '[&_h3]:[overflow-wrap:anywhere] [&_h3]:mt-0 [&_h3]:mr-0 [&_h3]:mb-1 [&_h3]:ml-0',
  "[&_>_[class~='group/tag']]:shrink-0",
);

export const credentialKindIconStyles =
  'flex items-center justify-center w-11.5 h-11.5 bg-brand-soft text-brand rounded-[13px] shrink-0';

export const credentialMetaStyles = cn(
  'grid grid-cols-[1fr_1fr] gap-4.5 pt-6 pr-0 pb-6 pl-0 mt-0 mr-0 mb-0 ml-0',
  '[&_dt]:text-[length:12px] [&_dt]:text-muted-ink [&_dt]:mb-[5px] [&_dd]:text-[length:12px]',
  '[&_dd]:mt-0 [&_dd]:mr-0 [&_dd]:mb-0 [&_dd]:ml-0',
);

export const credentialFingerprintStyles =
  '[grid-column:1/-1] min-w-0 [&_code]:text-[length:11px] [&_code]:[overflow-wrap:anywhere]';

export const credentialCardFooterStyles = cn(
  'mt-auto pt-4.5 border-t [border-top-style:solid] border-t-[color:var(--line)] flex gap-3.5 items-center flex-wrap',
  '[&_>_span]:flex [&_>_span]:items-center [&_>_span]:gap-1.5 [&_>_span]:text-[length:11px]',
  '[&_>_span]:text-muted-ink [&_>_span]:mr-auto max-[760px]:gap-3',
);

export const credentialRevokeStyles = cn(
  'group/credential-revoke bg-paper rounded-[18px] pt-6 pr-6 pb-6 pl-6',
  "[&_[class~='group/dialog-title']]:pt-0 [&_[class~='group/dialog-title']]:pr-0",
  "[&_[class~='group/dialog-title']]:pb-6 [&_[class~='group/dialog-title']]:pl-0",
);

export const profileBannerStyles = cn(
  'group/profile-banner flex items-center gap-5 mb-5 [&_h2]:text-[length:23px] [&_h2]:mt-[3px]',
  '[&_h2]:mr-0 [&_h2]:mb-[3px] [&_h2]:ml-0 max-[760px]:flex-wrap max-[760px]:gap-4',
  "max-[760px]:[&_h2]:text-[length:23px] [&_[class~='group/eyebrow']]:text-[length:11px]",
  "[&_[class~='group/eyebrow']]:tracking-[0.16em] [&_>_[class~='group/user-avatar']]:w-18",
  "[&_>_[class~='group/user-avatar']]:h-18 max-[760px]:[&_>_[class~='group/user-avatar']]:w-14",
  "max-[760px]:[&_>_[class~='group/user-avatar']]:h-14",
);

export const profileStatsStyles = cn(
  'flex gap-8 ml-auto text-center [&_>_span]:flex [&_>_span]:flex-col [&_>_span]:gap-[3px]',
  '[&_>_span]:text-[length:12px] [&_>_span]:text-muted-ink [&_>_span]:min-w-14.5',
  '[&_strong]:text-[length:23px] [&_strong]:leading-[1.5] [&_strong]:text-ink [&_strong]:font-mono',
  '[&_strong]:font-medium max-[1000px]:gap-5 max-[760px]:w-full max-[760px]:ml-0 max-[760px]:pt-4.5',
  'max-[760px]:border-t max-[760px]:[border-top-style:solid] max-[760px]:border-t-[color:var(--line)] max-[760px]:[justify-content:space-around]',
  'max-[760px]:[&_strong]:text-[length:23px]',
);

export const profileGridStyles = cn(
  'group/profile-grid grid grid-cols-[minmax(0,_1.2fr)_minmax(0,_0.8fr)] gap-5 items-start',
  'max-[1000px]:grid-cols-[minmax(0,_1fr)_minmax(0,_0.9fr)] max-[760px]:grid-cols-[1fr]',
  "[&_>_[class~='group/panel']]:flex [&_>_[class~='group/panel']]:flex-col",
  "[&_[class~='group/form-stack']]:gap-5",
);

export const profileSideStyles = 'flex flex-col gap-5';

export const profileTeamsStyles = cn(
  'group/profile-teams [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-3 [&_>_div]:pt-2',
  '[&_>_div]:pr-0 [&_>_div]:pb-2 [&_>_div]:pl-0 [&_strong]:text-body',
  "[&_strong]:[overflow-wrap:anywhere] [&_strong]:min-w-0 [&_[class~='group/tag']]:ml-auto",
  "[&_[class~='group/tag']]:shrink-0",
);

export const teamMonogramStyles =
  'w-8.5 h-8.5 rounded-[10px] bg-brand-soft text-brand flex items-center justify-center shrink-0';

export const profileRoleChipsStyles = 'mt-4 mr-0 mb-4 ml-0';

export const profileActivityStyles = cn(
  '[&_ol]:pt-0 [&_ol]:pr-0 [&_ol]:pb-0 [&_ol]:pl-0 [&_ol]:mt-0 [&_ol]:mr-0 [&_ol]:mb-0 [&_ol]:ml-0',
  '[&_ol]:[list-style:none] [&_li]:flex [&_li]:gap-3.5 [&_li]:pt-[7px] [&_li]:pr-0 [&_li]:pb-[7px]',
  "[&_li]:pl-0 [&_li]:relative [&_li:not(:last-child):before]:[content:'']",
  '[&_li:not(:last-child):before]:absolute [&_li:not(:last-child):before]:top-[23px]',
  '[&_li:not(:last-child):before]:bottom-[-8px] [&_li:not(:last-child):before]:left-1',
  '[&_li:not(:last-child):before]:border-l [&_li:not(:last-child):before]:[border-left-style:solid] [&_li:not(:last-child):before]:border-l-[color:var(--line)] [&_strong]:text-[length:12px]',
  '[&_strong]:font-medium [&_strong]:min-w-0 [&_strong]:[overflow-wrap:anywhere]',
  '[&_strong]:leading-[1.6] [&_li_>_div]:min-w-0 [&_li_>_div]:flex [&_li_>_div]:flex-1',
  '[&_li_>_div]:items-center [&_li_>_div]:justify-between [&_li_>_div]:gap-3 [&_small]:block',
  '[&_small]:text-[length:11px] [&_small]:text-muted-ink [&_small]:mt-0 [&_small]:whitespace-nowrap',
);

export const activityDotStyles =
  'w-[9px] h-[9px] border-2 border-solid border-[color:var(--brand)] bg-paper rounded-[50%] shrink-0 mt-1.5 z-[1]';

export const sessionPanelStyles = '[container-type:inline-size]';

export const sessionCountStyles = 'text-muted-ink text-caption whitespace-nowrap';

export const tableIdentityStyles = cn(
  'flex items-center gap-[var(--space-2)] min-w-0 [&_>_svg]:shrink-0 [&_>_span]:min-w-0',
  '[&_>_span]:[overflow-wrap:anywhere]',
);

export const sessionListStyles = cn(
  "[[class~='group/panel']_>_[class~='group/notice']_+_&]:mt-4 grid gap-2.5 mt-0 mr-0 mb-0 ml-0 pt-0",
  'pr-0 pb-0 pl-0 [list-style:none]',
);

export const sessionItemStyles = cn(
  'group/session-item grid grid-cols-[36px_minmax(0,_1fr)_auto] items-center gap-[10px_12px] pt-3.5',
  'pr-3.5 pb-3.5 pl-3.5 border border-solid border-[color:var(--line)] rounded-[12px] min-w-0',
  "[&[data-current='true']]:[background:color-mix(in_srgb,_var(--brand-soft)_25%,_var(--paper))]",
  "[&[data-current='true']]:border-t-[color:color-mix(in_srgb,_var(--brand)_30%,_var(--line))]",
  "[&[data-current='true']]:border-r-[color:color-mix(in_srgb,_var(--brand)_30%,_var(--line))]",
  "[&[data-current='true']]:border-b-[color:color-mix(in_srgb,_var(--brand)_30%,_var(--line))]",
  "[&[data-current='true']]:border-l-[color:color-mix(in_srgb,_var(--brand)_30%,_var(--line))]",
  '[@container_(max-width:_380px)]:grid-cols-[36px_minmax(0,_1fr)]',
  '[@container_(max-width:_380px)]:pt-3 [@container_(max-width:_380px)]:pr-3',
  '[@container_(max-width:_380px)]:pb-3 [@container_(max-width:_380px)]:pl-3',
  '[@container_(max-width:_380px)]:gap-x-2.5',
);

export const sessionDeviceIconStyles = cn(
  'flex items-center justify-center w-9 h-9 rounded-[10px] text-muted-ink bg-page',
  "[[class~='group/session-item'][data-current='true']_&]:text-brand",
  "[[class~='group/session-item'][data-current='true']_&]:bg-brand-soft",
);

export const sessionContentStyles =
  "min-w-0 [[class~='group/session-item'][data-current='true']_&]:[grid-column:2_/_-1]";

export const sessionTitleStyles = cn(
  'group/session-title flex items-center flex-wrap gap-[6px_8px] [&_strong]:text-body',
  '[&_strong]:font-semibold [&_strong]:leading-[1.5] [&_strong]:[overflow-wrap:anywhere]',
  "[&_strong]:min-w-0 [&_[class~='group/tag']]:shrink-0 [&_[class~='group/tag']]:text-[length:11px]",
  "[&_[class~='group/tag']]:pt-0.5 [&_[class~='group/tag']]:pr-[7px] [&_[class~='group/tag']]:pb-0.5",
  "[&_[class~='group/tag']]:pl-[7px]",
);

export const sessionDeviceStyles =
  'text-muted-ink text-label leading-[1.5] mt-[3px] mr-0 mb-0 ml-0 [overflow-wrap:anywhere]';

export const sessionTimesStyles = cn(
  'flex flex-wrap gap-[3px_16px] mt-2 mr-0 mb-0 ml-0 text-muted-ink text-caption leading-[1.5]',
  'tabular-nums [&_>_div]:flex [&_>_div]:items-baseline [&_>_div]:gap-[5px] [&_dt]:mt-0 [&_dt]:mr-0',
  '[&_dt]:mb-0 [&_dt]:ml-0 [&_dt]:whitespace-nowrap [&_dd]:mt-0 [&_dd]:mr-0 [&_dd]:mb-0 [&_dd]:ml-0',
  '[&_dd]:whitespace-nowrap',
);

export const sessionActionStyles = cn(
  '[justify-self:end] whitespace-nowrap text-[length:12px] gap-1.5',
  '[@container_(max-width:_380px)]:[grid-column:2]',
  '[@container_(max-width:_380px)]:[justify-self:start]',
);
