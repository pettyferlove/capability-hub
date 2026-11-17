import { cn } from '../../shared/styles/cn.js';

export const accountPageStyles = "group/account-page [&>nav[class~='group/page-tabs']]:mb-6";

export const memberTableStyles = cn(
  "[[class~='group/data-table']_&]:[table-layout:fixed]",
  "[[class~='group/data-table']_&]:min-w-160",
);

export const memberTeamStyles = 'min-w-0 max-w-full gap-2';

export const memberTeamMetaStyles =
  'shrink-0 whitespace-nowrap border-l border-line pl-2 text-caption leading-4 text-muted-ink';

export const memberRemoveBtnStyles = cn(
  memberTeamMetaStyles,
  'inline-flex items-center border-y-0 border-r-0 bg-transparent py-0 pr-0 hover:text-danger',
);

export const memberActionsStyles =
  'grid grid-cols-[2.5rem_6.5rem] items-center justify-center gap-2 [&_>_*]:justify-self-start';

export const directoryCardStyles = 'flex min-h-64 flex-col gap-5';

export const directoryHeaderStyles = 'flex flex-wrap items-center justify-between gap-3';

export const directoryIconStyles =
  'grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-page text-muted-ink';

export const directoryListStyles =
  'm-0 list-none overflow-hidden rounded-xl border border-line bg-page p-0 [&_>_li+li]:border-t [&_>_li+li]:border-line';

export const directoryRowStyles =
  'grid min-h-18 min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 px-3.5 py-3';

export const directoryMemberCountStyles =
  'inline-flex min-w-18 items-center justify-end gap-1.5 whitespace-nowrap text-caption tabular-nums text-muted-ink';

export const directoryEmptyStyles =
  'flex min-h-32 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-page px-4 py-5 text-center text-body leading-relaxed';

export const directoryFooterStyles = 'mt-auto min-h-10 border-t border-line pt-3';

export const roleGridStyles =
  'grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-3 max-[600px]:grid-cols-[minmax(0,_1fr)]';

export const roleCardStyles = cn(
  'group/role-card grid grid-cols-[22px_minmax(0,_1fr)] [align-content:start] items-start',
  'gap-[10px_12px] border border-solid border-[color:var(--line)] pt-4 pr-4 pb-4 pl-4 rounded-[12px] min-w-0',
  '[&_>_svg]:text-brand [&_>_svg]:w-5 [&_>_svg]:h-5 [&_>_svg]:[align-self:center] [&_h3]:flex',
  '[&_h3]:gap-2.5 [&_h3]:items-center [&_h3]:flex-wrap [&_h3]:min-h-6 [&_h3]:min-w-0 [&_h3]:mt-0',
  '[&_h3]:mr-0 [&_h3]:mb-0 [&_h3]:ml-0 [&_h3]:text-[length:12px] [&_h3]:font-semibold',
  '[&_h3]:leading-[1.5] [&_h3]:[overflow-wrap:anywhere] max-[600px]:pt-3.5 max-[600px]:pr-3.5',
  'max-[600px]:pb-3.5 max-[600px]:pl-3.5 max-[600px]:gap-[8px_10px]',
  "[&_>_[class~='group/text-btn']]:[grid-column:2] [&_>_[class~='group/text-btn']]:min-w-0",
  "[&_>_[class~='group/text-btn']]:[justify-self:start]",
  "[&_>_[class~='group/text-btn']]:text-[length:12px] [&_>_[class~='group/text-btn']]:pt-0",
  "[&_>_[class~='group/text-btn']]:pr-0 [&_>_[class~='group/text-btn']]:pb-0",
  "[&_>_[class~='group/text-btn']]:pl-0 [&_>_[class~='group/chips']]:[grid-column:2]",
  "[&_>_[class~='group/chips']]:min-w-0",
);

export const permissionTagStyles = cn(
  'bg-page text-muted-ink text-[length:11px] pt-[3px] pr-[5px] pb-[3px] pl-[5px] rounded-[4px]',
  '[overflow-wrap:anywhere] leading-[1.5]',
);

export const tableScopeStyles = 'flex items-center gap-2 flex-wrap';

export const tableScopeNameStyles =
  'text-muted-ink text-[length:12px] leading-[1.5] [overflow-wrap:anywhere]';

export const permissionListStyles =
  'flex flex-col gap-2.5 [&_code]:text-[length:12px] [&_code]:[overflow-wrap:anywhere]';
