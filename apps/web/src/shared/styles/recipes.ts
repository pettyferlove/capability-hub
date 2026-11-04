import { cn } from './cn.js';

export const pageContentStyles =
  'min-w-0 has-[[data-connection-consent]]:flex has-[[data-connection-consent]]:flex-1';

export const brandStyles = cn(
  'group/brand inline-flex items-center gap-2.5 text-ink text-[length:17px] [font-weight:650]',
  'tracking-[-0.5px] shrink-0 leading-[1.3] [&_small]:block [&_small]:text-[length:11px]',
  '[&_small]:font-normal [&_small]:tracking-[2px] [&_small]:text-muted-ink [&_small]:mt-[5px]',
  'max-[600px]:text-[length:15px] max-[600px]:[&_small]:text-[length:9px]',
);

export const activeStyles = 'group/active';

export const iconBtnStyles = cn(
  'inline-flex items-center justify-center w-8.5 h-8.5 border-0 bg-transparent text-muted-ink',
  'rounded-[8px] text-[length:25px] [&:not(:disabled):hover]:bg-brand-soft',
  '[&:not(:disabled):hover]:text-brand group/icon-btn',
  '[&:not(:disabled)]:[transition:background-color_var(--duration-fast),_border-color_var(--duration-fast),_box-shadow_var(--duration-fast),_transform_var(--duration-fast)]',
  '[&:not(:disabled):active]:[transform:scale(0.98)]',
  'motion-reduce:[&:not(:disabled):active]:[transform:none] disabled:opacity-[0.5]',
  'disabled:cursor-not-allowed',
);

export const btnStyles = cn(
  'inline-flex items-center justify-center gap-2 pt-[9px] pr-4 pb-[9px] pl-4',
  'border border-solid border-[color:var(--line)] bg-paper text-ink rounded-[10px] text-[length:12px] font-medium',
  'whitespace-nowrap min-h-10 [text-decoration:none] [transition:background_0.18s,_transform_0.18s]',
  'leading-[1.5] [&:not(:disabled):hover]:bg-brand-soft',
  '[&:not(:disabled):hover]:border-t-[color:var(--brand)]',
  '[&:not(:disabled):hover]:border-r-[color:var(--brand)]',
  '[&:not(:disabled):hover]:border-b-[color:var(--brand)]',
  '[&:not(:disabled):hover]:border-l-[color:var(--brand)]',
  '[&:not(:disabled):active]:[transform:scale(0.98)]',
  "[[class~='group/source-actions']_>_&]:text-[length:11px]",
  "[[class~='group/source-actions']_>_&]:pt-2 [[class~='group/source-actions']_>_&]:pr-[11px]",
  "[[class~='group/source-actions']_>_&]:pb-2 [[class~='group/source-actions']_>_&]:pl-[11px]",
  "[[class~='group/source-actions']_>_&]:min-h-8.5",
  "max-[600px]:[[class~='group/source-actions']_&]:flex-1",
  "max-[600px]:[[class~='group/section-heading']_>_&]:text-[length:11px]",
  "max-[600px]:[[class~='group/section-heading']_>_&]:pt-2",
  "max-[600px]:[[class~='group/section-heading']_>_&]:pr-[11px]",
  "max-[600px]:[[class~='group/section-heading']_>_&]:pb-2",
  "max-[600px]:[[class~='group/section-heading']_>_&]:pl-[11px]",
  "max-[600px]:[[class~='group/review-actions']_>_&]:w-full group/btn",
  '[&:not(:disabled)]:[transition:background-color_var(--duration-fast),_border-color_var(--duration-fast),_box-shadow_var(--duration-fast),_transform_var(--duration-fast)]',
  'motion-reduce:[&:not(:disabled):active]:[transform:none] disabled:opacity-[0.5]',
  'disabled:cursor-not-allowed',
);

export const btnPrimaryStyles = cn(
  'bg-brand text-on-brand border-t-transparent border-r-transparent',
  'border-b-transparent border-l-transparent',
  '[&:not(:disabled):hover]:bg-brand-hover [&:not(:disabled):hover]:text-on-brand',
  '[&:not(:disabled):hover]:border-t-transparent',
  '[&:not(:disabled):hover]:border-r-transparent',
  '[&:not(:disabled):hover]:border-b-transparent',
  '[&:not(:disabled):hover]:border-l-transparent group/btn-primary',
);

export const dangerTextStyles = 'text-danger group/danger-text';

export const noticeErrorStyles = 'group/notice-error bg-danger-soft text-danger';

export const panelStyles = cn(
  'group/panel bg-paper border border-solid border-[color:var(--line)] rounded-[18px] pt-[var(--panel-space)]',
  'pr-[var(--panel-space)] pb-[var(--panel-space)] pl-[var(--panel-space)] min-w-0',
  '[&_>_h2]:mb-[var(--space-4)] [&_>_h3]:mb-[var(--space-4)] max-[850px]:pt-5.5 max-[850px]:pr-5.5',
  'max-[850px]:pb-5.5 max-[850px]:pl-5.5 max-[600px]:pt-[19px] max-[600px]:pr-[19px]',
  'max-[600px]:pb-[19px] max-[600px]:pl-[19px] max-[600px]:rounded-[13px] [&_h2]:text-section',
  '[&_h2]:leading-[1.4] [&_h3]:text-[length:15px] [&_h3]:leading-[1.5]',
  "[[class~='group/connect-layout']_>_&]:flex [[class~='group/connect-layout']_>_&]:flex-col",
  "[[class~='group/connect-layout']_>_&]:gap-[var(--space-4)]",
  "[&[class~='group/page-resource-error-card']]:flex",
  "[&[class~='group/page-resource-error-card']]:flex-col",
  "[&[class~='group/page-resource-error-card']]:items-center",
  "[&[class~='group/page-resource-error-card']]:gap-6",
  "[&[class~='group/page-resource-error-card']]:w-full",
  "[&[class~='group/page-resource-error-card']]:max-w-160",
  "[&[class~='group/page-resource-error-card']]:pt-[clamp(28px,_4vw,_48px)]",
  "[&[class~='group/page-resource-error-card']]:pr-[clamp(20px,_4vw,_40px)]",
  "[&[class~='group/page-resource-error-card']]:pb-[clamp(28px,_4vw,_48px)]",
  "[&[class~='group/page-resource-error-card']]:pl-[clamp(20px,_4vw,_40px)]",
  "[&[class~='group/page-resource-error-card']]:rounded-[20px]",
  "[&[class~='group/page-resource-error-card']]:[box-shadow:var(--shadow)]",
  "[&[class~='group/page-resource-error-card']]:text-center max-[760px]:pt-5 max-[760px]:pr-5",
  'max-[760px]:pb-5 max-[760px]:pl-5 max-[760px]:[&_h2]:text-[length:17px]',
  "[&[class~='group/form-stack']_>_h2]:mb-0 [&[class~='group/form-stack']_>_h3]:mb-0",
);

export const dotgridStyles =
  '[background-image:radial-gradient(var(--dot)_1px,_transparent_1.2px)] [background-size:18px_18px]';

export const desktopOnlyStyles = 'max-[600px]:hidden';

export const subtleStyles = cn(
  'text-muted-ink text-label leading-[1.65] group/subtle',
  "[[class~='group/connect-layout']_[class~='group/panel']_>_&]:mt-0",
  "[[class~='group/connect-layout']_[class~='group/panel']_>_&]:mr-0",
  "[[class~='group/connect-layout']_[class~='group/panel']_>_&]:mb-0",
  "[[class~='group/connect-layout']_[class~='group/panel']_>_&]:ml-0",
);

export const formStackStyles = cn(
  'group/form-stack flex flex-col gap-[var(--space-4)]',
  "[&_input:not([type='checkbox'],_[type='radio'])]:w-full",
  "[&_input:not([type='checkbox'],_[type='radio'])]:pt-[9px]",
  "[&_input:not([type='checkbox'],_[type='radio'])]:pr-3",
  "[&_input:not([type='checkbox'],_[type='radio'])]:pb-[9px]",
  "[&_input:not([type='checkbox'],_[type='radio'])]:pl-3",
  "[&_input:not([type='checkbox'],_[type='radio'])]:border [&_input:not([type='checkbox'],_[type='radio'])]:border-solid [&_input:not([type='checkbox'],_[type='radio'])]:border-control-border",
  "[&_input:not([type='checkbox'],_[type='radio'])]:rounded-[10px]",
  "[&_input:not([type='checkbox'],_[type='radio'])]:bg-paper",
  "[&_input:not([type='checkbox'],_[type='radio'])]:text-ink",
  "[&_input:not([type='checkbox'],_[type='radio'])]:text-body",
  "[&_input:not([type='checkbox'],_[type='radio'])]:min-h-[var(--control-height)]",
  "[&_input:not([type='checkbox'],_[type='radio'])]:leading-[1.5]",
  "[&_input:not([type='checkbox'],_[type='radio'])]:[transition:border-color_120ms,_box-shadow_120ms]",
  '[&_select]:w-full [&_select]:pt-2.5 [&_select]:pr-3 [&_select]:pb-2.5 [&_select]:pl-3',
  '[&_select]:border [&_select]:border-solid [&_select]:border-control-border [&_select]:rounded-[8px] [&_select]:bg-paper',
  '[&_select]:text-ink [&_select]:text-[length:12px] [&_select]:min-h-10.5 [&_textarea]:w-full',
  '[&_textarea]:pt-[9px] [&_textarea]:pr-3 [&_textarea]:pb-[9px] [&_textarea]:pl-3',
  '[&_textarea]:border [&_textarea]:border-solid [&_textarea]:border-control-border [&_textarea]:rounded-[10px] [&_textarea]:bg-paper',
  '[&_textarea]:text-ink [&_textarea]:text-body [&_textarea]:min-h-28 [&_textarea]:[resize:vertical]',
  '[&_textarea]:leading-[1.5] [&_textarea]:[transition:border-color_120ms,_box-shadow_120ms]',
  'max-[600px]:gap-4.5',
  "[&_input:not([type='checkbox'],_[type='radio']):disabled]:bg-page",
  "[&_input:not([type='checkbox'],_[type='radio']):disabled]:text-muted-ink",
  "[&_input:not([type='checkbox'],_[type='radio']):disabled]:cursor-not-allowed",
  '[&_textarea:disabled]:bg-page [&_textarea:disabled]:text-muted-ink',
  '[&_textarea:disabled]:cursor-not-allowed',
  "[@media_(pointer:_coarse)_and_(max-width:_760px)]:[&_input:not([type='checkbox'],_[type='radio'])]:text-[length:17px]",
  "[@media_(pointer:_coarse)_and_(max-width:_760px)]:[&_input:not([type='checkbox'],_[type='radio'])]:min-h-11",
  '[@media_(pointer:_coarse)_and_(max-width:_760px)]:[&_textarea]:text-[length:17px]',
  '[@media_(pointer:_coarse)_and_(max-width:_760px)]:[&_textarea]:min-h-11',
  '[&_input:focus-visible]:outline-muted-ink [&_textarea:focus-visible]:outline-muted-ink',
);

export const textBtnStyles = cn(
  'inline-flex items-center gap-[5px] [background:none] border-0 pt-[5px] pr-0 pb-[5px] pl-0',
  'text-brand text-[length:12px] font-medium leading-[1.5] whitespace-nowrap shrink-0',
  "[[class~='group/panel-heading']_>_&]:ml-auto group/text-btn",
  "[[class~='group/notice-error']_&]:text-inherit",
  "[[class~='group/error-state']_&]:text-[length:inherit]",
  "[[class~='group/error-state']_&]:leading-[inherit] [[class~='group/data-table']_&]:min-h-7",
  "[[class~='group/data-table']_&]:pt-[3px] [[class~='group/data-table']_&]:pr-0",
  "[[class~='group/data-table']_&]:pb-[3px] [[class~='group/data-table']_&]:pl-0",
  "[[class~='group/data-table']_&]:text-[length:12px] [[class~='group/data-table']_&]:leading-[1.5]",
  "[[class~='group/data-table']_&]:[vertical-align:middle]",
);

export const monoStyles = 'font-mono [overflow-wrap:anywhere] group/mono';

export const tagStyles = cn(
  'inline-flex items-center gap-[5px] rounded-[5px] bg-page text-muted-ink pt-1 pr-2 pb-1 pl-2',
  "text-caption leading-[1.45] group/tag [[class~='group/data-table']_&]:min-h-5",
  "[[class~='group/data-table']_&]:pt-0.5 [[class~='group/data-table']_&]:pr-2",
  "[[class~='group/data-table']_&]:pb-0.5 [[class~='group/data-table']_&]:pl-2",
  "[[class~='group/data-table']_&]:leading-[1.45]",
  "[[class~='group/data-table']_&]:[vertical-align:middle]",
);

export const tagTealStyles = 'bg-brand-soft text-brand';

export const chipsStyles = cn(
  "flex flex-wrap gap-1.5 [[class~='group/account-layout']_&]:mb-[15px]",
  "[[class~='group/data-table']_&]:mt-0 [[class~='group/data-table']_&]:mr-0",
  "[[class~='group/data-table']_&]:mb-0 [[class~='group/data-table']_&]:ml-0",
  "[[class~='group/data-table']_&]:gap-[4px_6px] group/chips",
);

export const eyebrowStyles =
  'text-brand text-[length:11px] font-semibold tracking-[1.5px] flex items-center gap-2 group/eyebrow';

export const countPillStyles = cn(
  'inline-flex items-center gap-[5px] rounded-[5px] bg-page text-muted-ink pt-0.5 pr-2 pb-0.5 pl-2',
  'text-[length:12px] leading-[1.6] ml-2.5',
);

export const inlineIconStyles = 'inline-flex items-center gap-1.5';

export const filterTabsStyles = cn(
  'flex gap-[21px] [&_>_button]:flex [&_>_button]:items-center [&_>_button]:gap-[7px]',
  '[&_>_button]:border-0 [&_>_button]:leading-5',
  '[&_>_button]:[background:none] [&_>_button]:pt-3 [&_>_button]:pr-0 [&_>_button]:pb-3',
  '[&_>_button]:pl-0 [&_>_button]:text-muted-ink [&_>_button]:text-[length:12px]',
  "[&_>_button]:whitespace-nowrap [&_>_button[class~='group/selected']]:text-brand",
  "[&_>_button[class~='group/selected']]:[box-shadow:inset_0_-2px_var(--brand)]",
  "[&_>_button[class~='group/selected']]:font-semibold [&_>_button_>_span]:text-muted-ink",
  '[&_>_button_>_span]:text-[length:11px] [&_>_button_>_span]:min-w-[15px] max-[600px]:gap-[19px]',
  'max-[600px]:[&_>_button]:text-[length:12px] max-[600px]:[&_>_button]:pt-[11px]',
  'max-[600px]:[&_>_button]:pr-0 max-[600px]:[&_>_button]:pb-[11px] max-[600px]:[&_>_button]:pl-0',
  'group/filter-tabs [&_>_button:focus-visible]:[outline:2px_solid_var(--brand)]',
  '[&_>_button:focus-visible]:[outline-offset:-2px]',
);

export const selectedStyles = 'group/selected';

export const sheetScrollStyles = cn(
  'overflow-y-auto pt-6.5 pr-6.5 pb-6.5 pl-6.5 bg-paper min-h-0 flex-1 [overscroll-behavior:contain]',
  '[scrollbar-width:thin] max-[600px]:pt-5 max-[600px]:pr-[17px] max-[600px]:pb-5',
  'max-[600px]:pl-[17px]',
);

export const sectionHeadingStyles = cn(
  'group/section-heading flex items-center justify-between gap-[var(--space-3)] mb-[var(--space-4)]',
  '[&_h2]:text-section [&_h2]:leading-[1.4] [&_p]:mt-[var(--space-1)] [&_p]:text-label',
  '[&_p]:leading-[1.65] max-[600px]:[&_h2]:text-[length:17px] max-[600px]:gap-2.5',
  "max-[600px]:items-start [&_>_div]:min-w-0 [[class~='group/connect-layout']_&]:mb-0",
  'max-[760px]:gap-3.5 max-[760px]:flex-wrap',
);

export const tagRedStyles = 'bg-danger-soft text-danger';

export const sourceActionsStyles =
  'group/source-actions flex items-center gap-[9px] mt-5 flex-wrap max-[600px]:gap-2';

export const formRowStyles = cn(
  "[&_input:not([type='checkbox'],_[type='radio'])]:w-full",
  "[&_input:not([type='checkbox'],_[type='radio'])]:pt-[9px]",
  "[&_input:not([type='checkbox'],_[type='radio'])]:pr-3",
  "[&_input:not([type='checkbox'],_[type='radio'])]:pb-[9px]",
  "[&_input:not([type='checkbox'],_[type='radio'])]:pl-3",
  "[&_input:not([type='checkbox'],_[type='radio'])]:border [&_input:not([type='checkbox'],_[type='radio'])]:border-solid [&_input:not([type='checkbox'],_[type='radio'])]:border-control-border",
  "[&_input:not([type='checkbox'],_[type='radio'])]:rounded-[10px]",
  "[&_input:not([type='checkbox'],_[type='radio'])]:bg-paper",
  "[&_input:not([type='checkbox'],_[type='radio'])]:text-ink",
  "[&_input:not([type='checkbox'],_[type='radio'])]:text-body",
  "[&_input:not([type='checkbox'],_[type='radio'])]:min-h-[var(--control-height)]",
  "[&_input:not([type='checkbox'],_[type='radio'])]:leading-[1.5]",
  "[&_input:not([type='checkbox'],_[type='radio'])]:[transition:border-color_120ms,_box-shadow_120ms]",
  '[&_select]:w-full [&_select]:pt-2.5 [&_select]:pr-3 [&_select]:pb-2.5 [&_select]:pl-3',
  '[&_select]:border [&_select]:border-solid [&_select]:border-control-border [&_select]:rounded-[8px] [&_select]:bg-paper',
  '[&_select]:text-ink [&_select]:text-[length:12px] [&_select]:min-h-10.5 grid grid-cols-[1fr_1fr]',
  'gap-[var(--space-4)] items-start max-[600px]:grid-cols-[1fr] max-[600px]:gap-4 group/form-row',
  "[@media_(pointer:_coarse)_and_(max-width:_760px)]:[&_input:not([type='checkbox'],_[type='radio'])]:text-[length:17px]",
  "[@media_(pointer:_coarse)_and_(max-width:_760px)]:[&_input:not([type='checkbox'],_[type='radio'])]:min-h-11",
  '[&_input:focus-visible]:outline-muted-ink [&_textarea:focus-visible]:outline-muted-ink',
);

export const installationRouteStyles = cn(
  'min-w-0 pt-3 pr-3.5 pb-3 pl-3.5 border border-solid border-[color:var(--line)] rounded-[10px]',
  '[&_>_summary]:cursor-pointer [&_>_summary]:font-medium [&_>_summary]:leading-[1.6]',
  '[&_>_:not(summary)]:my-[12px_0]',
);

export const installationContentStyles = cn(
  'grid min-w-0 gap-[var(--space-3)]',
  "[&_[class~='group/codewrap']]:my-0",
);

export const connectLayoutStyles = 'group/connect-layout min-w-0';

export const panelHeadingStyles = cn(
  'group/panel-heading flex items-start gap-[var(--space-3)] mb-[var(--space-4)] [&_h2]:text-section',
  '[&_h2]:leading-[1.4] [&_p]:text-muted-ink [&_p]:text-label [&_p]:mt-[var(--space-1)]',
  '[&_p]:leading-[1.65] max-[600px]:gap-2.5 max-[600px]:mb-[21px]',
  'max-[600px]:[&_h2]:text-[length:17px] max-[600px]:[&_p]:text-[length:11px] [&_>_div]:min-w-0',
  "[[class~='group/connect-layout']_&]:mb-0 max-[760px]:[&_h2]:text-[length:17px]",
);

export const stepNumberStyles = cn(
  'bg-brand-soft text-brand font-mono rounded-[9px] flex w-[33px] h-[33px] items-center justify-center',
  'text-[length:12px] shrink-0',
);

export const codewrapStyles =
  'bg-code-bg text-code-fg rounded-[14px] overflow-hidden mt-4 mb-4 group/codewrap';

export const formActionsStyles = 'flex items-center justify-between gap-4 flex-wrap';

export const accountLayoutStyles = cn(
  'group/account-layout grid grid-cols-[1fr_1fr] gap-[25px] items-start max-[850px]:grid-cols-[1fr]',
  'max-[760px]:grid-cols-[1fr]',
);

export const tableCellStatusStyles = cn(
  "[[class~='group/data-table']_&]:w-[1%] [[class~='group/data-table']_&]:text-center",
  "[[class~='group/data-table']_&]:whitespace-nowrap",
);

export const tableCellActionsStyles = cn(
  "group/table-cell-actions [[class~='group/data-table']_&]:w-[1%]",
  "[[class~='group/data-table']_&]:text-center [[class~='group/data-table']_&]:whitespace-nowrap",
);

export const dataTableStyles = cn(
  "group/data-table [[class~='group/panel']_>_[class~='group/notice']_+_&]:mt-4",
  'border border-solid border-[color:var(--line)] rounded-[12px] overflow-hidden bg-paper [&_thead]:sticky',
  '[&_thead]:top-0 [&_thead]:z-[1] [&_thead]:bg-paper [&_table]:w-full [&_table]:text-label',
  '[&_table]:leading-[1.6] [&_table]:[table-layout:auto] [&_table]:tabular-nums',
  '[&_th]:text-[length:12px] [&_th]:font-semibold [&_th]:text-muted-ink [&_th]:h-9 [&_th]:pt-2',
  '[&_th]:pr-4 [&_th]:pb-2 [&_th]:pl-4 [&_th]:whitespace-nowrap [&_th]:[vertical-align:middle]',
  '[&_td]:h-11 [&_td]:pt-2 [&_td]:pr-4 [&_td]:pb-2 [&_td]:pl-4 [&_td]:[vertical-align:middle]',
  '[&_td]:max-w-95 [&_td]:[overflow-wrap:anywhere] [&_td_strong]:text-[length:inherit]',
  '[&_td_strong]:font-medium [&_td_code]:text-[length:12px] [&_td_code]:leading-[1.5]',
  '[&_td_small]:text-[length:12px] [&_td_small]:leading-[1.5] [&_td_small]:mt-0.5',
  '[&_td_>_svg]:inline-block [&_td_>_svg]:[vertical-align:middle]',
  '[&_tbody_tr:hover]:[background:color-mix(in_srgb,_var(--brand-soft)_35%,_transparent)]',
  '[&_tbody_tr:focus-within]:[background:color-mix(in_srgb,_var(--brand-soft)_45%,_transparent)]',
  '[&_tbody_tr:last-child_>_*]:border-b-0 max-[760px]:[&_th]:pt-2 max-[760px]:[&_th]:pr-3',
  'max-[760px]:[&_th]:pb-2 max-[760px]:[&_th]:pl-3 max-[760px]:[&_td]:pt-2 max-[760px]:[&_td]:pr-3',
  'max-[760px]:[&_td]:pb-2 max-[760px]:[&_td]:pl-3 max-[760px]:[&_table]:min-w-140',
);

export const tableWrapStyles = cn(
  "overflow-auto max-w-full [[class~='group/data-table']_&]:max-h-[min(560px,_65vh)]",
  "[[class~='group/data-table']_&]:overflow-auto",
  "[[class~='group/data-table']_&]:[overscroll-behavior-x:contain]",
  "[[class~='group/data-table']_&]:[scrollbar-width:thin]",
  "[[class~='group/data-table']_&:focus-visible]:[outline:2px_solid_var(--brand)]",
  "[[class~='group/data-table']_&:focus-visible]:[outline-offset:-2px] group/table-wrap",
);

export const checkLabelStyles = cn(
  "[&[class~='group/review-acknowledgement']]:bg-page",
  "[&[class~='group/review-acknowledgement']]:pt-[11px]",
  "[&[class~='group/review-acknowledgement']]:pr-[13px]",
  "[&[class~='group/review-acknowledgement']]:pb-[11px]",
  "[&[class~='group/review-acknowledgement']]:pl-[13px]",
  "[&[class~='group/review-acknowledgement']]:mb-[15px] [--check-size:18px] grid",
  'grid-cols-[var(--check-size)_minmax(0,_1fr)] [align-content:center] items-start',
  'gap-[var(--space-2)] min-h-8.5 pt-2 pr-2.5 pb-2 pl-2.5 rounded-[9px] font-normal cursor-pointer',
  '[transition:background-color_var(--duration-normal),_box-shadow_var(--duration-normal)]',
  '[&_>_span]:min-w-0 [&_>_span]:[overflow-wrap:anywhere] [&_>_span]:leading-[inherit]',
  '[&_>_code]:min-w-0 [&_>_code]:[overflow-wrap:anywhere] [&_>_code]:leading-[inherit]',
  "[&_>_input[type='checkbox']]:appearance-none [&_>_input[type='checkbox']]:grid",
  "[&_>_input[type='checkbox']]:[place-content:center]",
  "[&_>_input[type='checkbox']]:w-[var(--check-size)]",
  "[&_>_input[type='checkbox']]:h-[var(--check-size)] [&_>_input[type='checkbox']]:min-h-0",
  "[&_>_input[type='checkbox']]:pt-0 [&_>_input[type='checkbox']]:pr-0",
  "[&_>_input[type='checkbox']]:pb-0 [&_>_input[type='checkbox']]:pl-0",
  "[&_>_input[type='checkbox']]:mt-0 [&_>_input[type='checkbox']]:mr-0",
  "[&_>_input[type='checkbox']]:mb-0 [&_>_input[type='checkbox']]:ml-0",
  "[&_>_input[type='checkbox']]:[margin-block-start:calc((1lh_-_var(--check-size))_/_2)]",
  "[&_>_input[type='checkbox']]:border-[1.5px] [&_>_input[type='checkbox']]:border-solid [&_>_input[type='checkbox']]:border-[color:var(--muted-ink)]",
  "[&_>_input[type='checkbox']]:rounded-[5px] [&_>_input[type='checkbox']]:bg-paper",
  "[&_>_input[type='checkbox']]:text-on-brand [&_>_input[type='checkbox']]:[font:inherit]",
  "[&_>_input[type='checkbox']]:[cursor:inherit]",
  "[&_>_input[type='checkbox']]:[transition:background-color_var(--duration-fast),_border-color_var(--duration-fast),_box-shadow_var(--duration-fast),_transform_var(--duration-fast)_var(--ease-out)]",
  "[&_>_input[type='checkbox']::before]:[content:''] [&_>_input[type='checkbox']::before]:w-[5px]",
  "[&_>_input[type='checkbox']::before]:h-[9px]",
  "[&_>_input[type='checkbox']::before]:border-solid [&_>_input[type='checkbox']::before]:border-current",
  "[&_>_input[type='checkbox']::before]:border-t-0",
  "[&_>_input[type='checkbox']::before]:border-r-2",
  "[&_>_input[type='checkbox']::before]:border-b-2",
  "[&_>_input[type='checkbox']::before]:border-l-0",
  "[&_>_input[type='checkbox']::before]:opacity-0",
  "[&_>_input[type='checkbox']::before]:[transform:translateY(-1px)_rotate(45deg)_scale(0.5)]",
  "[&_>_input[type='checkbox']::before]:[transition:opacity_var(--duration-fast),_transform_var(--duration-normal)_var(--ease-out)]",
  "[&_>_input[type='checkbox']:checked]:border-t-[color:var(--brand)]",
  "[&_>_input[type='checkbox']:checked]:border-r-[color:var(--brand)]",
  "[&_>_input[type='checkbox']:checked]:border-b-[color:var(--brand)]",
  "[&_>_input[type='checkbox']:checked]:border-l-[color:var(--brand)]",
  "[&_>_input[type='checkbox']:checked]:bg-brand",
  "[&_>_input[type='checkbox']:checked::before]:opacity-[1]",
  "[&_>_input[type='checkbox']:checked::before]:[transform:translateY(-1px)_rotate(45deg)_scale(1)]",
  '[&:has(>_input:checked)]:bg-brand-soft',
  '[&:has(>_input:checked)]:[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--brand)_25%,_transparent)]',
  "[&_>_input[type='checkbox']:focus-visible]:[outline:2px_solid_var(--brand)]",
  "[&_>_input[type='checkbox']:focus-visible]:[outline-offset:3px]",
  '[&:has(>_input:focus-visible)]:[box-shadow:inset_0_0_0_2px_var(--brand)]',
  '[@media_(hover:_hover)]:[&:hover:has(>_input:not(:disabled))]:bg-brand-soft',
  "[@media_(hover:_hover)]:[&:hover_>_input[type='checkbox']:not(:disabled)]:border-t-[color:var(--brand)]",
  "[@media_(hover:_hover)]:[&:hover_>_input[type='checkbox']:not(:disabled)]:border-r-[color:var(--brand)]",
  "[@media_(hover:_hover)]:[&:hover_>_input[type='checkbox']:not(:disabled)]:border-b-[color:var(--brand)]",
  "[@media_(hover:_hover)]:[&:hover_>_input[type='checkbox']:not(:disabled)]:border-l-[color:var(--brand)]",
  "[@media_(hover:_hover)]:[&:hover_>_input[type='checkbox']:not(:disabled)]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--brand)_12%,_transparent)]",
  "motion-safe:[&:active_>_input[type='checkbox']:not(:disabled)]:[transform:scale(0.92)]",
  '[&:has(>_input:disabled)]:opacity-[0.55] [&:has(>_input:disabled)]:cursor-not-allowed',
  '[@media_(pointer:_coarse)]:min-h-11 [@media_(pointer:_coarse)]:py-[13px]',
  "forced-colors:[&_>_input[type='checkbox']]:appearance-auto",
  "forced-colors:[&_>_input[type='checkbox']::before]:[content:none]",
  'forced-colors:[&:has(>_input:checked)]:[outline:1px_solid_Highlight]',
);

export const emptyStyles = cn(
  'flex flex-col items-center justify-center text-center pt-[65px] pr-6 pb-[65px] pl-6 gap-3.5',
  'border border-dashed border-[color:var(--line)] rounded-[16px]',
  '[background:color-mix(in_srgb,_var(--paper),_transparent_35%)] [&_h3]:text-[length:19px]',
  '[&_p]:max-w-117.5 [&_p]:text-[length:12px] [&_p]:text-muted-ink [&_p]:leading-[1.9] group/empty',
);

export const spinStyles = '[animation:spin_1s_linear_infinite]';

export const fieldErrorStyles = "text-danger [[class~='group/keyword-field']_>_&]:text-danger";

export const tokDimStyles = 'text-code-dim';

export const tokStrStyles = 'text-code-str';

export const tokKeyStyles = 'text-code-key';

export const codeblockStyles = cn(
  'font-mono text-[length:11px] leading-[1.75] pt-1 pr-4 pb-3.5 pl-4 whitespace-pre overflow-x-auto',
  'mt-0 mr-0 mb-0 ml-0 max-h-117.5 group/codeblock',
);

export const copyInvitationStyles = 'group/copy-invitation';

export const kfocusStyles =
  'focus-visible:[outline:2px_solid_var(--focus)] focus-visible:[outline-offset:2px]';

export const tableToolbarStyles = cn(
  '[&_>_span_small]:tabular-nums min-h-11 flex items-center justify-between gap-4 flex-wrap pt-2',
  'pr-4 pb-2 pl-4 border-b [border-bottom-style:solid] border-b-[color:var(--line)] [&_>_span]:text-[length:12px]',
  '[&_>_span]:font-semibold [&_>_span]:flex [&_>_span]:items-center [&_>_span]:gap-3',
  '[&_>_span]:min-w-0 [&_>_span]:flex-wrap [&_small]:text-[length:12px] [&_small]:text-muted-ink',
  '[&_small]:font-normal max-[760px]:items-start max-[760px]:flex-col max-[760px]:gap-2.5',
);

export const tableSearchStyles = cn(
  'flex items-center flex-row gap-2 max-w-60 [flex:1_1_180px] min-w-0 bg-page',
  'border border-solid border-control-border rounded-[8px] pt-[7px] pr-2.5 pb-[7px] pl-2.5',
  "[[class~='group/data-table']_&_>_input]:w-full",
  "[[class~='group/data-table']_&_>_input]:[font-family:inherit]",
  "[[class~='group/data-table']_&_>_input]:text-[length:12px]",
  "[[class~='group/data-table']_&_>_input]:border-0",
  "[[class~='group/data-table']_&_>_input]:bg-transparent",
  "[[class~='group/data-table']_&_>_input]:[outline:none]",
  "[[class~='group/data-table']_&_>_input]:min-w-0 [[class~='group/data-table']_&_>_input]:min-h-0",
  "[[class~='group/data-table']_&_>_input]:pt-0 [[class~='group/data-table']_&_>_input]:pr-0",
  "[[class~='group/data-table']_&_>_input]:pb-0 [[class~='group/data-table']_&_>_input]:pl-0",
  "[[class~='group/data-table']_&_>_input]:rounded-none",
  "[[class~='group/data-table']_&_>_input:focus-visible]:[outline:none]",
  "[[class~='group/data-table']_&_>_input:focus-visible]:border-0",
  "[[class~='group/data-table']_&_>_input:focus-visible]:[box-shadow:none]",
  'max-[760px]:max-w-none',
  'max-[760px]:w-full',
  '[&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-solid [&:has(:focus-visible)]:outline-muted-ink [&:has(:focus-visible)]:outline-offset-2',
);

export const tableEmptyStyles = cn(
  "[[class~='group/data-table']_&]:text-center [[class~='group/data-table']_&]:text-muted-ink",
  "[[class~='group/data-table']_&]:pt-9 [[class~='group/data-table']_&]:pr-9",
  "[[class~='group/data-table']_&]:pb-9 [[class~='group/data-table']_&]:pl-9",
  "[[class~='group/data-table']_&]:h-24 [[class~='group/data-table']_&]:max-w-none",
  "[[class~='group/data-table']_&]:whitespace-normal",
);

export const hubDateStyles = 'w-full min-w-0';

export const hubDateTriggerStyles = cn(
  'flex items-center gap-2 min-h-10 border border-solid border-control-border rounded-[10px] pt-[5px] pr-2.5',
  'pb-[5px] pl-2.5 bg-paper text-[length:12px] font-normal',
  '[&_.react-aria-DateInput]:flex-1',
  '[&_.react-aria-DateInput]:flex [&_.react-aria-DateInput]:items-center',
  '[&_.react-aria-DateInput]:gap-px [&_.react-aria-DateInput]:min-w-0',
  '[&_.react-aria-DateInput]:flex-wrap [&_.react-aria-DateSegment]:pt-0.5',
  '[&_.react-aria-DateSegment]:pr-px [&_.react-aria-DateSegment]:pb-0.5',
  '[&_.react-aria-DateSegment]:pl-px [&_.react-aria-DateSegment]:[outline:none]',
  '[&_.react-aria-DateSegment]:rounded-[3px] [&_.react-aria-DateSegment]:tabular-nums',
  '[&_.react-aria-DateSegment[data-placeholder]]:text-muted-ink',
  '[&_.react-aria-DateSegment[data-focused]]:text-brand',
  '[&_.react-aria-DateSegment[data-focused]]:bg-brand-soft [&_button]:flex [&_button]:items-center',
  '[&_button]:justify-center [&_button]:w-7 [&_button]:h-7 [&_button]:shrink-0 [&_button]:border-0',
  '[&_button]:bg-transparent [&_button]:text-muted-ink [&_button]:cursor-pointer',
  '[&_button]:rounded-[6px] [&_button[data-hovered]]:bg-brand-soft [&_button[data-hovered]]:text-brand',
  '[&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-solid [&:has(:focus-visible)]:outline-muted-ink [&:has(:focus-visible)]:outline-offset-2',
);

export const hubDatePopoverStyles = cn(
  'z-[100] w-74 max-w-[calc(100vw_-_24px)] pt-4 pr-4 pb-4 pl-4 bg-paper',
  'border border-solid border-[color:var(--line)] [box-shadow:var(--shadow-floating)] rounded-[14px] [outline:none]',
  "[&_[role='dialog']]:[outline:none] [&_header]:flex [&_header]:items-center",
  '[&_header]:justify-between [&_header]:mb-3 [&_header]:gap-2.5 [&_h2]:text-[length:15px]',
  '[&_header_button]:w-7.5 [&_header_button]:h-7.5 [&_header_button]:flex',
  '[&_header_button]:items-center [&_header_button]:justify-center [&_header_button]:border-0',
  '[&_header_button]:bg-page [&_header_button]:text-ink [&_header_button]:rounded-[7px]',
  '[&_header_button]:cursor-pointer [&_table]:w-full [&_table]:text-[length:12px]',
  '[&_table]:[border-collapse:collapse] [&_table]:[table-layout:fixed] [&_th]:pt-0 [&_th]:pr-0',
  '[&_th]:pb-0 [&_th]:pl-0 [&_th]:min-w-0 [&_th]:border-0 [&_th]:text-center [&_th]:bg-transparent',
  '[&_th]:text-[length:11px] [&_th]:text-muted-ink [&_th]:h-7 [&_td]:pt-0 [&_td]:pr-0 [&_td]:pb-0',
  '[&_td]:pl-0 [&_td]:min-w-0 [&_td]:border-0 [&_td]:text-center [&_td]:bg-transparent',
  '[&_.react-aria-CalendarCell]:w-8.5 [&_.react-aria-CalendarCell]:h-8.5',
  '[&_.react-aria-CalendarCell]:leading-[34px] [&_.react-aria-CalendarCell]:rounded-[8px]',
  '[&_.react-aria-CalendarCell]:[outline:none] [&_.react-aria-CalendarCell]:cursor-pointer',
  '[&_.react-aria-CalendarCell]:text-center [&_.react-aria-CalendarCell]:mt-px',
  '[&_.react-aria-CalendarCell]:mr-auto [&_.react-aria-CalendarCell]:mb-px',
  '[&_.react-aria-CalendarCell]:ml-auto',
  '[&_.react-aria-CalendarCell[data-outside-month]]:text-muted-ink',
  '[&_.react-aria-CalendarCell[data-outside-month]]:opacity-[0.5]',
  '[&_.react-aria-CalendarCell[data-hovered]]:bg-brand-soft',
  '[&_.react-aria-CalendarCell[data-hovered]]:text-brand',
  '[&_.react-aria-CalendarCell[data-focused]]:bg-brand-soft',
  '[&_.react-aria-CalendarCell[data-focused]]:text-brand',
  '[&_.react-aria-CalendarCell[data-selected]]:text-on-brand',
  '[&_.react-aria-CalendarCell[data-selected]]:bg-brand',
  '[&_.react-aria-CalendarCell[data-focus-visible]]:[outline:2px_solid_var(--brand)]',
  '[&_.react-aria-CalendarCell[data-focus-visible]]:[outline-offset:2px] [&_p]:text-[length:11px]',
  '[&_p]:text-muted-ink [&_p]:mt-3 [&_p]:leading-[1.7]',
);

export const dialogTitleStyles = cn(
  'pt-5.5 pr-6.5 pb-5.5 pl-6.5 flex items-center justify-between',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] bg-paper shrink-0 [&_h2]:text-[length:17px]',
  'max-[600px]:pt-[17px] max-[600px]:pr-[17px] max-[600px]:pb-[17px] max-[600px]:pl-[17px]',
  'group/dialog-title',
);

export const emptyIconStyles = cn(
  'flex items-center justify-center w-15.5 h-15.5 text-brand bg-brand-soft',
  'border border-solid border-[color:color-mix(in_srgb,_var(--brand),_transparent_88%)] rounded-[20px] mb-[3px]',
);

export const errorStateStyles = cn(
  'group/error-state items-center [&_>_svg]:mt-0 [&_>_div]:flex [&_>_div]:flex-wrap',
  '[&_>_div]:items-center [&_>_div]:gap-[8px_16px]',
);

export const errorStateMessageStyles = 'min-w-0';

export const keywordFieldStyles = cn(
  'group/keyword-field flex flex-col min-w-0 gap-[var(--space-2)] [&_>_label]:flex',
  '[&_>_label]:flex-row [&_>_label]:items-center [&_>_label]:justify-between [&_>_label]:mt-0',
  '[&_>_label]:mr-0 [&_>_label]:mb-0 [&_>_label]:ml-0 [&_>_small]:text-muted-ink',
  '[&_>_small]:text-caption [&_>_small]:font-normal [&_>_small]:leading-[1.7]',
);

export const keywordCountStyles = 'text-muted-ink text-caption font-normal leading-[1.7]';

export const keywordEditorStyles = cn(
  'flex flex-wrap items-center gap-1.5 min-h-[var(--control-height)] pt-1.5 pr-2 pb-1.5 pl-2',
  'bg-paper border border-solid border-[color:var(--line)] rounded-[10px] [cursor:text]',
  "[[class~='group/keyword-field']_&_>_input]:[flex:1_1_150px]",
  "[[class~='group/keyword-field']_&_>_input]:w-0",
  "[[class~='group/keyword-field']_&_>_input]:min-w-22.5",
  "[[class~='group/keyword-field']_&_>_input]:min-h-7",
  "[[class~='group/keyword-field']_&_>_input]:mt-0 [[class~='group/keyword-field']_&_>_input]:mr-0",
  "[[class~='group/keyword-field']_&_>_input]:mb-0 [[class~='group/keyword-field']_&_>_input]:ml-0",
  "[[class~='group/keyword-field']_&_>_input]:pt-[3px]",
  "[[class~='group/keyword-field']_&_>_input]:pr-1",
  "[[class~='group/keyword-field']_&_>_input]:pb-[3px]",
  "[[class~='group/keyword-field']_&_>_input]:pl-1",
  "[[class~='group/keyword-field']_&_>_input]:border-0",
  "[[class~='group/keyword-field']_&_>_input]:rounded-none",
  "[[class~='group/keyword-field']_&_>_input]:[outline:none]",
  "[[class~='group/keyword-field']_&_>_input]:[box-shadow:none]",
  "[[class~='group/keyword-field']_&_>_input]:bg-transparent",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:[flex:1_1_150px]",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:w-0",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:min-w-22.5",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:min-h-7",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:mt-0",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:mr-0",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:mb-0",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:ml-0",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:pt-[3px]",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:pr-1",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:pb-[3px]",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:pl-1",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:border-0",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:rounded-none",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:[outline:none]",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:[box-shadow:none]",
  "[[class~='group/keyword-field']_&_>_input:focus-visible]:bg-transparent",
  '[&[data-invalid]]:border-t-[color:var(--danger)]',
  '[&[data-invalid]]:border-r-[color:var(--danger)]',
  '[&[data-invalid]]:border-b-[color:var(--danger)]',
  '[&[data-invalid]]:border-l-[color:var(--danger)]',
  '[&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-solid [&:has(:focus-visible)]:outline-muted-ink [&:has(:focus-visible)]:outline-offset-2',
);

export const keywordTagStyles = cn(
  'inline-flex items-center gap-1 max-w-full min-h-7 pt-0.5 pr-1 pb-0.5 pl-[9px] rounded-[6px]',
  'bg-brand-soft text-brand text-caption leading-[1.5] [&_>_span]:min-w-0',
  '[&_>_span]:[overflow-wrap:anywhere] [&_>_button]:shrink-0 [&_>_button]:inline-flex',
  '[&_>_button]:items-center [&_>_button]:justify-center [&_>_button]:w-6 [&_>_button]:min-h-6',
  '[&_>_button]:pt-0 [&_>_button]:pr-0 [&_>_button]:pb-0 [&_>_button]:pl-0 [&_>_button]:border-0',
  '[&_>_button]:rounded-[4px] [&_>_button]:text-inherit [&_>_button]:bg-transparent',
  '[&_>_button]:cursor-pointer',
  '[&_>_button:hover]:[background:color-mix(in_srgb,_var(--brand)_12%,_transparent)]',
  '[&_>_button:focus-visible]:[background:color-mix(in_srgb,_var(--brand)_12%,_transparent)]',
);

export const keywordBrowseStyles = cn(
  'inline-flex items-center justify-center [flex:0_0_32px] min-h-8 pt-0 pr-0 pb-0 pl-0 border-0',
  'rounded-[6px] bg-transparent text-muted-ink cursor-pointer hover:bg-brand-soft hover:text-brand',
  "[&[aria-expanded='true']]:bg-brand-soft [&[aria-expanded='true']]:text-brand",
);

export const keywordSuggestionsStyles = cn(
  'pt-3 pr-3 pb-3 pl-3 border border-solid border-[color:var(--line)] rounded-[10px] bg-paper',
  "[&_[role='listbox']]:flex [&_[role='listbox']]:flex-wrap [&_[role='listbox']]:gap-1.5",
  "[&_[role='listbox']]:max-h-50 [&_[role='listbox']]:overflow-y-auto",
  "[&_[role='option']]:inline-flex [&_[role='option']]:items-center [&_[role='option']]:gap-1.5",
  "[&_[role='option']]:max-w-full [&_[role='option']]:min-h-9 [&_[role='option']]:pt-1.5",
  "[&_[role='option']]:pr-2.5 [&_[role='option']]:pb-1.5 [&_[role='option']]:pl-2.5",
  "[&_[role='option']]:border [&_[role='option']]:border-solid [&_[role='option']]:border-[color:var(--line)] [&_[role='option']]:rounded-[8px]",
  "[&_[role='option']]:bg-paper [&_[role='option']]:text-ink [&_[role='option']]:text-caption",
  "[&_[role='option']]:text-left [&_[role='option']]:cursor-pointer",
  "[&_[role='option']_>_span]:[overflow-wrap:anywhere] [&_[role='option']_>_span]:min-w-0",
  "[&_[role='option']_>_svg]:shrink-0 [&_[role='option']:hover]:border-t-[color:var(--brand)]",
  "[&_[role='option']:hover]:border-r-[color:var(--brand)]",
  "[&_[role='option']:hover]:border-b-[color:var(--brand)]",
  "[&_[role='option']:hover]:border-l-[color:var(--brand)] [&_[role='option']:hover]:bg-brand-soft",
  "[&_[role='option']:hover]:text-brand",
  "[&_[role='option'][data-active]]:border-t-[color:var(--brand)]",
  "[&_[role='option'][data-active]]:border-r-[color:var(--brand)]",
  "[&_[role='option'][data-active]]:border-b-[color:var(--brand)]",
  "[&_[role='option'][data-active]]:border-l-[color:var(--brand)]",
  "[&_[role='option'][data-active]]:bg-brand-soft [&_[role='option'][data-active]]:text-brand",
  "[&_[aria-selected='true']]:bg-brand-soft [&_[aria-selected='true']]:text-brand",
  "[&_[aria-disabled='true']]:cursor-default [&_[aria-disabled='true']]:opacity-[0.65]",
);

export const keywordSuggestionsHeadingStyles = cn(
  'flex flex-wrap items-center justify-between gap-[4px_12px] mb-2 text-caption',
  '[&_>_span]:text-muted-ink [&_>_span]:text-caption [&_>_span]:leading-[1.7]',
);

export const keywordSuggestionsStatusStyles =
  'text-muted-ink text-caption leading-[1.7] [&:not(:empty)]:mt-2 [&_>_button]:ml-2';

export const loadingStyles = cn(
  'flex flex-col items-center justify-center gap-2.5 w-full min-w-0 text-muted-ink text-body',
  "leading-[1.6] text-center [&[data-loading-visible='false']]:invisible",
);

export const loadingPageStyles = 'min-h-dvh pt-6 pr-6 pb-6 pl-6';

export const loadingSectionStyles = 'min-h-45 pt-6 pr-4 pb-6 pl-4';

export const loadingFillStyles = 'flex-1 [align-self:stretch] min-h-0 h-full pt-6 pr-4 pb-6 pl-4';

export const loadingInlineStyles = cn(
  'group/loading--inline inline-flex flex-row gap-1.5 w-auto min-h-0 pt-0 pr-0 pb-0 pl-0',
  'text-[length:inherit] leading-[inherit] text-left [vertical-align:middle]',
);

export const loadingIndicatorStyles = cn(
  'inline-flex items-center justify-center shrink-0 w-5 h-5 text-brand',
  "[[class~='group/loading--inline']_&]:w-4 [[class~='group/loading--inline']_&]:h-4",
);

export const loadingLabelStyles = 'block max-w-[40ch] [overflow-wrap:anywhere]';

export const noticeStyles = cn(
  'group/notice flex items-start gap-2.5 pt-4 pr-4.5 pb-4 pl-4.5 bg-brand-soft rounded-[12px]',
  'text-brand text-label leading-[1.7] min-w-0 [&_>_svg]:shrink-0 [&_>_svg]:mt-[3px]',
  '[&_a]:[text-decoration:underline] [&_>_div]:min-w-0 [&_>_div]:[overflow-wrap:anywhere]',
  "[[class~='group/connect-layout']_&]:mt-0 [[class~='group/connect-layout']_&]:mr-0",
  "[[class~='group/connect-layout']_&]:mb-0 [[class~='group/connect-layout']_&]:ml-0",
);

export const hubShowcaseBackdropStyles = cn(
  '[background:var(--backdrop)] [backdrop-filter:blur(5px)]',
  '[@media_(prefers-reduced-transparency:_reduce)]:bg-page',
  '[@media_(prefers-reduced-transparency:_reduce)]:[backdrop-filter:none]',
);

export const overlaySheetStyles = 'w-full max-w-160';

export const overlaySheetWideStyles =
  'w-[min(960px,_calc(100%_-_48px))] max-w-240 max-[760px]:w-full max-[760px]:max-w-none';

export const gutterStyles =
  'pl-[max(16px,_env(safe-area-inset-left,_0px))] pr-[max(16px,_env(safe-area-inset-right,_0px))]';

export const hubShowcaseDialogStyles = cn(
  'max-w-122.5 [scrollbar-width:thin] [scrollbar-color:color-mix(in_srgb,_var(--highlight)_20%,_transparent)_transparent]',
  '[perspective:1200px] focus-visible:[outline:2px_solid_var(--brand)]',
  'focus-visible:[outline-offset:-2px] focus-visible:rounded-[24px]',
);

export const pageHeadStyles =
  'group/page-head flex items-start justify-between gap-3 pb-4 max-[850px]:pt-4 [&>button]:shrink-0';

export const pageHeadTitleStyles =
  'origin-left text-title leading-tight font-semibold tracking-[-0.015em] max-[600px]:text-2xl motion-reduce:transform-none!';

export const pageHeadLabelStyles =
  'border-s border-line ps-3 text-caption leading-none font-semibold tracking-[0.1em] text-brand max-[600px]:hidden motion-reduce:opacity-100!';

export const pageTabsStyles = cn(
  'group/page-tabs flex gap-5 overflow-x-auto border-b border-[color:var(--line)] [scrollbar-width:thin] [scroll-padding-inline:4px]',
  '[&>:is(a,button)]:relative [&>:is(a,button)]:inline-flex [&>:is(a,button)]:items-center [&>:is(a,button)]:justify-center [&>:is(a,button)]:whitespace-nowrap [&>:is(a,button)]:px-0 [&>:is(a,button)]:text-muted-ink',
  '[&>button]:border-0 [&>button]:bg-transparent [&>button]:py-3.5 [&>button]:text-[length:12px]',
  '[&>a]:py-2 [&>a]:text-body [&>a[aria-current=page]]:font-semibold',
  '[&>a[aria-current=page]]:text-brand [&>button[aria-selected=true]]:text-brand',
  '[&>:is(a,button):focus-visible]:rounded-[5px] [&>:is(a,button):focus-visible]:outline-2 [&>:is(a,button):focus-visible]:outline-brand [&>:is(a,button):focus-visible]:outline-offset-[-3px]',
);

export const tabLabelStyles = 'inline-flex items-center justify-center gap-2 leading-5';

export const tabIndicatorStyles =
  'absolute inset-x-0 bottom-0 h-0.5 rounded-[2px] bg-brand pointer-events-none';

export const queryRegionStyles = 'relative min-w-0';

export const queryProgressStyles = cn(
  'absolute z-[2] top-0 right-0 bottom-auto left-0 h-0.5 bg-brand opacity-0 [transform-origin:left]',
  '[animation:query-progress_1.2s_ease-in-out_infinite] pointer-events-none',
  "[&[data-loading-visible='false']]:invisible motion-reduce:[animation:none]",
  'motion-reduce:opacity-[0.7] motion-reduce:[transform:none]',
);

export const queryContentStyles = 'group/query-content min-w-0';

export const markdownFileLinkStyles = cn(
  'inline pt-0 pr-0 pb-0 pl-0 border-0 [background:none] text-brand [text-decoration:underline]',
  '[text-underline-offset:3px] [font:inherit] cursor-pointer',
);

export const tagWarningStyles = cn(
  'bg-warning-soft text-warning',
  '[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--warning)_24%,_transparent)] [&_>_svg]:shrink-0',
);

export const segmentedStyles = cn(
  '[background:color-mix(in_srgb,_var(--line)_55%,_var(--paper))]',
  '[box-shadow:inset_0_0_0_1px_color-mix(in_srgb,_var(--line)_60%,_transparent)] group/segmented',
);

export const segmentedIndicatorStyles = cn(
  'bg-paper',
  '[box-shadow:0_1px_4px_color-mix(in_srgb,_var(--shadow-ink)_8%,_transparent),_inset_0_0_0_1px_color-mix(in_srgb,_var(--brand)_12%,_var(--line))]',
);

export const hubSelectOptionStyles = cn(
  'flex items-center justify-between gap-5 min-h-10 pt-2.5 pr-3 pb-2.5 pl-3 text-body leading-[1.5]',
  'rounded-[7px] [outline:none] cursor-pointer [&_>_span]:[overflow-wrap:anywhere]',
  '[&_>_svg]:shrink-0 [&[data-focused]]:bg-page [&[data-hovered]]:bg-page',
  '[&[data-selected]]:bg-brand-soft [&[data-selected]]:text-brand [&[data-selected]]:font-medium',
  '[&[data-disabled]]:opacity-[0.45] [&[data-disabled]]:cursor-not-allowed max-[760px]:text-body',
);

export const hubSelectStyles = cn(
  'group/hub-select min-w-0 w-full block font-normal [&[data-disabled]]:opacity-[0.6]',
  '[&[data-disabled]_button]:cursor-not-allowed [&[data-disabled]_button]:bg-page',
  "[&_[data-placeholder]]:text-muted-ink [[class~='group/filter-bar']_>_&]:w-47.5",
);

export const hubSelectTriggerStyles = cn(
  'w-full min-w-0 min-h-[var(--control-height)] flex items-center justify-between gap-3.5 pt-[9px]',
  'pr-3 pb-[9px] pl-3 border border-solid border-control-border rounded-[10px] bg-paper text-ink [font:inherit]',
  'text-body text-left cursor-pointer [transition:border-color_0.15s,_box-shadow_0.15s]',
  '[&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap',
  '[&_>_span]:min-w-0 [&_>_svg]:text-muted-ink [&_>_svg]:shrink-0',
  '[&_>_svg]:[transition:transform_0.15s]',
  "[[class~='group/hub-select'][data-open]_&_>_svg]:[transform:rotate(180deg)]",
  "[[class~='group/hub-select'][data-invalid]_&]:border-t-[color:var(--danger)]",
  "[[class~='group/hub-select'][data-invalid]_&]:border-r-[color:var(--danger)]",
  "[[class~='group/hub-select'][data-invalid]_&]:border-b-[color:var(--danger)]",
  "[[class~='group/hub-select'][data-invalid]_&]:border-l-[color:var(--danger)]",
  "group/hub-select-trigger [[class~='group/table-pagination']_&]:min-h-8.5",
  "[[class~='group/table-pagination']_&]:text-[length:12px]",
  "[[class~='group/table-pagination']_&]:pt-1.5 [[class~='group/table-pagination']_&]:pr-[9px]",
  "[[class~='group/table-pagination']_&]:pb-1.5 [[class~='group/table-pagination']_&]:pl-[9px]",
  "pointer-coarse:[[class~='group/table-pagination']_&]:min-h-11",
  'max-[760px]:text-body',
  '[&[data-focus-visible]]:outline-muted-ink',
);

export const hubSelectPopoverStyles = cn(
  '[&[data-entering]]:[animation:popover-in_var(--duration-fast)_ease-out]',
  '[&[data-exiting]]:[animation:popover-out_var(--duration-fast)_ease-in] z-[100]',
  'min-w-[var(--trigger-width)] max-w-[min(480px,_calc(100vw_-_24px))] bg-paper text-ink',
  'border border-solid border-[color:var(--line)] rounded-[12px] pt-1.5 pr-1.5 pb-1.5 pl-1.5',
  '[box-shadow:var(--shadow-floating)] [outline:none]',
);

export const hubSelectOptionsStyles = cn(
  '[overscroll-behavior:contain] [scrollbar-width:thin] max-h-[min(320px,_50vh)] overflow-auto',
  '[outline:none]',
);

export const tablePaginationStyles = cn(
  'group/table-pagination flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2',
  'border-t border-line bg-page/50 px-4 py-2 text-label text-muted-ink tabular-nums max-[600px]:px-3',
);

export const tablePageButtonStyles = cn(
  iconBtnStyles,
  'size-8 shrink-0 rounded-md focus-visible:-outline-offset-2 pointer-coarse:size-11',
);

export const skeletonBlockStyles = cn(
  'block shrink-0 max-w-full rounded-[4px]',
  '[background:color-mix(in_srgb,_var(--line)_80%,_var(--paper))]',
  '[animation:skeleton-pulse_1.8s_ease-in-out_infinite]',
  "max-[760px]:[[class~='group/skeleton-profile-banner']_>_&:last-child]:basis-full",
  'motion-reduce:[animation:none]',
);

export const shapeCircleStyles = 'rounded-[50%]';

export const shapeRectStyles = 'rounded-[10px]';

export const skeletonRegionStyles = cn(
  "[&[data-loading-visible='false']]:invisible w-full min-w-0",
  "[[class~='group/skeleton-card']_>_&]:flex-1",
);

export const skeletonContentStyles = 'w-full min-w-0 pointer-events-none select-none';

export const skeletonLinesStyles = cn(
  'flex flex-1 flex-col gap-2.5 min-w-0',
  "max-[760px]:[[class~='group/skeleton-profile-banner']_>_&]:basis-[calc(100%_-_72px)]",
);

export const skeletonCardGridStyles = cn(
  'grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-4.5',
  'max-[850px]:grid-cols-[repeat(2,_minmax(0,_1fr))] max-[600px]:grid-cols-[minmax(0,_1fr)]',
  'max-[600px]:gap-3',
);

export const skeletonCardGridAssetStyles = 'group/skeleton-card-grid--asset';

export const skeletonCardGridStatStyles = cn(
  'group/skeleton-card-grid--stat max-[850px]:grid-cols-[repeat(3,_minmax(0,_1fr))]',
  'max-[760px]:grid-cols-[minmax(0,_1fr)]',
);

export const skeletonCardGridSourceStyles =
  'grid-cols-[repeat(2,_minmax(0,_1fr))] gap-5 max-[850px]:grid-cols-[minmax(0,_1fr)]';

export const skeletonCardGridRoleStyles =
  'group/skeleton-card-grid--role grid-cols-[repeat(2,_minmax(0,_1fr))] gap-3';

export const skeletonCardStyles = cn(
  'group/skeleton-card flex flex-col gap-5 min-w-0 min-h-[285px] pt-6 pr-[23px] pb-[17px] pl-[23px]',
  'border border-solid border-[color:var(--line)] rounded-[14px] bg-paper',
  "[[class~='group/skeleton-card-grid--asset']_&]:min-h-0 [[class~='group/skeleton-card-grid--asset']_&]:gap-3.5",
  "[[class~='group/skeleton-card-grid--asset']_&]:px-4.5 [[class~='group/skeleton-card-grid--asset']_&]:pt-[19px]",
  "[[class~='group/skeleton-card-grid--asset']_&]:pb-[15px] max-[600px]:[[class~='group/skeleton-card-grid--asset']_&]:px-4",
  "[[class~='group/skeleton-card-grid--role']_&]:min-h-28",
  "[[class~='group/skeleton-card-grid--role']_&]:pt-4",
  "[[class~='group/skeleton-card-grid--role']_&]:pr-4",
  "[[class~='group/skeleton-card-grid--role']_&]:pb-4",
  "[[class~='group/skeleton-card-grid--role']_&]:pl-4",
  "[[class~='group/skeleton-card-grid--role']_&]:gap-3.5",
  "[[class~='group/skeleton-card-grid--stat']_&]:min-h-37",
  "[[class~='group/skeleton-card-grid--stat']_&]:pt-[23px]",
  "[[class~='group/skeleton-card-grid--stat']_&]:pr-[23px]",
  "[[class~='group/skeleton-card-grid--stat']_&]:pb-[23px]",
  "[[class~='group/skeleton-card-grid--stat']_&]:pl-[23px]",
  "[[class~='group/skeleton-card-grid--stat']_&]:gap-4.5",
  "[[class~='group/skeleton-profile-side']_>_&]:flex-1",
  "[[class~='group/skeleton-profile-side']_>_&]:min-h-0",
  "[[class~='group/skeleton-profile-side']_>_&]:pt-6",
  "[[class~='group/skeleton-profile-side']_>_&]:pr-6",
  "[[class~='group/skeleton-profile-side']_>_&]:pb-6",
  "[[class~='group/skeleton-profile-side']_>_&]:pl-6",
  "[[class~='group/skeleton-review-stage']_>_&]:min-h-0",
  "[[class~='group/skeleton-review-stage']_>_&]:pt-5",
  "[[class~='group/skeleton-review-stage']_>_&]:pr-5",
  "[[class~='group/skeleton-review-stage']_>_&]:pb-5",
  "[[class~='group/skeleton-review-stage']_>_&]:pl-5",
  "[[class~='group/skeleton-review-stage']_>_&:first-child]:min-h-50",
  "[[class~='group/skeleton-review-stage']_>_&:last-child]:min-h-95",
  "[[class~='group/skeleton-review-stage']_>_&:last-child]:pt-0",
  "[[class~='group/skeleton-review-stage']_>_&:last-child]:pr-0",
  "[[class~='group/skeleton-review-stage']_>_&:last-child]:pb-0",
  "[[class~='group/skeleton-review-stage']_>_&:last-child]:pl-0",
  "[[class~='group/skeleton-review-stage']_>_&:last-child]:overflow-hidden",
  'max-[600px]:pt-5 max-[600px]:pr-5 max-[600px]:pb-5 max-[600px]:pl-5',
);

export const skeletonCardHeaderStyles = 'flex items-center gap-3 min-w-0';

export const skeletonCardTagsStyles = 'group/skeleton-card-tags flex items-center gap-1.5 mt-auto';

export const skeletonCardFooterStyles = cn(
  'flex items-center gap-4 mt-auto pt-3.5 border-t [border-top-style:solid] border-t-[color:var(--line)]',
  "[[class~='group/skeleton-card-tags']_+_&]:mt-0",
);

export const skeletonTableStyles =
  'min-w-0 overflow-hidden border border-solid border-[color:var(--line)] rounded-[12px] bg-paper';

export const skeletonTableToolbarStyles = cn(
  'flex items-center justify-between gap-4 min-h-11 pt-2 pr-4 pb-2 pl-4',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] max-[600px]:px-3 max-[600px]:gap-3',
);

export const skeletonTableHeadStyles = cn(
  'grid grid-cols-[repeat(var(--skeleton-columns,_4),_minmax(0,_1fr))] items-center gap-4 pt-2 pr-4',
  'pb-2 pl-4 border-b [border-bottom-style:solid] border-b-[color:var(--line)] min-h-9 bg-page max-[600px]:px-3',
  'max-[600px]:gap-3',
);

export const skeletonTableRowStyles = cn(
  'grid grid-cols-[repeat(var(--skeleton-columns,_4),_minmax(0,_1fr))] items-center gap-4 pt-2 pr-4',
  'pb-2 pl-4 border-b [border-bottom-style:solid] border-b-[color:var(--line)] min-h-[45px] [&:last-child]:border-b-0',
  'max-[600px]:px-3 max-[600px]:gap-3',
);

export const skeletonListStyles = cn(
  "min-w-0 max-[800px]:[[class~='group/skeleton-review-inbox']_&]:grid",
  "max-[800px]:[[class~='group/skeleton-review-inbox']_&]:[grid-auto-flow:column]",
  "max-[800px]:[[class~='group/skeleton-review-inbox']_&]:[grid-auto-columns:220px]",
  "max-[800px]:[[class~='group/skeleton-review-inbox']_&]:gap-3",
  "max-[800px]:[[class~='group/skeleton-review-inbox']_&]:overflow-hidden",
);

export const skeletonListRowStyles = cn(
  'flex items-center gap-3 min-h-14 pt-2.5 pr-0 pb-2.5 pl-0 border-b [border-bottom-style:solid] border-b-[color:var(--line)]',
  "[&:last-child]:border-b-0 max-[800px]:[[class~='group/skeleton-review-inbox']_&]:min-h-17",
  "max-[800px]:[[class~='group/skeleton-review-inbox']_&]:pt-2.5",
  "max-[800px]:[[class~='group/skeleton-review-inbox']_&]:pr-2.5",
  "max-[800px]:[[class~='group/skeleton-review-inbox']_&]:pb-2.5",
  "max-[800px]:[[class~='group/skeleton-review-inbox']_&]:pl-2.5",
  "max-[800px]:[[class~='group/skeleton-review-inbox']_&]:border-b-0",
);

export const skeletonFormStyles =
  "[[class~='group/skeleton-card']_>_&]:flex-1 flex flex-col gap-5 min-w-0";

export const skeletonFieldStyles = 'group/skeleton-field flex flex-col gap-[9px] min-w-0';

export const skeletonFormActionStyles = '[align-self:flex-start] mt-auto';

export const skeletonSummaryStyles = 'flex flex-col gap-3';

export const skeletonSummaryRowStyles = cn(
  'flex items-center justify-between gap-5 min-h-9 pt-2 pr-0 pb-2 pl-0',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)]',
);

export const skeletonProfileBannerStyles = cn(
  'group/skeleton-profile-banner flex items-center gap-5 min-h-30.5 mb-5 pt-6 pr-6 pb-6 pl-6',
  'border border-solid border-[color:var(--line)] rounded-[18px] bg-paper max-[760px]:flex-wrap max-[760px]:pt-5',
  'max-[760px]:pr-5 max-[760px]:pb-5 max-[760px]:pl-5 max-[760px]:gap-4',
);

export const skeletonProfileGridStyles = cn(
  'grid grid-cols-[minmax(0,_1.2fr)_minmax(0,_0.8fr)] gap-5',
  'max-[1000px]:grid-cols-[minmax(0,_1fr)_minmax(0,_0.9fr)] max-[760px]:grid-cols-[minmax(0,_1fr)]',
);

export const skeletonProfileSideStyles = 'group/skeleton-profile-side flex flex-col gap-5 min-w-0';

export const skeletonCodeStyles =
  'flex flex-col gap-2.5 min-w-0 min-h-0 pt-4 pr-4 pb-4 pl-4 overflow-hidden bg-paper';

export const skeletonCodeLineStyles =
  'grid grid-cols-[24px_minmax(0,_1fr)] items-center gap-3.5 min-h-3';

export const skeletonDetailStyles = 'flex flex-col gap-5 min-w-0 bg-paper';

export const skeletonDetailHeadingStyles = 'flex items-center gap-3.5 min-w-0';

export const skeletonDetailMetaStyles = cn(
  'grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-4 pt-4.5 pr-0 pb-4.5 pl-0',
  'border-t [border-top-style:solid] border-t-[color:var(--line)] border-b [border-bottom-style:solid] border-b-[color:var(--line)] max-[600px]:gap-3',
);

export const skeletonTabsStyles = 'mt-1 rounded-[6px]';

export const skeletonReviewStyles = cn(
  'grid grid-cols-[235px_minmax(0,_1fr)] items-start gap-5.5',
  'max-[1050px]:grid-cols-[205px_minmax(0,_1fr)] max-[1050px]:gap-[15px]',
  'max-[800px]:grid-cols-[minmax(0,_1fr)]',
);

export const skeletonReviewInboxStyles = cn(
  'group/skeleton-review-inbox min-w-0 pt-4 pr-4 pb-4 pl-4 border border-solid border-[color:var(--line)]',
  'rounded-[13px] bg-paper max-[800px]:pt-[7px] max-[800px]:pr-[7px] max-[800px]:pb-[7px]',
  'max-[800px]:pl-[7px]',
);

export const skeletonReviewStageStyles =
  'group/skeleton-review-stage flex flex-col gap-3.5 min-w-0';

export const skeletonPageStyles = 'min-w-0';

export const skeletonPublishStyles = 'flex flex-col gap-5 max-w-250';

export const userAvatarStyles = cn(
  'block shrink-0 overflow-hidden rounded-[50%]',
  '[box-shadow:0_0_0_1px_color-mix(in_srgb,_var(--ink)_10%,_transparent)] [vertical-align:middle]',
  'group/user-avatar',
);
