import { cn } from '../../../shared/styles/cn.js';

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
