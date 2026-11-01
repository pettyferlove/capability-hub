import { cn } from '../../shared/styles/cn.js';

export const accountPageStyles = "group/account-page [&>nav[class~='group/page-tabs']]:mb-6";

export const memberRemoveBtnStyles = cn(
  'inline-flex items-center ml-[5px] pt-0 pr-1 pb-0 pl-1 border-0',
  'border-l [border-left-style:solid] border-l-[color:var(--line)] [background:none] text-muted-ink text-[length:11px]',
  'leading-[1.4] hover:text-danger',
);

export const tableActionsStyles = cn(
  'flex gap-3 whitespace-nowrap',
  "[[class~='group/data-table']_[class~='group/table-cell-actions']_&]:justify-center",
  "[[class~='group/data-table']_[class~='group/table-cell-actions']_&]:flex-nowrap",
  "[[class~='group/data-table']_&]:items-center [[class~='group/data-table']_&]:flex-wrap",
  "[[class~='group/data-table']_&]:gap-[2px_12px]",
);

export const directoryCardStyles = 'flex min-h-64 flex-col gap-5';

export const directoryHeaderStyles = 'flex flex-wrap items-center justify-between gap-3';

export const directoryIconStyles =
  'grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-page text-muted-ink';

export const directoryListStyles =
  'm-0 list-none overflow-hidden rounded-xl border border-line bg-page p-0 [&_>_li+li]:border-t [&_>_li+li]:border-line';

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

export const auditActorAvatarStyles = cn(
  'grid [place-items:center] shrink-0 w-8 h-8 rounded-[50%] bg-brand-soft text-brand text-caption',
  "[&[class~='group/anonymous']]:bg-page [&[class~='group/anonymous']]:text-muted-ink",
  "[&[class~='group/anonymous']]:border [&[class~='group/anonymous']]:border-solid [&[class~='group/anonymous']]:border-[color:var(--line)] [&[class~='group/unknown']]:bg-page",
  "[&[class~='group/unknown']]:text-muted-ink",
  "[&[class~='group/unknown']]:border [&[class~='group/unknown']]:border-solid [&[class~='group/unknown']]:border-[color:var(--line)] [&[class~='group/system']]:bg-page",
  "[&[class~='group/system']]:text-muted-ink",
  "[&[class~='group/system']]:border [&[class~='group/system']]:border-solid [&[class~='group/system']]:border-[color:var(--line)]",
);

export const auditResultStyles = cn(
  'inline-flex items-center gap-[5px] pt-[3px] pr-2 pb-[3px] pl-2 rounded-[6px] text-caption',
  'font-medium bg-success-soft text-success whitespace-nowrap [vertical-align:middle] leading-[1.5]',
  "[&[class~='group/failure']]:bg-danger-soft [&[class~='group/failure']]:text-danger",
);

export const tnumStyles = 'tabular-nums';

export const auditRowNoteStyles =
  '[display:-webkit-box]! [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden';

export const auditActorStyles = cn(
  'flex items-center gap-[var(--space-2)] [&_>_span:last-child]:min-w-0',
  '[&_>_span:last-child]:[overflow-wrap:anywhere]',
);

export const auditSubjectStyles = 'block [overflow-wrap:anywhere]';

export const auditDetailStyles = cn(
  'group/audit-detail flex flex-col items-stretch gap-[var(--space-5)]',
  "[&_>_[class~='group/btn']]:[align-self:flex-start]",
);

export const auditDetailHeadingStyles = cn(
  'flex flex-wrap items-center gap-[var(--space-2)] [&_h2]:basis-full [&_h2]:mt-[var(--space-2)]',
  '[&_h2]:text-[length:25px] [&_h2]:leading-[1.4] [&_time]:basis-full [&_time]:text-muted-ink',
  '[&_time]:text-label',
);

export const auditDetailFactsStyles = cn(
  'grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-[var(--space-5)_var(--space-4)] mt-0 mr-0 mb-0',
  'ml-0 [&_>_div]:min-w-0 [&_dt]:text-muted-ink [&_dt]:text-label [&_dt]:mb-[var(--space-2)]',
  '[&_dd]:mt-0 [&_dd]:mr-0 [&_dd]:mb-0 [&_dd]:ml-0 [&_dd]:[overflow-wrap:anywhere] [&_dd]:text-body',
  '[&_small]:block [&_small]:text-muted-ink [&_small]:text-label [&_small]:mt-[var(--space-1)]',
  'max-[600px]:grid-cols-[minmax(0,_1fr)]',
);

export const auditDetailSectionStyles = cn(
  'flex flex-col gap-[var(--space-3)] pt-[var(--space-5)] border-t [border-top-style:solid] border-t-[color:var(--line)]',
  '[&_p]:text-body [&_p]:text-muted-ink [&_p]:whitespace-pre-wrap [&_p]:[overflow-wrap:anywhere]',
);

export const auditChangesStyles = cn(
  'border border-solid border-[color:var(--line)] rounded-[10px] overflow-hidden [&_table]:w-full',
  '[&_table]:[border-collapse:collapse] [&_table]:[table-layout:fixed] [&_table]:text-label',
  '[&_th]:pt-[var(--space-3)] [&_th]:pr-[var(--space-3)] [&_th]:pb-[var(--space-3)]',
  '[&_th]:pl-[var(--space-3)] [&_th]:border-b [&_th]:[border-bottom-style:solid] [&_th]:border-b-[color:var(--line)] [&_th]:text-left',
  '[&_th]:[overflow-wrap:anywhere] [&_th]:[vertical-align:top] [&_th]:bg-page [&_th]:font-medium',
  '[&_td]:pt-[var(--space-3)] [&_td]:pr-[var(--space-3)] [&_td]:pb-[var(--space-3)]',
  '[&_td]:pl-[var(--space-3)] [&_td]:border-b [&_td]:[border-bottom-style:solid] [&_td]:border-b-[color:var(--line)] [&_td]:text-left',
  '[&_td]:[overflow-wrap:anywhere] [&_td]:[vertical-align:top]',
  '[&_tbody_tr:last-child_>_*]:border-b-0',
);

export const auditTechnicalStyles = cn(
  'group/audit-technical border-t [border-top-style:solid] border-t-[color:var(--line)] pt-[var(--space-5)]',
  '[&_>_summary]:cursor-pointer [&_>_summary]:text-muted-ink [&_>_summary]:text-label',
  "[&_>_:not(summary)]:mt-[var(--space-4)] [&_[class~='group/codeblock']]:whitespace-pre-wrap",
  "[&_[class~='group/codeblock']]:[overflow-wrap:anywhere]",
);

export const auditPanelStyles = cn(
  "group/audit-panel flex flex-col gap-[var(--space-5)] [&_>_[class~='group/section-heading']]:mt-0",
  "[&_>_[class~='group/section-heading']]:mr-0 [&_>_[class~='group/section-heading']]:mb-0",
  "[&_>_[class~='group/section-heading']]:ml-0 [&_[class~='group/section-heading']_>_div]:grid",
  "[&_[class~='group/section-heading']_>_div]:gap-[var(--space-1)]",
  "max-[600px]:[&_[class~='group/table-pagination']_>_div]:flex-wrap",
);

export const auditMetricsStyles = cn(
  'grid grid-cols-[repeat(4,_minmax(0,_1fr))] gap-[var(--space-4)] [&_>_div]:grid',
  '[&_>_div]:gap-[var(--space-2)] [&_>_div]:pt-[var(--space-4)] [&_>_div]:pr-[var(--space-4)]',
  '[&_>_div]:pb-[var(--space-4)] [&_>_div]:pl-[var(--space-4)]',
  '[&_>_div]:border [&_>_div]:border-solid [&_>_div]:border-[color:var(--line)] [&_>_div]:rounded-[12px] [&_>_div]:bg-page [&_span]:flex',
  '[&_span]:items-center [&_span]:gap-[var(--space-2)] [&_span]:text-label [&_span]:text-muted-ink',
  '[&_strong]:text-[length:27px] [&_strong]:font-semibold [&_strong]:leading-[1.3]',
  '[&_small]:text-caption [&_small]:text-muted-ink',
  "[&_[class~='group/has-failures']]:border-t-[color:color-mix(in_srgb,_var(--danger)_25%,_var(--line))]",
  "[&_[class~='group/has-failures']]:border-r-[color:color-mix(in_srgb,_var(--danger)_25%,_var(--line))]",
  "[&_[class~='group/has-failures']]:border-b-[color:color-mix(in_srgb,_var(--danger)_25%,_var(--line))]",
  "[&_[class~='group/has-failures']]:border-l-[color:color-mix(in_srgb,_var(--danger)_25%,_var(--line))]",
  "[&_[class~='group/has-failures']]:bg-danger-soft",
  "[&_[class~='group/has-failures']_strong]:text-danger",
  "[&_[class~='group/has-failures']_span]:text-danger",
  'max-[600px]:grid-cols-[repeat(2,_minmax(0,_1fr))] max-[600px]:gap-[var(--space-3)]',
  'max-[600px]:[&_>_div]:pt-[var(--space-3)] max-[600px]:[&_>_div]:pr-[var(--space-3)]',
  'max-[600px]:[&_>_div]:pb-[var(--space-3)] max-[600px]:[&_>_div]:pl-[var(--space-3)]',
  'max-[600px]:[&_small]:hidden',
);

export const hasFailuresStyles = 'group/has-failures';

export const auditFiltersStyles = cn(
  'grid grid-cols-[minmax(220px,_1fr)_150px_130px_140px] gap-[var(--space-3)] [align-items:end]',
  '[&_>_label_>_span]:flex [&_>_label_>_span]:items-center [&_>_label_>_span]:gap-1.5',
  'max-[1000px]:grid-cols-[repeat(3,_minmax(0,_1fr))]',
  'max-[600px]:grid-cols-[repeat(2,_minmax(0,_1fr))]',
  'max-[600px]:[&_>_label:last-child]:[grid-column:1/-1]',
);

export const auditSearchStyles = cn(
  'flex flex-row items-center h-10 gap-[var(--space-2)] border border-solid border-[color:var(--line)]',
  'rounded-[10px] pt-0 pr-[var(--space-3)] pb-0 pl-[var(--space-3)] bg-page text-muted-ink',
  '[&_>_svg]:shrink-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:w-full',
  '[&_input]:min-w-0 [&_input]:text-ink [&_input]:text-body [&_input]:[outline:none]',
  'max-[1000px]:[grid-column:1/-1]',
  '[&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-solid [&:has(:focus-visible)]:outline-muted-ink [&:has(:focus-visible)]:outline-offset-2',
);

export const auditQueryCaptionStyles = cn(
  'group/audit-query-caption flex flex-wrap items-center justify-between gap-[var(--space-2)]',
  "text-muted-ink text-caption my-[-8px_-12px] [&_[class~='group/text-btn']]:text-label",
);

export const auditTableStyles = cn(
  'group/audit-table [&_table]:min-w-180 [&_td]:[vertical-align:middle] [&_td]:py-[var(--space-4)]',
  '[&_td:first-child]:w-28 [&_td:first-child]:whitespace-nowrap [&_td:nth-child(2)]:w-[24%]',
  '[&_td:nth-child(2)]:max-w-65 [&_td:nth-child(3)]:w-[23%] [&_td:nth-child(4)]:w-[23%]',
  '[&_td:nth-child(5)]:whitespace-nowrap [&_td:last-child]:whitespace-nowrap [&_strong]:font-medium',
  '[&_small]:block [&_small]:text-muted-ink [&_small]:text-caption [&_small]:mt-[var(--space-1)]',
  '[&_small]:leading-[1.7] max-[760px]:[&_table]:block max-[760px]:[&_table]:min-w-0',
  'max-[760px]:[&_thead]:absolute max-[760px]:[&_thead]:w-px max-[760px]:[&_thead]:h-px',
  'max-[760px]:[&_thead]:overflow-hidden max-[760px]:[&_thead]:[clip-path:inset(50%)]',
  'max-[760px]:[&_tbody]:block max-[760px]:[&_tbody_tr]:grid',
  'max-[760px]:[&_tbody_tr]:grid-cols-[minmax(0,_1fr)_auto]',
  "max-[760px]:[&_tbody_tr]:[grid-template-areas:'event_result'_'actor_time'_'subject_detail']",
  'max-[760px]:[&_tbody_tr]:items-center',
  'max-[760px]:[&_tbody_tr]:gap-[var(--space-4)_var(--space-3)]',
  'max-[760px]:[&_tbody_tr]:pt-[var(--space-4)] max-[760px]:[&_tbody_tr]:pr-[var(--space-4)]',
  'max-[760px]:[&_tbody_tr]:pb-[var(--space-4)] max-[760px]:[&_tbody_tr]:pl-[var(--space-4)]',
  'max-[760px]:[&_tbody_tr]:border-b max-[760px]:[&_tbody_tr]:[border-bottom-style:solid] max-[760px]:[&_tbody_tr]:border-b-[color:var(--line)]',
  'max-[760px]:[&_tbody_tr:last-child]:border-b-0 max-[760px]:[&_td:nth-child(n)]:w-auto',
  'max-[760px]:[&_td:nth-child(n)]:max-w-none max-[760px]:[&_td:nth-child(n)]:pt-0',
  'max-[760px]:[&_td:nth-child(n)]:pr-0 max-[760px]:[&_td:nth-child(n)]:pb-0',
  'max-[760px]:[&_td:nth-child(n)]:pl-0 max-[760px]:[&_td:nth-child(n)]:border-0',
  'max-[760px]:[&_td:nth-child(n)]:whitespace-normal max-[760px]:[&_td:nth-child(n)]:h-auto',
  'max-[760px]:[&_td:nth-child(n)]:min-h-0 max-[760px]:[&_td:nth-child(1)]:[grid-area:time]',
  'max-[760px]:[&_td:nth-child(1)]:text-right max-[760px]:[&_td:nth-child(2)]:[grid-area:event]',
  'max-[760px]:[&_td:nth-child(3)]:[grid-area:actor]',
  'max-[760px]:[&_td:nth-child(4)]:[grid-area:subject]',
  'max-[760px]:[&_td:nth-child(5)]:[grid-area:result]',
  'max-[760px]:[&_td:nth-child(5)]:[justify-self:end] max-[760px]:[&_td:nth-child(5)]:text-right',
  'max-[760px]:[&_td:nth-child(6)]:[grid-area:detail]',
  'max-[760px]:[&_td:nth-child(6)]:[justify-self:end] max-[760px]:[&_td:nth-child(6)]:text-right',
  "[&_[class~='group/table-wrap']]:max-h-[none]",
);

export const auditEvidenceNoteStyles = cn(
  'flex items-start gap-[var(--space-2)] text-muted-ink text-caption leading-[1.8]',
  '[&_>_svg]:shrink-0 [&_>_svg]:mt-0.5',
);

export const permissionListStyles =
  'flex flex-col gap-2.5 [&_code]:text-[length:12px] [&_code]:[overflow-wrap:anywhere]';

export const operationsGridStyles = 'grid grid-cols-2 gap-4.5 items-start max-[760px]:grid-cols-1';

export const analyticsSummaryStyles = cn(
  'grid gap-2 sm:grid-cols-3 [&_>_div]:min-w-0 [&_>_div]:rounded-lg [&_>_div]:bg-page [&_>_div]:p-3',
  '[&_span]:block [&_span]:text-label [&_small]:text-caption [&_small]:text-muted-ink',
  '[&_strong]:my-1 [&_strong]:block [&_strong]:text-xl [&_strong]:tabular-nums',
);

export const dailyCountsTableStyles = cn(
  'w-full text-right text-caption tabular-nums [&_tr]:border-b [&_tr]:border-line',
  '[&_th]:font-medium [&_th:first-child]:text-left [&_th]:p-1.5 [&_td]:p-1.5',
);

export const operationsAgentListStyles = cn(
  'mt-4 [&_li]:grid [&_li]:grid-cols-[minmax(9rem,1fr)_2fr_auto] [&_li]:items-center',
  '[&_li]:gap-3 [&_li]:border-t [&_li]:border-line [&_li]:py-3',
  '[&_li]:text-label [&_strong]:font-medium [&_small]:text-caption [&_small]:text-muted-ink',
  'max-[760px]:[&_li]:grid-cols-1 max-[760px]:[&_li]:gap-1.5',
);

export const operationsPanelStyles = cn(
  'group/operations-panel flex flex-col gap-5 [&_dl_>_div]:flex [&_dl_>_div]:justify-between',
  '[&_dl_>_div]:items-center [&_dl_>_div]:gap-3 [&_dl_>_div]:pt-2.5 [&_dl_>_div]:pr-0',
  '[&_dl_>_div]:pb-2.5 [&_dl_>_div]:pl-0 [&_dl_>_div]:border-t [&_dl_>_div]:[border-top-style:solid] [&_dl_>_div]:border-t-[color:var(--line)]',
  '[&_dl_>_div]:text-[length:12px] [&_dt]:text-muted-ink [&_dd]:tabular-nums [&_dd]:text-right [&_dd]:[overflow-wrap:anywhere]',
  "[&_dd_code]:text-[length:11px] [&_[class~='group/panel']_h3]:text-[length:15px]",
  "[&_[class~='group/panel']_h3]:mb-[15px]",
  "[&_[class~='group/panel']_>_[class~='group/subtle']]:mt-[15px]",
  "[&_[class~='group/panel']_>_[class~='group/subtle']]:text-[length:11px]",
  "[&_[class~='group/panel']_>_[class~='group/subtle']]:leading-[1.9]",
  "[&_[class~='group/section-heading']]:mb-0",
  "[&_[class~='group/section-heading']_h2]:text-[length:19px]",
  "[&_[class~='group/section-heading']_p]:text-[length:11px]",
  "[&_[class~='group/section-heading']_p]:mt-1.5",
  "max-[760px]:[&_[class~='group/section-heading']_p]:max-w-57.5",
  "max-[760px]:[&_[class~='group/section-heading']_p]:leading-[1.8]",
);

export const operationsCardsStyles = cn(
  'grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-4.5 [&_>_div]:pt-[23px] [&_>_div]:pr-[23px]',
  '[&_>_div]:pb-[23px] [&_>_div]:pl-[23px] [&_>_div]:bg-paper',
  '[&_>_div]:border [&_>_div]:border-solid [&_>_div]:border-[color:var(--line)] [&_>_div]:rounded-[12px] [&_>_div]:flex',
  '[&_>_div]:flex-col [&_>_div]:gap-3 [&_>_div_>_span]:text-[length:12px]',
  '[&_>_div_>_span]:text-muted-ink [&_strong]:text-[length:31px] [&_strong]:leading-[1.2]',
  '[&_strong]:[font-weight:550] [&_strong]:tabular-nums [&_em]:text-[length:15px]',
  '[&_em]:text-muted-ink [&_em]:[font-style:normal] [&_em]:ml-2 [&_em]:font-normal',
  '[&_small]:text-[length:11px] [&_small]:text-muted-ink [&_small]:leading-[1.8]',
  'max-[760px]:grid-cols-[1fr] max-[760px]:gap-3 max-[760px]:[&_>_div]:pt-4.5',
  'max-[760px]:[&_>_div]:pr-4.5 max-[760px]:[&_>_div]:pb-4.5 max-[760px]:[&_>_div]:pl-4.5',
  'max-[760px]:[&_strong]:text-[length:27px]',
);

export const operationsFailuresStyles = cn(
  '[&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-3.5 [&_>_div]:pt-3 [&_>_div]:pr-0',
  '[&_>_div]:pb-3 [&_>_div]:pl-0 [&_>_div]:border-t [&_>_div]:[border-top-style:solid] [&_>_div]:border-t-[color:var(--line)]',
  '[&_>_div]:text-[length:12px] [&_code]:text-[length:11px] [&_code]:text-danger [&_code]:flex-1',
  '[&_code]:min-w-0 [&_code]:[overflow-wrap:anywhere] [&_small]:ml-auto [&_small]:text-caption',
  '[&_small]:text-muted-ink [&_small]:shrink-0 [&_small]:whitespace-nowrap',
  'max-[760px]:[&_>_div]:flex-wrap max-[760px]:[&_>_div]:gap-[7px]',
  'max-[760px]:[&_code]:[overflow-wrap:anywhere]',
);
