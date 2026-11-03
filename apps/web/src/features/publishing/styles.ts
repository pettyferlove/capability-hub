import { cn } from '../../shared/styles/cn.js';

export const intakeDetailStyles = cn(
  'group/intake-detail border-t [border-top-style:solid] border-t-[color:var(--line)] mt-5 pt-6 flex flex-col gap-5 [&_h3]:flex',
  '[&_h3]:items-center [&_h3]:gap-2.5 [&_h3]:[overflow-wrap:anywhere] [&_h4]:text-[length:12px]',
  "[[class~='group/publish-page']_&]:max-h-[calc(100vh_-_410px)]",
  "[[class~='group/publish-page']_&]:min-h-55 [[class~='group/publish-page']_&]:overflow-y-auto",
  "[[class~='group/publish-page']_&]:gap-[15px] [[class~='group/publish-page']_&]:mt-[17px]",
  "[[class~='group/publish-page']_&]:pt-[19px] [[class~='group/publish-page']_&]:pr-1.5",
  "[[class~='group/publish-page']_&]:[scrollbar-width:thin]",
  "[[class~='group/publish-page']_&_h3]:text-[length:15px]",
  "[[class~='group/publish-page']_&_h3]:flex-wrap [[class~='group/publish-page']_&_label]:text-label",
  "[[class~='group/publish-page']_&_label]:leading-[1.5]",
  "[[class~='group/publish-page']_&_label]:gap-[var(--space-2)]",
  "[[class~='group/publish-page']_&_textarea]:min-h-19.5",
  "[[class~='group/publish-page']_&_textarea]:text-[length:12px]",
  "max-[1000px]:[[class~='group/publish-page']_&]:max-h-[calc(100vh_-_440px)]",
  "max-[600px]:[[class~='group/publish-page']_&]:max-h-[none]",
  "max-[600px]:[[class~='group/publish-page']_&]:min-h-0",
  "max-[600px]:[[class~='group/publish-page']_&]:overflow-visible",
  "max-[600px]:[[class~='group/publish-page']_&]:pr-0",
  "max-[760px]:[[class~='group/publish-page']_&]:max-h-155",
  "[[class~='group/publish-intake-body']_&]:max-h-[none]",
  "[[class~='group/publish-intake-body']_&]:min-h-0",
  "[[class~='group/publish-intake-body']_&]:overflow-visible",
  "[[class~='group/publish-intake-body']_&]:mt-0 [[class~='group/publish-intake-body']_&]:mr-0",
  "[[class~='group/publish-intake-body']_&]:mb-0 [[class~='group/publish-intake-body']_&]:ml-0",
  "[[class~='group/publish-intake-body']_&]:pt-0 [[class~='group/publish-intake-body']_&]:pr-0",
  "[[class~='group/publish-intake-body']_&]:pb-0 [[class~='group/publish-intake-body']_&]:pl-0",
  "[[class~='group/publish-intake-body']_&]:border-0",
  "[[class~='group/publish-intake-body']_&]:gap-4.5",
  "[[class~='group/publish-intake-body']_&_h3]:font-mono",
  "[[class~='group/publish-intake-body']_&_h3]:text-[length:17px]",
  "[[class~='group/publish-intake-body']_&_h3]:leading-[1.8]",
  "[[class~='group/publish-intake-body']_&_h3]:[overflow-wrap:anywhere]",
  "[[class~='group/publish-intake-body']_&_label]:text-[length:12px]",
  "[[class~='group/publish-intake-body']_&_textarea]:min-h-27.5",
  "[[class~='group/publish-intake-body']_&_textarea]:text-[length:12px]",
  "max-[600px]:[[class~='group/publish-intake-body']_&_h3]:text-[length:15px]",
);

export const intakeSnapshotStyles = cn(
  'border border-solid border-[color:var(--line)] rounded-[8px] shrink-0 [&_>_summary]:flex',
  '[&_>_summary]:items-center [&_>_summary]:gap-2 [&_>_summary]:pt-[11px] [&_>_summary]:pr-3',
  '[&_>_summary]:pb-[11px] [&_>_summary]:pl-3 [&_>_summary]:text-[length:11px]',
  '[&_>_summary]:cursor-pointer [&_>_summary]:[list-style:none]',
  '[&_>_summary::-webkit-details-marker]:hidden [&_strong]:font-mono [&_strong]:text-[length:11px]',
  '[&_svg]:text-brand [&_svg]:shrink-0 [&_>_summary_>_span]:text-muted-ink',
  '[&_>_summary_>_span]:ml-auto [&_>_summary_>_span]:text-[length:9px] [&_>_div]:pt-0 [&_>_div]:pr-3',
  '[&_>_div]:pb-[11px] [&_>_div]:pl-3 [&_>_div]:flex [&_>_div]:flex-col [&_>_div]:gap-[5px]',
  '[&_>_div]:text-[length:9px] [&_>_div]:text-muted-ink [&_code]:text-[length:9px]',
  '[&_code]:[overflow-wrap:anywhere]',
  "[[class~='group/publish-intake-body']_&_>_summary]:text-[length:12px]",
  "[[class~='group/publish-intake-body']_&_>_summary]:pt-[13px]",
  "[[class~='group/publish-intake-body']_&_>_summary]:pr-[13px]",
  "[[class~='group/publish-intake-body']_&_>_summary]:pb-[13px]",
  "[[class~='group/publish-intake-body']_&_>_summary]:pl-[13px]",
  "[[class~='group/publish-intake-body']_&_>_summary_>_span]:text-[length:11px]",
);

export const intakePublishedStyles = cn(
  'group/intake-published flex flex-col items-start gap-[13px] pt-5.5 pr-5.5 pb-5.5 pl-5.5',
  'bg-brand-soft rounded-[12px] [&_>_svg]:text-brand [&_h4]:text-[length:15px]',
  '[&_p]:text-[length:12px] [&_p]:leading-[1.9] [&_p]:text-muted-ink',
  "[&_[class~='group/btn']]:text-[length:12px] [&_[class~='group/text-btn']]:text-[length:11px]",
);

export const intakeHistoryPanelStyles = cn(
  'group/intake-history-panel min-w-0 [container-type:inline-size]',
  "[&_[class~='group/panel-heading']_h2]:flex [&_[class~='group/panel-heading']_h2]:items-center",
  "[&_[class~='group/panel-heading']_h2]:gap-2",
  "[&_[class~='group/query-content']_>_[class~='group/empty']]:pt-8",
  "[&_[class~='group/query-content']_>_[class~='group/empty']]:pr-4",
  "[&_[class~='group/query-content']_>_[class~='group/empty']]:pb-8",
  "[&_[class~='group/query-content']_>_[class~='group/empty']]:pl-4",
  "[&_[class~='group/table-pagination']]:mt-2 [&_[class~='group/table-pagination']]:px-0",
  "[&_[class~='group/table-pagination']]:pb-0 [&_[class~='group/table-pagination']]:bg-transparent",
);

export const intakeHistoryFiltersStyles = cn(
  'group/intake-history-filters [--intake-filter-height:36px] flex items-center gap-2 mb-3.5',
  '[@container_(max-width:_460px)]:flex-wrap',
  '[@media_(pointer:_coarse)_and_(max-width:_760px)]:[--intake-filter-height:44px]',
  "[&_[class~='group/btn']]:h-[var(--intake-filter-height)]",
  "[&_[class~='group/btn']]:min-h-[var(--intake-filter-height)] [&_[class~='group/btn']]:pt-0",
  "[&_[class~='group/btn']]:pr-3 [&_[class~='group/btn']]:pb-0 [&_[class~='group/btn']]:pl-3",
  "[&_[class~='group/btn']]:text-[length:12px] [&_[class~='group/btn']]:leading-[1.5]",
  "[&_[class~='group/hub-select']]:w-[135px] [&_[class~='group/hub-select']]:shrink-0",
  "[@container_(max-width:_460px)]:[&_[class~='group/hub-select']]:w-full",
  "[&_[class~='group/hub-select-trigger']]:h-[var(--intake-filter-height)]",
  "[&_[class~='group/hub-select-trigger']]:min-h-[var(--intake-filter-height)]",
  "[&_[class~='group/hub-select-trigger']]:pt-0 [&_[class~='group/hub-select-trigger']]:pr-3",
  "[&_[class~='group/hub-select-trigger']]:pb-0 [&_[class~='group/hub-select-trigger']]:pl-3",
  "[&_[class~='group/hub-select-trigger']]:text-[length:12px]",
  "[&_[class~='group/hub-select-trigger']]:leading-[1.5]",
);

export const intakeHistorySearchStyles = cn(
  "[[class~='group/intake-history-filters']_&]:flex",
  "[[class~='group/intake-history-filters']_&]:flex-row",
  "[[class~='group/intake-history-filters']_&]:items-center",
  "[[class~='group/intake-history-filters']_&]:gap-2",
  "[[class~='group/intake-history-filters']_&]:flex-1",
  "[[class~='group/intake-history-filters']_&]:min-w-0",
  "[[class~='group/intake-history-filters']_&]:h-[var(--intake-filter-height)]",
  "[[class~='group/intake-history-filters']_&]:pt-0",
  "[[class~='group/intake-history-filters']_&]:pr-2.5",
  "[[class~='group/intake-history-filters']_&]:pb-0",
  "[[class~='group/intake-history-filters']_&]:pl-2.5",
  "[[class~='group/intake-history-filters']_&]:border [[class~='group/intake-history-filters']_&]:border-solid [[class~='group/intake-history-filters']_&]:border-[color:var(--line)]",
  "[[class~='group/intake-history-filters']_&]:rounded-[10px]",
  "[[class~='group/intake-history-filters']_&]:bg-paper",
  "[[class~='group/intake-history-filters']_&]:text-muted-ink",
  "[[class~='group/intake-history-filters']_&]:text-[length:12px]",
  "[[class~='group/intake-history-filters']_&]:font-normal",
  "[[class~='group/intake-history-filters']_&]:leading-[1.5]",
  "[[class~='group/intake-history-filters']_&]:[transition:border-color_120ms,_box-shadow_120ms]",
  "[&_>_svg]:shrink-0 [[class~='group/intake-history-filters']_&_>_input[type='search']]:min-w-0",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:min-h-0",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:w-full",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:h-full",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:pt-0",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:pr-0",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:pb-0",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:pl-0",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:bg-transparent",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:border-0",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:rounded-none",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:text-ink",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:[font:inherit]",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:[outline:0]",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']]:[box-shadow:none]",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']:focus-visible]:border-0",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']:focus-visible]:[outline:0]",
  "[[class~='group/intake-history-filters']_&_>_input[type='search']:focus-visible]:[box-shadow:none]",
  "[@container_(max-width:_460px)]:[[class~='group/intake-history-filters']_&]:basis-[calc(100%_-_65px)]",
  "[@media_(pointer:_coarse)_and_(max-width:_760px)]:[[class~='group/intake-history-filters']_&]:text-[length:17px]",
  '[&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-solid [&:has(:focus-visible)]:outline-muted-ink [&:has(:focus-visible)]:outline-offset-2',
);

export const intakeHistoryScrollStyles = cn(
  'max-h-[min(520px,_58vh)] overflow-y-auto [scrollbar-width:thin] [scroll-padding:8px]',
  'focus-visible:[outline:2px_solid_var(--brand)] focus-visible:[outline-offset:2px]',
);

export const intakeListFootStyles = cn(
  'flex items-start gap-[7px] text-[length:12px] text-muted-ink border-t [border-top-style:solid] border-t-[color:var(--line)]',
  'pt-4.5 mt-4 leading-[1.7] [&_svg]:shrink-0 [&_svg]:mt-0.5',
);

export const publishIntakeHeaderStyles = cn(
  'group/publish-intake-header flex items-center justify-between pt-[23px] pr-6.5 pb-[23px] pl-6.5',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] shrink-0 [&_h2]:text-[length:21px] [&_h2]:mt-[5px]',
  '[&_h2]:[font-weight:550] max-[600px]:pt-[19px] max-[600px]:pr-4.5 max-[600px]:pb-[19px]',
  'max-[600px]:pl-4.5 max-[600px]:[&_h2]:text-[length:19px]',
  "[&_[class~='group/eyebrow']]:text-[length:9px]",
);

export const publishIntakeBodyStyles = cn(
  'group/publish-intake-body flex-1 min-h-0 overflow-auto pt-6 pr-6.5 pb-6 pl-6.5 max-[600px]:pt-5',
  'max-[600px]:pr-4.5 max-[600px]:pb-5 max-[600px]:pl-4.5',
  "[&_[class~='group/intake-detail']_form_>_[class~='group/btn-primary']]:static",
  "[&_[class~='group/intake-detail']_form_>_[class~='group/btn-primary']]:[box-shadow:none]",
  "[&_[class~='group/intake-detail']_form_>_[class~='group/btn-primary']]:min-h-[43px]",
  "[&_[class~='group/intake-detail']_form_>_[class~='group/btn-primary']]:text-[length:12px]",
  "[&_[class~='group/intake-detail']_h3_[class~='group/tag']]:font-sans",
  "[&_[class~='group/intake-detail']_h3_[class~='group/tag']]:text-[length:11px]",
  "[&_[class~='group/intake-detail']_[class~='group/notice']]:text-[length:12px]",
  "[&_[class~='group/intake-detail']_[class~='group/notice']]:leading-[1.9]",
);

export const intakeHistoryRowStyles = cn(
  'group/intake-history-row grid grid-cols-[42px_minmax(0,_1fr)_auto_14px] items-center gap-3 w-full',
  'pt-[13px] pr-2 pb-[13px] pl-2 border-b [border-bottom-style:solid] border-b-[color:var(--line)] bg-transparent text-ink',
  'text-left [&:last-child]:border-b-0 hover:bg-brand-soft',
  "[&[class~='group/active']]:bg-brand-soft focus-visible:bg-brand-soft",
  'focus-visible:[outline-offset:-2px]',
  '[@container_(max-width:_460px)]:grid-cols-[36px_minmax(0,_1fr)_14px]',
  '[@container_(max-width:_460px)]:gap-[6px_9px]',
);

export const intakeContentGlyphStyles = cn(
  'grid [place-items:center] w-10.5 h-10.5 border border-solid border-[color:var(--line)] rounded-[11px] bg-paper',
  '[@container_(max-width:_460px)]:w-9 [@container_(max-width:_460px)]:h-9',
  '[@container_(max-width:_460px)]:[align-self:center]',
  '[@container_(max-width:_460px)]:[grid-row:1_/_3]',
);

export const intakeHistoryMainStyles = 'min-w-0 flex flex-col gap-[5px]';

export const intakeHistoryTitleStyles = cn(
  'flex flex-wrap items-center gap-[4px_8px] [&_strong]:text-[length:12px] [&_strong]:leading-[1.5]',
  '[&_strong]:[overflow-wrap:anywhere]',
);

export const intakeKindStyles = cn(
  'text-[length:11px] text-muted-ink border border-solid border-[color:var(--line)] rounded-[5px] pt-0 pr-1 pb-0',
  'pl-1',
);

export const intakeHistoryMetaStyles = cn(
  'flex flex-wrap items-center gap-[4px_8px] text-muted-ink text-[length:11px] leading-[1.5]',
  '[overflow-wrap:anywhere] [&_>_span]:inline-flex [&_>_span]:items-center [&_>_span]:gap-1',
  '[&_svg]:shrink-0',
);

export const intakeHistoryErrorStyles = cn(
  'text-danger text-[length:11px] leading-[1.5] [display:-webkit-box] [-webkit-line-clamp:2]',
  '[-webkit-box-orient:vertical] overflow-hidden [overflow-wrap:anywhere]',
);

export const intakeHistoryPhaseStyles =
  'text-muted-ink text-[length:11px] leading-[1.5] [overflow-wrap:anywhere]';

export const intakeHistoryDigestStyles =
  'text-muted-ink text-[length:11px] leading-[1.5] [overflow-wrap:anywhere]';

export const intakeHistoryStatusStyles = cn(
  "[[class~='group/intake-history-row'][data-status='approved']_&]:text-success",
  "[[class~='group/intake-history-row'][data-status='processing']_&]:text-info",
  "[[class~='group/intake-history-row'][data-status='pending']_&]:text-warning",
  "[[class~='group/intake-history-row'][data-status='blocked']_&]:text-danger",
  'inline-flex items-center gap-[5px] text-[length:11px] whitespace-nowrap text-brand',
  "[&[class~='group/is-error']]:text-danger [&_>_svg]:shrink-0",
  "[[class~='group/intake-history-row'][data-status='stale']_&]:text-muted-ink",
  "[[class~='group/intake-history-row'][data-status='cancelled']_&]:text-muted-ink",
  '[@container_(max-width:_460px)]:[grid-column:2]',
);

export const isErrorStyles = 'group/is-error';

export const intakeRowArrowStyles = cn(
  'text-muted-ink shrink-0',
  "[@container_(max-width:_460px)]:[[class~='group/intake-history-row']_&]:[grid-column:3]",
  "[@container_(max-width:_460px)]:[[class~='group/intake-history-row']_&]:[grid-row:1_/_3]",
);

export const intakeProgressStyles = cn(
  'group/intake-progress border border-solid border-[color:var(--line)] rounded-[14px] overflow-hidden shrink-0',
  'bg-paper',
);

export const isStoppedStyles = 'group/is-stopped';

export const intakeProgressHeadingStyles = cn(
  'flex items-start gap-3.5 pt-[23px] pr-5.5 pb-4.5 pl-5.5 bg-brand-soft max-[600px]:pl-4',
  'max-[600px]:pr-4 max-[600px]:gap-2.5',
);

export const intakeProgressSymbolStyles = cn(
  'grid [place-items:center] w-11 h-11 border border-solid border-[color:var(--line)] rounded-[12px] text-brand',
  "shrink-0 [[class~='group/intake-progress'][class~='group/is-stopped']_&]:text-danger",
  "[[class~='group/intake-progress'][class~='group/is-stopped']_&]:border-t-[color:var(--danger)]",
  "[[class~='group/intake-progress'][class~='group/is-stopped']_&]:border-r-[color:var(--danger)]",
  "[[class~='group/intake-progress'][class~='group/is-stopped']_&]:border-b-[color:var(--danger)]",
  "[[class~='group/intake-progress'][class~='group/is-stopped']_&]:border-l-[color:var(--danger)]",
);

export const isProcessingStyles = cn(
  '[&_>_svg]:[animation:intake-progress-spin_1.6s_linear_infinite]',
  'motion-reduce:[&_>_svg]:[animation:none]',
);

export const intakeProgressSummaryStyles = cn(
  "group/intake-progress-summary min-w-0 [[class~='group/intake-detail']_&_h4]:text-[length:17px]",
  "[[class~='group/intake-detail']_&_h4]:leading-[1.6] [[class~='group/intake-detail']_&_h4]:mt-1",
  "[[class~='group/intake-detail']_&_h4]:mr-0 [[class~='group/intake-detail']_&_h4]:mb-1",
  "[[class~='group/intake-detail']_&_h4]:ml-0 [&_p]:text-[length:12px] [&_p]:leading-[1.8]",
  "[&_p]:text-muted-ink max-[600px]:[[class~='group/intake-detail']_&_h4]:text-[length:15px]",
  "[&_[class~='group/eyebrow']]:text-[length:9px]",
);

export const intakeProgressMetaStyles = cn(
  'grid grid-cols-[minmax(0,_1fr)_minmax(0,_1fr)] gap-4 pt-4 pr-5.5 pb-4 pl-5.5',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] [&_dt]:text-[length:11px] [&_dt]:text-muted-ink',
  '[&_dt]:mb-1.5 [&_dd]:flex [&_dd]:items-center [&_dd]:gap-1.5 [&_dd]:font-mono',
  '[&_dd]:text-[length:12px] [&_dd]:[overflow-wrap:anywhere] max-[600px]:pl-4 max-[600px]:pr-4',
);

export const intakeProgressStepsStyles = cn(
  'group/intake-progress-steps [list-style:none] pt-[23px] pr-5.5 pb-1 pl-5.5 mt-0 mr-0 mb-0 ml-0',
  '[&_li]:flex [&_li]:gap-3.5 [&_li]:relative [&_li]:pb-6',
  "[&_li:not(:last-child)::before]:[content:''] [&_li:not(:last-child)::before]:absolute",
  '[&_li:not(:last-child)::before]:left-3.5 [&_li:not(:last-child)::before]:top-8',
  '[&_li:not(:last-child)::before]:bottom-1 [&_li:not(:last-child)::before]:w-px',
  "[&_li:not(:last-child)::before]:bg-line [&_[data-state='active']_strong]:text-brand",
  'max-[600px]:pl-4 max-[600px]:pr-4',
);

export const intakeStepMarkerStyles = cn(
  'grid [place-items:center] w-[29px] h-[29px] border border-solid border-[color:var(--line)] rounded-[50%]',
  'font-mono text-[length:11px] text-muted-ink shrink-0',
  "[[class~='group/intake-progress-steps']_[data-state='active']_&]:bg-brand-soft",
  "[[class~='group/intake-progress-steps']_[data-state='active']_&]:text-brand",
  "[[class~='group/intake-progress-steps']_[data-state='active']_&]:border-t-[color:var(--brand)]",
  "[[class~='group/intake-progress-steps']_[data-state='active']_&]:border-r-[color:var(--brand)]",
  "[[class~='group/intake-progress-steps']_[data-state='active']_&]:border-b-[color:var(--brand)]",
  "[[class~='group/intake-progress-steps']_[data-state='active']_&]:border-l-[color:var(--brand)]",
  "[[class~='group/intake-progress-steps']_[data-state='complete']_&]:bg-brand-soft",
  "[[class~='group/intake-progress-steps']_[data-state='complete']_&]:text-brand",
  "[[class~='group/intake-progress-steps']_[data-state='complete']_&]:border-t-[color:var(--brand)]",
  "[[class~='group/intake-progress-steps']_[data-state='complete']_&]:border-r-[color:var(--brand)]",
  "[[class~='group/intake-progress-steps']_[data-state='complete']_&]:border-b-[color:var(--brand)]",
  "[[class~='group/intake-progress-steps']_[data-state='complete']_&]:border-l-[color:var(--brand)]",
  "[[class~='group/intake-progress-steps']_[data-state='failed']_&]:text-danger",
  "[[class~='group/intake-progress-steps']_[data-state='failed']_&]:border-t-[color:var(--danger)]",
  "[[class~='group/intake-progress-steps']_[data-state='failed']_&]:border-r-[color:var(--danger)]",
  "[[class~='group/intake-progress-steps']_[data-state='failed']_&]:border-b-[color:var(--danger)]",
  "[[class~='group/intake-progress-steps']_[data-state='failed']_&]:border-l-[color:var(--danger)]",
  "[[class~='group/intake-progress-steps']_[data-state='active']_&_>_svg]:[animation:intake-progress-spin_1.6s_linear_infinite]",
  "motion-reduce:[[class~='group/intake-progress-steps']_[data-state='active']_&_>_svg]:[animation:none]",
);

export const intakeStepContentStyles = cn(
  'flex-1 min-w-0 pt-[3px] [&_>_div]:flex [&_>_div]:items-center [&_>_div]:justify-between',
  '[&_>_div]:gap-3 [&_strong]:text-[length:12px] [&_strong]:[font-weight:550]',
  '[&_>_div_>_span]:text-[length:11px] [&_>_div_>_span]:text-muted-ink',
  '[&_>_div_>_span]:whitespace-nowrap [&_p]:text-[length:11px] [&_p]:leading-[1.8]',
  '[&_p]:text-muted-ink [&_p]:mt-1.5 [&_time]:block [&_time]:text-[length:11px] [&_time]:font-mono',
  '[&_time]:text-muted-ink [&_time]:mt-[7px]',
  "[[class~='group/intake-progress-steps']_[data-state='active']_&_>_div_>_span]:text-brand",
);

export const intakeProgressNextStyles = cn(
  '[&_span]:text-[length:12px] [&_span]:leading-[1.8] [&_span]:text-muted-ink flex gap-2.5 pt-4',
  'pr-5.5 pb-4 pl-5.5 border-t [border-top-style:solid] border-t-[color:var(--line)] [&_>_svg]:text-brand [&_>_svg]:mt-0.5',
  '[&_>_svg]:shrink-0 [&_p]:flex [&_p]:flex-col [&_p]:gap-[5px] [&_strong]:text-[length:12px]',
  '[&_strong]:[font-weight:550] max-[600px]:pl-4 max-[600px]:pr-4',
);

export const intakeProgressWaitStyles =
  'pt-0 pr-5.5 pb-4.5 pl-5.5 text-[length:11px] leading-[1.8] text-muted-ink';

export const intakeScanReportStyles = cn(
  'border border-solid border-[color:var(--line)] rounded-[9px] overflow-hidden bg-page shrink-0 [&_>_small]:block',
  '[&_>_small]:text-[length:11px] [&_>_small]:text-muted-ink [&_>_small]:pt-0 [&_>_small]:pr-3',
  '[&_>_small]:pb-3 [&_>_small]:pl-3',
);

export const intakeScanTitleStyles = cn(
  'flex items-center gap-[7px] text-brand pt-[11px] pr-3 pb-[11px] pl-3 text-[length:11px]',
  '[&_strong]:[font-weight:550] [&_small]:ml-auto [&_small]:text-[length:9px]',
  "[&_small]:text-muted-ink [[class~='group/publish-intake-body']_&]:pt-[13px]",
  "[[class~='group/publish-intake-body']_&]:pr-[13px]",
  "[[class~='group/publish-intake-body']_&]:pb-[13px]",
  "[[class~='group/publish-intake-body']_&]:pl-[13px]",
  "[[class~='group/publish-intake-body']_&]:text-[length:12px]",
);

export const intakeScanRiskStyles = cn(
  'group/intake-scan-risk flex items-start gap-2 pt-3 pr-3 pb-3 pl-3',
  'border-t [border-top-style:solid] border-t-[color:var(--line)] [background:color-mix(in_srgb,_var(--warning),_transparent_97%)]',
  '[&_>_div]:min-w-0 [&_>_div]:flex-1 [&_code]:block [&_code]:text-[length:9px]',
  '[&_code]:[overflow-wrap:anywhere] [&_code]:text-muted-ink [&_code]:leading-[1.8]',
  '[&_p]:text-[length:11px] [&_p]:text-muted-ink [&_p]:leading-[1.9] [&_p]:mt-[5px]',
  "[[class~='group/publish-intake-body']_&_code]:text-[length:11px]",
  "[[class~='group/publish-intake-body']_&_p]:text-[length:11px]",
  "[&_[class~='group/tag']]:text-[length:9px] [&_[class~='group/tag']]:whitespace-nowrap",
  "[&_[class~='group/tag']]:[background:color-mix(in_srgb,_var(--warning),_transparent_89%)]",
  "[&_[class~='group/tag']]:text-warning",
  "[&[class~='group/block']_[class~='group/tag']]:[background:color-mix(in_srgb,_var(--danger),_transparent_90%)]",
  "[&[class~='group/block']_[class~='group/tag']]:text-danger",
);

export const intakeScanInfoStyles = cn(
  'border-t [border-top-style:solid] border-t-[color:var(--line)] text-muted-ink text-[length:11px] [&_>_summary]:pt-2.5',
  '[&_>_summary]:pr-3 [&_>_summary]:pb-2.5 [&_>_summary]:pl-3 [&_>_summary]:cursor-pointer',
  '[&_>_div]:max-h-45 [&_>_div]:overflow-auto [&_>_div]:pt-0 [&_>_div]:pr-3 [&_>_div]:pb-[9px]',
  '[&_>_div]:pl-3 [&_p]:pt-2 [&_p]:pr-0 [&_p]:pb-2 [&_p]:pl-0',
  '[&_p]:border-t [&_p]:[border-top-style:solid] [&_p]:border-t-[color:var(--line)] [&_p]:flex [&_p]:flex-col [&_p]:gap-1',
  '[&_p]:leading-[1.7] [&_code]:text-[length:9px] [&_code]:[overflow-wrap:anywhere]',
);

export const mcpEntryFieldsStyles = 'flex flex-col gap-[var(--space-4)] min-w-0';

export const optionalLabelStyles = 'inline text-muted-ink text-caption font-normal';

export const policyFieldsStyles = cn(
  '[&_>_small]:text-muted-ink [&_>_small]:font-normal [&_>_small]:leading-[1.7]',
  '[&_>_small]:text-caption flex flex-col gap-4',
  "[[class~='group/publish-page']_[class~='group/intake-detail']_&]:gap-[13px]",
  "[[class~='group/publish-page']_[class~='group/intake-detail']_&_>_small]:text-[length:11px]",
  "[[class~='group/publish-intake-body']_[class~='group/intake-detail']_&_>_small]:text-[length:11px]",
);

export const publishPageStyles = cn(
  "group/publish-page [&_[role='radiogroup']]:[align-self:flex-start] [&_label]:text-label",
  '[&_label]:leading-[1.5] [&_label]:gap-[var(--space-2)]',
  "[&_[class~='group/upload-zone']_>_[class~='group/btn']]:min-h-8.5",
  "[&_[class~='group/upload-zone']_>_[class~='group/btn']]:pt-1.5",
  "[&_[class~='group/upload-zone']_>_[class~='group/btn']]:pr-3",
  "[&_[class~='group/upload-zone']_>_[class~='group/btn']]:pb-1.5",
  "[&_[class~='group/upload-zone']_>_[class~='group/btn']]:pl-3",
  "[&_[class~='group/upload-zone']_>_[class~='group/btn']]:text-[length:11px]",
  "[&_[class~='group/intake-detail']_form_>_[class~='group/btn-primary']]:sticky",
  "[&_[class~='group/intake-detail']_form_>_[class~='group/btn-primary']]:bottom-0",
  "[&_[class~='group/intake-detail']_form_>_[class~='group/btn-primary']]:z-[1]",
  "[&_[class~='group/intake-detail']_form_>_[class~='group/btn-primary']]:[box-shadow:0_-8px_16px_var(--paper)]",
  "[&_[class~='group/intake-detail']_form_>_[class~='group/btn-primary']]:min-h-[39px]",
  "max-[600px]:[&_[class~='group/intake-detail']_form_>_[class~='group/btn-primary']]:static",
  "[&_[class~='group/upload-form']_>_[class~='group/btn-primary']]:min-h-11",
  "[&_[class~='group/panel']]:pt-5.5 [&_[class~='group/panel']]:pr-5.5",
  "[&_[class~='group/panel']]:pb-5.5 [&_[class~='group/panel']]:pl-5.5",
  "max-[1000px]:[&_[class~='group/panel']]:pt-[19px]",
  "max-[1000px]:[&_[class~='group/panel']]:pr-[19px]",
  "max-[1000px]:[&_[class~='group/panel']]:pb-[19px]",
  "max-[1000px]:[&_[class~='group/panel']]:pl-[19px] max-[600px]:[&_[class~='group/panel']]:pt-4.5",
  "max-[600px]:[&_[class~='group/panel']]:pr-4.5 max-[600px]:[&_[class~='group/panel']]:pb-4.5",
  "max-[600px]:[&_[class~='group/panel']]:pl-4.5",
  "[&_[class~='group/publish-layout']_>_[class~='group/form-stack']_>_[class~='group/panel']]:pt-[var(--panel-space)]",
  "[&_[class~='group/publish-layout']_>_[class~='group/form-stack']_>_[class~='group/panel']]:pr-[var(--panel-space)]",
  "[&_[class~='group/publish-layout']_>_[class~='group/form-stack']_>_[class~='group/panel']]:pb-[var(--panel-space)]",
  "[&_[class~='group/publish-layout']_>_[class~='group/form-stack']_>_[class~='group/panel']]:pl-[var(--panel-space)]",
  "[&_[class~='group/publish-layout']_>_[class~='group/form-stack']_>_[class~='group/panel']]:flex",
  "[&_[class~='group/publish-layout']_>_[class~='group/form-stack']_>_[class~='group/panel']]:flex-col",
  "max-[760px]:[&_[class~='group/publish-layout']_>_[class~='group/form-stack']_>_[class~='group/panel']]:pt-5",
  "max-[760px]:[&_[class~='group/publish-layout']_>_[class~='group/form-stack']_>_[class~='group/panel']]:pr-5",
  "max-[760px]:[&_[class~='group/publish-layout']_>_[class~='group/form-stack']_>_[class~='group/panel']]:pb-5",
  "max-[760px]:[&_[class~='group/publish-layout']_>_[class~='group/form-stack']_>_[class~='group/panel']]:pl-5",
  "[&_[class~='group/publish-layout']_>_[class~='group/form-stack']]:grid",
  "[&_[class~='group/publish-layout']_>_[class~='group/form-stack']]:grid-cols-[minmax(0,_1.05fr)_minmax(0,_0.95fr)]",
  "[&_[class~='group/publish-layout']_>_[class~='group/form-stack']]:items-start",
  "[&_[class~='group/publish-layout']_>_[class~='group/form-stack']]:gap-[var(--section-gap)]",
  "[&_[class~='group/form-stack']]:gap-4",
  "max-[1000px]:[&_[class~='group/publish-layout']_>_[class~='group/form-stack']]:gap-[17px]",
  "max-[1000px]:[&_[class~='group/publish-layout']_>_[class~='group/form-stack']]:grid-cols-[1fr_1fr]",
  "max-[760px]:[&_[class~='group/publish-layout']_>_[class~='group/form-stack']]:grid-cols-[1fr]",
  "max-[600px]:[&_[class~='group/form-stack']]:gap-4",
  "max-[1100px]:[&_[class~='group/publish-layout']_>_[class~='group/form-stack']]:grid-cols-[minmax(0,_1fr)]",
  "max-[1000px]:[&_[class~='group/form-row']]:grid-cols-[1fr]",
  "max-[1000px]:[&_[class~='group/form-row']]:gap-[13px]",
  "max-[760px]:[&_[class~='group/form-row']]:grid-cols-[1fr_1fr]",
  "max-[600px]:[&_[class~='group/form-row']]:grid-cols-[1fr]",
  "[&_[class~='group/panel-heading']]:mb-[var(--space-4)]",
  "[&_[class~='group/panel-heading']_p]:text-label",
  "[&_[class~='group/panel-heading']_p]:leading-[1.8]",
  "max-[600px]:[&_[class~='group/panel-heading']]:mb-4",
  "[&_[class~='group/panel-heading']_h2]:text-section",
  "max-[760px]:[&_[class~='group/panel-heading']_h2]:text-[length:17px]",
  "[&_[class~='group/intake-detail']_[class~='group/notice']]:text-[length:11px]",
  "[&_[class~='group/intake-detail']_[class~='group/notice']]:pt-2.5",
  "[&_[class~='group/intake-detail']_[class~='group/notice']]:pr-3",
  "[&_[class~='group/intake-detail']_[class~='group/notice']]:pb-2.5",
  "[&_[class~='group/intake-detail']_[class~='group/notice']]:pl-3",
  "[&>nav[class~='group/page-tabs']]:mb-[var(--section-gap)]",
  "[&_[class~='group/page-tabs']_>_button]:py-3",
);

export const uploadZoneStyles = cn(
  'group/upload-zone relative pt-8.5 pr-5 pb-8.5 pl-5 flex flex-col items-center gap-3 text-center',
  'border border-dashed border-[color:color-mix(in_srgb,_var(--brand),_var(--line)_65%)] rounded-[13px] bg-page',
  "[&[class~='group/over']]:bg-brand-soft [&[class~='group/over']]:border-t-[color:var(--brand)]",
  "[&[class~='group/over']]:border-r-[color:var(--brand)]",
  "[&[class~='group/over']]:border-b-[color:var(--brand)]",
  "[&[class~='group/over']]:border-l-[color:var(--brand)] [&_>_strong]:text-[length:12px]",
  '[&_>_strong]:[overflow-wrap:anywhere] [&_>_span]:text-[length:11px] [&_>_span]:text-muted-ink',
  'max-[600px]:pt-[25px] max-[600px]:pr-3.5 max-[600px]:pb-[25px] max-[600px]:pl-3.5',
  "max-[600px]:[&_>_strong]:text-[length:12px] [[class~='group/publish-page']_&]:pt-6",
  "[[class~='group/publish-page']_&]:pr-[17px] [[class~='group/publish-page']_&]:pb-6",
  "[[class~='group/publish-page']_&]:pl-[17px] [[class~='group/publish-page']_&]:gap-2.5",
  "[[class~='group/publish-page']_&]:min-h-43.5 [[class~='group/publish-page']_&_>_strong]:text-body",
  "[[class~='group/publish-page']_&_>_span]:text-[length:12px]",
  "max-[1000px]:[[class~='group/publish-page']_&]:pt-5",
  "max-[1000px]:[[class~='group/publish-page']_&]:pr-[13px]",
  "max-[1000px]:[[class~='group/publish-page']_&]:pb-5",
  "max-[1000px]:[[class~='group/publish-page']_&]:pl-[13px]",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&]:min-h-43",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&]:pt-4",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&]:pr-4",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&]:pb-4",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&]:pl-4",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&]:gap-1.5",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&[class~='group/has-file']]:flex-row",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&[class~='group/has-file']]:gap-[var(--space-3)]",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&[class~='group/has-file']]:min-h-20",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&[class~='group/has-file']]:text-left",
  "[&[class~='group/has-file']_>_svg]:shrink-0 [&[class~='group/has-file']_>_svg]:text-brand",
);

export const hasFileStyles = 'group/has-file';

export const overStyles = 'group/over';

export const fileInputStyles = 'absolute! w-px! h-px! opacity-0 pt-0! pr-0! pb-0! pl-0! min-h-0!';

export const selectedUploadFileStyles = cn(
  'flex-1 min-w-0 [&_strong]:block [&_strong]:[overflow-wrap:anywhere] [&_strong]:leading-[1.6]',
  '[&_strong]:text-body [&_span]:block [&_span]:[overflow-wrap:anywhere] [&_span]:leading-[1.6]',
  '[&_span]:text-muted-ink [&_span]:text-caption',
);

export const uploadIconStyles = cn(
  'bg-paper border border-solid border-[color:var(--line)] rounded-[13px] flex pt-[13px] pr-[13px] pb-[13px]',
  "pl-[13px] text-brand! [[class~='group/publish-page']_&]:pt-2.5",
  "[[class~='group/publish-page']_&]:pr-2.5 [[class~='group/publish-page']_&]:pb-2.5",
  "[[class~='group/publish-page']_&]:pl-2.5",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&]:pt-2",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&]:pr-2",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&]:pb-2",
  "[[class~='group/publish-page']_[class~='group/upload-form']_&]:pl-2",
);

export const publishLayoutStyles = cn(
  'group/publish-layout grid grid-cols-[minmax(0,_1fr)_300px] gap-[35px]',
  'max-[1100px]:grid-cols-[minmax(0,_1fr)_250px] max-[1100px]:gap-6 max-[850px]:grid-cols-[1fr]',
  "[[class~='group/publish-page']_&]:block",
);

export const uploadFormStyles = cn(
  "group/upload-form [[class~='group/publish-page']_&_[role='radio']]:text-[length:12px]",
  "max-[1000px]:[[class~='group/publish-page']_&_[role='radio']]:text-[length:11px]",
  "max-[1000px]:[[class~='group/publish-page']_&_[role='radio']]:pl-2.5",
  "max-[1000px]:[[class~='group/publish-page']_&_[role='radio']]:pr-2.5",
  "[[class~='group/publish-page']_&]:gap-[var(--space-4)]",
  "[[class~='group/publish-page']_&]:[align-content:start] [[class~='group/publish-page']_&]:block",
  '[&_textarea]:min-h-20 [&_textarea]:[resize:vertical]',
);

export const uploadFieldsStyles = cn(
  'group/upload-fields flex flex-col gap-[var(--space-5)] min-w-0 mt-0 mr-0 mb-0 ml-0 pt-0 pr-0 pb-0',
  "pl-0 border-0 max-[520px]:[&_[role='radiogroup']]:w-full max-[520px]:[&_[role='radio']]:flex-1",
  "[&_>_[class~='group/btn-primary']]:min-h-11",
);

export const uploadTargetRowStyles = cn(
  'flex flex-wrap items-center justify-between gap-[var(--space-4)]',
  "[&[data-target='existing']]:flex-col [&[data-target='existing']]:items-stretch",
);

export const uploadSourceStyles = 'flex flex-col gap-[var(--space-4)] min-w-0';

export const uploadFileSummaryStyles = cn(
  'mt-[var(--space-1)] mr-0 mb-0 ml-0 text-muted-ink text-caption leading-[1.7]',
  '[overflow-wrap:anywhere]',
);

export const uploadMetadataStyles =
  'flex flex-col gap-[var(--space-4)] min-w-0 pt-[var(--space-5)] border-t [border-top-style:solid] border-t-[color:var(--line)]';

export const uploadSectionHeadingStyles = cn(
  '[&_h3]:mt-0 [&_h3]:mr-0 [&_h3]:mb-0 [&_h3]:ml-0 [&_h3]:text-[length:15px]',
  '[&_p]:mt-[var(--space-1)] [&_p]:mr-0 [&_p]:mb-0 [&_p]:ml-0 [&_p]:text-muted-ink',
  '[&_p]:text-caption [&_p]:leading-[1.7] [&_p]:[overflow-wrap:anywhere]',
);

export const uploadIdentityRowStyles = cn(
  'grid grid-cols-[minmax(0,_1fr)_minmax(0,_150px)] gap-[var(--space-4)]',
  '[&:has(>_label:only-child)]:grid-cols-[minmax(0,_1fr)] max-[520px]:grid-cols-[minmax(0,_1fr)]',
);

export const mcpDocumentPreviewStyles = cn(
  'min-w-0 text-muted-ink text-caption [&_summary]:cursor-pointer [&_summary]:py-[var(--space-2)]',
  '[&_pre]:max-h-65 [&_pre]:mt-[var(--space-2)] [&_pre]:overflow-auto [&_pre]:pt-[var(--space-3)]',
  '[&_pre]:pr-[var(--space-3)] [&_pre]:pb-[var(--space-3)] [&_pre]:pl-[var(--space-3)]',
  '[&_pre]:bg-page [&_pre]:border [&_pre]:border-solid [&_pre]:border-[color:var(--line)] [&_pre]:rounded-[10px]',
  '[&_pre]:leading-[1.6]',
);
