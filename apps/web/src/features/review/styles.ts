import { cn } from '../../shared/styles/cn.js';

export const reviewTreeFileStyles = cn(
  'border-0 [background:none] flex items-center gap-1.5 w-full text-left text-ink',
  'text-[length:12px] pt-[7px] pr-2.5 pb-[7px] pl-2.5 min-h-9 whitespace-nowrap [&_>_span]:flex-1',
  '[&_>_span]:min-w-0 [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_svg]:shrink-0',
  "[&_>_svg]:text-muted-ink hover:bg-page [&[class~='group/selected']]:bg-brand-soft",
  "[&[class~='group/selected']]:[box-shadow:inset_2px_0_var(--brand)]",
  "[&[class~='group/selected']]:text-brand [&_i]:font-mono [&_i]:text-caption",
  '[&_i]:[font-style:normal] [&_i]:min-w-3.5 [&_i]:text-center [&_i]:shrink-0',
  'max-[600px]:text-[length:11px] max-[600px]:min-h-[29px] max-[600px]:pt-1.5 max-[600px]:pb-1.5',
  'focus-visible:[outline:2px_solid_var(--brand)] focus-visible:[outline-offset:-2px]',
);

export const reviewTreeFolderStyles = cn(
  'border-0 [background:none] flex items-center gap-1.5 w-full text-left text-muted-ink',
  'text-caption pt-[7px] pr-2.5 pb-[7px] pl-2.5 min-h-9 whitespace-nowrap font-medium',
  '[&_>_span]:flex-1 [&_>_span]:min-w-0 [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis',
  '[&_>_svg]:shrink-0 [&_>_svg]:text-muted-ink hover:bg-page [&_small]:text-caption',
  '[&_small]:text-muted-ink [&_small]:font-normal max-[600px]:text-[length:11px]',
  'max-[600px]:min-h-[29px] max-[600px]:pt-1.5 max-[600px]:pb-1.5',
  'focus-visible:[outline:2px_solid_var(--brand)] focus-visible:[outline-offset:-2px]',
);

export const reviewFileWorkbenchStyles =
  'bg-paper border border-solid border-[color:var(--line)] rounded-[12px] overflow-hidden min-w-0';

export const reviewFileToolbarStyles = cn(
  'group/review-file-toolbar flex items-center justify-between gap-3 pt-[13px] pr-4 pb-[13px] pl-4',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-2',
  '[&_svg]:text-muted-ink [&_strong]:text-[length:12px] [&_strong]:[font-weight:550]',
  '[&_span]:text-[length:11px] [&_span]:text-muted-ink [&_select]:border [&_select]:border-solid [&_select]:border-[color:var(--line)]',
  '[&_select]:rounded-[6px] [&_select]:bg-paper [&_select]:text-muted-ink [&_select]:pt-1',
  '[&_select]:pr-[7px] [&_select]:pb-1 [&_select]:pl-[7px] [&_select]:text-[length:11px]',
  '[&_select]:max-w-[155px] [&_select]:min-h-7.5 max-[600px]:pt-[11px] max-[600px]:pr-3',
  'max-[600px]:pb-[11px] max-[600px]:pl-3 max-[600px]:gap-[5px]',
  'max-[600px]:[&_strong]:text-[length:11px] max-[600px]:[&_span]:text-[length:9px]',
  'max-[600px]:[&_select]:text-[length:9px] max-[600px]:[&_select]:max-w-32.5',
  "[&_>_[class~='group/hub-select']]:w-50 max-[760px]:[&_>_[class~='group/hub-select']]:w-[155px]",
  "[&_[class~='group/hub-select-trigger']]:min-h-9",
  "[&_[class~='group/hub-select-trigger']]:text-[length:12px]",
  "[&_[class~='group/hub-select-trigger']]:pt-[7px] [&_[class~='group/hub-select-trigger']]:pr-2.5",
  "[&_[class~='group/hub-select-trigger']]:pb-[7px] [&_[class~='group/hub-select-trigger']]:pl-2.5",
);

export const reviewFileSplitStyles = cn(
  'grid grid-cols-[230px_minmax(0,_1fr)] h-127.5 max-h-[65vh] min-h-87.5',
  'min-[1300px]:grid-cols-[240px_minmax(0,_1fr)] max-[1050px]:grid-cols-[185px_minmax(0,_1fr)]',
  'max-[800px]:grid-cols-[210px_minmax(0,_1fr)] max-[600px]:grid-cols-[1fr] max-[600px]:h-auto',
  'max-[600px]:max-h-[none] max-[600px]:min-h-0',
);

export const reviewFileExplorerStyles = cn(
  'min-w-0 border-r [border-right-style:solid] border-r-[color:var(--line)] flex flex-col',
  '[background:color-mix(in_srgb,_var(--page),_var(--paper)_50%)] overflow-hidden',
  'max-[600px]:border-r-0 max-[600px]:border-b max-[600px]:[border-bottom-style:solid] max-[600px]:border-b-[color:var(--line)]',
  'max-[600px]:max-h-[205px]',
);

export const fileExplorerSearchStyles = cn(
  'flex items-center gap-1.5 pt-3 pr-2.5 pb-3 pl-2.5 border-b [border-bottom-style:solid] border-b-[color:var(--line)]',
  'text-muted-ink shrink-0 [&_input]:w-full [&_input]:min-w-0 [&_input]:[background:none]',
  '[&_input]:border-0 [&_input]:[outline:0] [&_input]:text-ink [&_input]:text-[length:11px]',
  'max-[600px]:pt-2.5 max-[600px]:pr-3 max-[600px]:pb-2.5 max-[600px]:pl-3',
  '[&:focus-within]:[box-shadow:inset_0_-2px_var(--brand)]',
);

export const reviewFileTreeStyles = cn(
  'overflow-auto flex-1 min-h-0 pt-[7px] pr-0 pb-[7px] pl-0 [overscroll-behavior:contain]',
  '[scrollbar-width:thin] max-[600px]:max-h-35 max-[600px]:min-h-[65px] max-[600px]:[flex:auto]',
);

export const fileTreeEmptyStyles = cn(
  'text-center pt-[25px] pr-[13px] pb-[25px] pl-[13px] text-muted-ink text-[length:11px]',
  'leading-[1.9]',
);

export const fileTreeLegendStyles = cn(
  'flex gap-3 pt-2.5 pr-3 pb-2.5 pl-3 border-t [border-top-style:solid] border-t-[color:var(--line)] text-[length:9px]',
  'text-muted-ink shrink-0 [&_i]:[font-style:normal] [&_i]:font-mono [&_i]:mr-1 max-[600px]:hidden',
);

export const addedStyles = 'group/added text-success';

export const modifiedStyles = 'text-warning';

export const removedStyles = 'group/removed text-danger';

export const reviewFileViewerStyles = cn(
  'min-w-0 min-h-0 flex flex-col overflow-hidden max-[600px]:h-95 max-[600px]:max-h-[55vh]',
  'max-[600px]:min-h-65',
);

export const fileViewerTitleStyles = cn(
  'scroll-mt-25 outline-none data-[highlighted=true]:bg-brand-soft',
  'focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
  'flex justify-between items-center gap-2.5 pt-3 pr-3.5 pb-3 pl-3.5',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] shrink-0 [&_>_div:first-child]:flex',
  '[&_>_div:first-child]:items-center [&_>_div:first-child]:gap-[7px] [&_>_div:first-child]:min-w-0',
  '[&_>_div:first-child]:flex-1 [&_>_div:first-child_svg]:text-muted-ink',
  '[&_>_div:first-child_svg]:shrink-0 [&_code]:text-[length:11px] [&_code]:whitespace-nowrap',
  '[&_code]:overflow-hidden [&_code]:text-ellipsis max-[600px]:pt-[11px] max-[600px]:pr-3',
  'max-[600px]:pb-[11px] max-[600px]:pl-3 max-[600px]:[&_code]:text-[length:9px]',
);

export const fileViewerDownloadsStyles =
  'flex gap-[11px] [&_a]:flex [&_a]:text-muted-ink [&_a:hover]:text-brand';

export const fileViewerSubbarStyles = cn(
  'flex justify-between items-center pt-[7px] pr-3 pb-[7px] pl-3',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] gap-2 shrink-0 [&_>_span]:text-[length:9px]',
  '[&_>_span]:text-muted-ink [&_>_span]:ml-auto [&_>_div]:flex [&_>_div]:bg-page [&_>_div]:pt-0.5',
  '[&_>_div]:pr-0.5 [&_>_div]:pb-0.5 [&_>_div]:pl-0.5 [&_>_div]:rounded-[5px] [&_>_div]:gap-0.5',
  '[&_button]:pt-0.5 [&_button]:pr-2 [&_button]:pb-0.5 [&_button]:pl-2 [&_button]:[background:none]',
  '[&_button]:border-0 [&_button]:rounded-[4px] [&_button]:text-[length:11px]',
  "[&_button]:text-muted-ink [&_button]:min-h-6.5 [&_button[class~='group/selected']]:bg-paper",
  "[&_button[class~='group/selected']]:[box-shadow:0_1px_3px_var(--shadow-color)]",
  "[&_button[class~='group/selected']]:text-ink max-[600px]:flex-wrap",
  'max-[600px]:[&_>_span]:text-[length:9px]',
);

export const fileWrapToggleStyles = cn(
  'flex items-center gap-1 pt-[3px] pr-1.5 pb-[3px] pl-1.5 border-0 rounded-[5px]',
  "[background:none] text-muted-ink [&[aria-pressed='true']]:bg-brand-soft",
  "[&[aria-pressed='true']]:text-brand",
);

export const fileViewerLoadingStyles = 'flex flex-1 min-w-0 min-h-0 items-stretch';

export const filePreviewUnavailableStyles = cn(
  'group/file-preview-unavailable flex-1 flex flex-col items-center justify-center text-center',
  'pt-5.5 pr-7.5 pb-5.5 pl-7.5 gap-3 text-muted-ink [&_>_svg]:text-warning [&_h4]:text-[length:15px]',
  '[&_h4]:text-ink [&_p]:text-[length:11px] [&_p]:leading-[1.8] [&_p]:max-w-90',
  '[&_code]:text-[length:9px] [&_code]:[overflow-wrap:anywhere] [&_code]:max-w-full',
  'max-[600px]:pt-4.5 max-[600px]:pr-5 max-[600px]:pb-4.5 max-[600px]:pl-5',
  "max-[600px]:[&_p]:text-[length:11px] [&_[class~='group/btn']]:text-[length:11px]",
  "[&_[class~='group/btn']]:min-h-8.5",
);

export const reviewCodeScrollStyles = cn(
  'group/review-code-scroll flex-1 min-h-0 overflow-auto font-mono bg-paper',
  '[overscroll-behavior:contain] [scrollbar-width:thin]',
);

export const wrapLinesStyles = 'group/wrap-lines';

export const reviewCodeLinesStyles = cn(
  'min-w-full w-[max-content] pt-2.5 pr-0 pb-2.5 pl-0',
  "[[class~='group/review-code-scroll'][class~='group/wrap-lines']_&]:w-full",
);

export const reviewCodeLineStyles = cn(
  'flex whitespace-pre min-h-[21px] text-[length:11px] leading-[21px] text-ink items-start',
  "[&[class~='group/added']]:bg-success-soft",
  "[&[class~='group/removed']]:bg-danger-soft",
  '[&_code]:[font:inherit] [&_code]:whitespace-pre [&_code]:pr-4.5 max-[800px]:text-[length:11px]',
  'max-[600px]:text-[length:11px] max-[600px]:leading-[20px] max-[600px]:min-h-5',
  "[[class~='group/wrap-lines']_&]:whitespace-pre-wrap",
  "[[class~='group/wrap-lines']_&_code]:whitespace-pre-wrap",
  "[[class~='group/wrap-lines']_&_code]:[overflow-wrap:anywhere]",
  "[[class~='group/wrap-lines']_&_code]:min-w-0 [[class~='group/wrap-lines']_&_code]:flex-1",
);

export const lineOldStyles = cn(
  'w-[31px] shrink-0 text-right pr-[7px]',
  'text-[color-mix(in_srgb,_var(--muted-ink),_transparent_30%)] select-none text-[length:9px]',
  'max-[600px]:w-6 max-[600px]:text-[length:9px] max-[600px]:pr-[5px]',
);

export const lineNewStyles = cn(
  'w-[31px] shrink-0 text-right pr-[7px]',
  'text-[color-mix(in_srgb,_var(--muted-ink),_transparent_30%)] select-none text-[length:9px]',
  'max-[600px]:w-6 max-[600px]:text-[length:9px] max-[600px]:pr-[5px]',
);

export const lineSignStyles = cn(
  "w-4 shrink-0 text-center text-muted-ink select-none [[class~='group/added']_>_&]:text-success",
  "[[class~='group/removed']_>_&]:text-danger max-[600px]:w-[13px]",
);

export const filePreviewLimitStyles = cn(
  'text-[length:11px] pt-2 pr-3 pb-2 pl-3 bg-page text-muted-ink border-t [border-top-style:solid] border-t-[color:var(--line)]',
  'shrink-0',
);

export const reviewOverviewStyles = cn(
  'border border-solid border-[color:var(--line)] rounded-[13px] bg-paper pt-[17px] pr-5 pb-0 pl-5',
  'max-[1050px]:pt-4.5 max-[1050px]:pr-4.5 max-[1050px]:pb-0 max-[1050px]:pl-4.5 max-[600px]:pt-4',
  'max-[600px]:pr-3.5 max-[600px]:pb-0 max-[600px]:pl-3.5',
);

export const reviewAssetHeadingStyles = cn(
  'group/review-asset-heading flex items-center gap-[11px] [&_>_div]:min-w-0 [&_>_div]:flex-1',
  '[&_h2]:font-mono [&_h2]:leading-[1.6] [&_h2]:[overflow-wrap:anywhere] [&_h2]:text-[length:19px]',
  'max-[600px]:gap-[9px] max-[600px]:[&_h2]:text-[length:15px]',
  "max-[600px]:[&_>_[class~='group/tag']]:text-[length:9px]",
);

export const reviewAssetIconStyles = cn(
  'flex pt-[11px] pr-[11px] pb-[11px] pl-[11px] bg-brand-soft text-brand rounded-[12px] shrink-0',
  'max-[600px]:pt-[9px] max-[600px]:pr-[9px] max-[600px]:pb-[9px] max-[600px]:pl-[9px]',
);

export const reviewAssetKickerStyles =
  'flex gap-1.5 text-[length:11px] text-muted-ink mb-[3px] max-[600px]:text-[length:11px]';

export const reviewJumpDecisionStyles = cn(
  'text-[length:11px] min-h-[31px] pt-[5px] pr-[9px] pb-[5px] pl-[9px] text-brand bg-brand-soft',
  'border-t-transparent border-r-transparent border-b-transparent',
  'border-l-transparent max-[600px]:hidden',
);

export const reviewSummaryGridStyles = cn(
  'grid grid-cols-[1.2fr_1.1fr_1fr] gap-[15px] pt-4 pr-0 pb-4 pl-0 [&_>_div]:min-w-0',
  '[&_>_div]:border-r [&_>_div]:[border-right-style:solid] [&_>_div]:border-r-[color:var(--line)] [&_>_div]:pr-3 [&_>_div]:flex [&_>_div]:flex-col',
  '[&_>_div]:gap-[7px] [&_>_div:last-child]:border-0 [&_>_div_>_span]:text-[length:11px]',
  '[&_>_div_>_span]:text-muted-ink [&_strong]:text-[length:12px] [&_strong]:flex',
  '[&_strong]:items-center [&_strong]:gap-[7px] [&_strong]:flex-wrap [&_strong]:[font-weight:550]',
  'max-[1050px]:grid-cols-[1fr_1fr] max-[1050px]:gap-3 max-[1050px]:pt-4.5 max-[1050px]:pr-0',
  'max-[1050px]:pb-[15px] max-[1050px]:pl-0 max-[1050px]:[&_>_div:last-child]:[grid-column:1/-1]',
  'max-[1050px]:[&_>_div:last-child]:pt-2.5',
  'max-[1050px]:[&_>_div:last-child]:border-t max-[1050px]:[&_>_div:last-child]:[border-top-style:solid] max-[1050px]:[&_>_div:last-child]:border-t-[color:var(--line)]',
  'max-[1050px]:[&_>_div:last-child]:flex-row max-[1050px]:[&_>_div:last-child]:items-center',
  'max-[1050px]:[&_>_div:last-child]:gap-[15px] max-[1050px]:[&_>_div:nth-child(2)]:border-0',
  'max-[600px]:[&_strong]:text-[length:12px] max-[600px]:[&_>_div_>_span]:text-[length:11px]',
  'max-[600px]:gap-2.5',
);

export const versionTransitionStyles = cn(
  'flex items-center gap-[7px] [&_code]:text-[length:11px] [&_code]:[overflow-wrap:anywhere]',
  'max-[600px]:[&_code]:text-[length:11px]',
);

export const miniLabelStyles = cn(
  'text-[length:9px] font-normal border border-solid border-[color:var(--line)] pt-px pr-1 pb-px pl-1 rounded-[4px]',
  "text-muted-ink whitespace-nowrap [&[class~='group/expanded']]:text-warning",
  "[&[class~='group/expanded']]:border-t-[color:color-mix(in_srgb,_var(--warning),_transparent_65%)]",
  "[&[class~='group/expanded']]:border-r-[color:color-mix(in_srgb,_var(--warning),_transparent_65%)]",
  "[&[class~='group/expanded']]:border-b-[color:color-mix(in_srgb,_var(--warning),_transparent_65%)]",
  "[&[class~='group/expanded']]:border-l-[color:color-mix(in_srgb,_var(--warning),_transparent_65%)]",
);

export const expandedStyles = 'group/expanded';

export const changeSummaryStyles = 'flex gap-[7px] text-[length:11px] [&_i]:[font-style:normal]';

export const reviewInlineWarningStyles = cn(
  'flex items-start gap-[7px] text-warning',
  '[background:color-mix(in_srgb,_var(--warning),_transparent_94%)] pt-2.5 pr-3 pb-2.5 pl-3',
  'rounded-[7px] mb-[15px] text-[length:11px] [&_svg]:shrink-0 [&_svg]:mt-0.5',
);

export const reviewUsageStyles =
  'mb-4 flex min-w-0 flex-col gap-2 rounded-[10px] bg-page px-3.5 py-3';

export const reviewUsageHeadingStyles = cn(
  'flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
  '[&_h3]:text-label [&_h3]:font-medium [&_h3]:leading-normal',
);

export const reviewUsageDeclarationStyles = 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5';

export const reviewUsageDescriptionStyles = 'text-caption text-muted-ink leading-[1.7]';

export const reviewStageTabsStyles = cn(
  'flex gap-[21px] border-t [border-top-style:solid] border-t-[color:var(--line)] [&_>_button]:flex [&_>_button]:items-center',
  '[&_>_button]:gap-[7px] [&_>_button]:[background:none] [&_>_button]:border-0',
  '[&_>_button]:leading-5 [&_>_button]:pt-2.5 [&_>_button]:pr-0',
  '[&_>_button]:pb-2.5 [&_>_button]:pl-0 [&_>_button]:text-muted-ink [&_>_button]:text-[length:12px]',
  "[&_>_button[class~='group/selected']]:text-brand",
  "[&_>_button[class~='group/selected']]:[box-shadow:inset_0_-2px_var(--brand)]",
  "[&_>_button[class~='group/selected']]:font-medium [&_>_button_>_span]:text-[length:9px]",
  '[&_>_button_>_span]:min-w-[17px] [&_>_button_>_span]:pt-0 [&_>_button_>_span]:pr-1',
  '[&_>_button_>_span]:pb-0 [&_>_button_>_span]:pl-1 [&_>_button_>_span]:bg-page',
  '[&_>_button_>_span]:rounded-[4px] max-[600px]:gap-5 max-[600px]:[&_>_button]:pt-[11px]',
  'max-[600px]:[&_>_button]:pr-0 max-[600px]:[&_>_button]:pb-[11px] max-[600px]:[&_>_button]:pl-0',
  'max-[600px]:[&_>_button]:gap-[5px] max-[600px]:[&_>_button]:text-[length:11px]',
);

export const nominationReviewSummaryStyles = cn(
  'flex flex-col gap-[var(--space-4)] pt-[var(--space-4)] pr-[var(--space-4)] pb-[var(--space-4)]',
  'pl-[var(--space-4)] border border-solid border-[color:var(--line)] rounded-[14px] bg-paper',
  '[&_>_p]:mt-[var(--space-1)] [&_>_p]:text-muted-ink [&_>_p]:text-label [&_>_p]:leading-[1.8]',
  '[&_>_p]:[overflow-wrap:anywhere] [&_h3]:text-brand',
);

export const reviewEvidencePanelsStyles = 'flex flex-col gap-[var(--space-4)] min-w-0';

export const reviewRiskPanelStyles =
  'border border-solid border-[color:var(--line)] rounded-[11px] bg-paper overflow-hidden';

export const reviewRiskHeadingStyles = cn(
  'pt-[11px] pr-4 pb-[11px] pl-4 flex items-center justify-between gap-[15px]',
  '[&_>_span:last-child]:text-[length:11px] [&_>_span:last-child]:text-muted-ink max-[600px]:pt-3',
  'max-[600px]:pr-[13px] max-[600px]:pb-3 max-[600px]:pl-[13px] max-[600px]:gap-2',
  'max-[600px]:items-start max-[600px]:[&_>_span:last-child]:text-[length:9px]',
  'max-[600px]:[&_>_span:last-child]:max-w-25 max-[600px]:[&_>_span:last-child]:text-right',
);

export const reviewRiskStatusStyles = cn(
  'flex items-center gap-[7px] text-brand text-[length:12px] font-medium',
  'max-[600px]:text-[length:11px] max-[600px]:gap-[5px]',
);

export const reviewRiskItemsStyles =
  'border-t [border-top-style:solid] border-t-[color:var(--line)] max-h-52.5 overflow-auto max-[600px]:max-h-65';

export const reviewRiskItemStyles = cn(
  'group/review-risk-item flex gap-3 pt-3 pr-4 pb-3 pl-4 border-b [border-bottom-style:solid] border-b-[color:var(--line)]',
  '[background:color-mix(in_srgb,_var(--warning),_transparent_97%)] [&:last-child]:border-0',
  '[&_>_div]:min-w-0 [&_>_div]:flex-1',
  "[&[class~='group/block']]:[background:color-mix(in_srgb,_var(--danger),_transparent_96%)]",
  '[&_strong]:[font-weight:550] [&_strong]:text-[length:12px] [&_code]:block',
  '[&_code]:[overflow-wrap:anywhere] [&_code]:text-[length:11px] [&_code]:text-muted-ink',
  '[&_code]:mt-1 [&_code]:mr-0 [&_code]:mb-1 [&_code]:ml-0 [&_p]:leading-[1.9] [&_p]:text-muted-ink',
  '[&_p]:text-[length:11px] [&_small]:block [&_small]:text-[length:11px] [&_small]:text-brand',
  '[&_small]:mt-2 max-[600px]:pt-3 max-[600px]:pr-3 max-[600px]:pb-3 max-[600px]:pl-3',
  'max-[600px]:gap-2 max-[600px]:[&_strong]:text-[length:11px]',
  'max-[600px]:[&_code]:text-[length:9px] max-[600px]:[&_p]:text-[length:11px]',
);

export const riskLevelStyles = cn(
  'text-[length:9px] pt-0.5 pr-1.5 pb-0.5 pl-1.5',
  '[background:color-mix(in_srgb,_var(--warning),_transparent_90%)] text-warning rounded-[4px]',
  'whitespace-nowrap h-[fit-content] mt-px',
  "[[class~='group/review-risk-item'][class~='group/block']_&]:text-danger",
  "[[class~='group/review-risk-item'][class~='group/block']_&]:[background:color-mix(in_srgb,_var(--danger),_transparent_90%)]",
);

export const riskFileLinkStyles = cn(
  'flex items-center gap-[5px] max-w-full pt-0 pr-0 pb-0 pl-0 border-0 [background:none] text-left',
  'text-brand cursor-pointer [&_code]:text-[length:11px] [&_code]:text-inherit [&_svg]:shrink-0',
  'hover:[text-decoration:underline]',
);

export const scanInformationalStyles = cn(
  'border-t [border-top-style:solid] border-t-[color:var(--line)] text-muted-ink text-[length:11px] [&_>_summary]:flex',
  '[&_>_summary]:items-center [&_>_summary]:gap-1.5 [&_>_summary]:pt-[11px] [&_>_summary]:pr-[17px]',
  '[&_>_summary]:pb-[11px] [&_>_summary]:pl-[17px] [&_>_summary]:cursor-pointer',
  '[&_>_summary]:[list-style:none] [&_>_summary::-webkit-details-marker]:hidden',
  '[&_>_summary_>_svg:last-child]:ml-auto [&_>_div]:max-h-50 [&_>_div]:overflow-auto [&_>_div]:pt-0',
  '[&_>_div]:pr-[17px] [&_>_div]:pb-3 [&_>_div]:pl-[17px] [&_p]:flex [&_p]:flex-col [&_p]:gap-1',
  '[&_p]:pt-[9px] [&_p]:pr-0 [&_p]:pb-[9px] [&_p]:pl-0 [&_p]:border-t [&_p]:[border-top-style:solid] [&_p]:border-t-[color:var(--line)]',
  '[&_p]:leading-[1.6] [&_code]:text-[length:9px] [&_code]:[overflow-wrap:anywhere]',
  'max-[600px]:[&_>_summary]:pt-2.5 max-[600px]:[&_>_summary]:pr-[13px]',
  'max-[600px]:[&_>_summary]:pb-2.5 max-[600px]:[&_>_summary]:pl-[13px]',
);

export const reviewPolicyPanelStyles = cn(
  'bg-paper border border-solid border-[color:var(--line)] rounded-[12px] pt-6 pr-6 pb-6 pl-6',
  '[&_h3]:text-[length:15px] [&_>_p]:text-[length:12px] [&_>_p]:text-muted-ink [&_>_p]:mt-3',
  '[&_>_p]:mr-0 [&_>_p]:mb-3 [&_>_p]:ml-0 [&_>_p]:leading-[1.9] max-[600px]:pt-4.5',
  'max-[600px]:pr-[15px] max-[600px]:pb-4.5 max-[600px]:pl-[15px]',
);

export const policyFactsStyles = cn(
  'grid grid-cols-[1fr_1fr] gap-4.5 pt-5 pr-0 pb-5 pl-0 border-t [border-top-style:solid] border-t-[color:var(--line)]',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] mt-[21px] [&_>_span]:text-[length:11px]',
  '[&_>_span]:text-muted-ink [&_strong]:block [&_strong]:text-ink [&_strong]:text-[length:12px]',
  '[&_strong]:font-medium [&_strong]:mt-1.5 max-[600px]:gap-3.5',
  'max-[600px]:[&_strong]:text-[length:11px]',
);

export const policyComparisonStyles = cn(
  'flex items-center gap-2.5 flex-wrap mt-5 text-[length:11px] [&_>_span]:text-muted-ink',
  '[&_>_span]:text-[length:11px] [&_strong]:font-medium',
);

export const digestPanelStyles = cn(
  'mt-6 bg-page border border-solid border-[color:var(--line)] rounded-[10px] pt-4 pr-4 pb-4 pl-4 flex flex-col',
  'gap-2 [&_>_span]:flex [&_>_span]:items-center [&_>_span]:gap-1.5 [&_>_span]:text-brand',
  '[&_>_span]:text-[length:11px] [&_>_span]:font-medium [&_code]:text-[length:11px]',
  '[&_code]:[overflow-wrap:anywhere] [&_code]:text-muted-ink [&_small]:text-[length:11px]',
  '[&_small]:text-muted-ink',
);

export const reviewDecisionDockStyles = cn(
  'group/review-decision-dock flex items-center justify-between gap-[15px] sticky bottom-4 z-[10]',
  'pt-[13px] pr-[17px] pb-[13px] pl-[17px]',
  'border border-solid border-[color:color-mix(in_srgb,_var(--brand),_transparent_73%)] bg-paper rounded-[11px]',
  '[box-shadow:0_4px_24px_var(--shadow-color)] [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-[9px]',
  '[&_>_div]:text-brand [&_strong]:block [&_strong]:text-[length:12px] [&_strong]:font-medium',
  '[&_strong]:text-ink [&_small]:block [&_small]:text-[length:11px] [&_small]:text-muted-ink',
  '[&_small]:mt-[3px] max-[600px]:flex-wrap max-[600px]:[&>div:last-child]:ml-auto max-[600px]:bottom-2.5 max-[600px]:pt-[11px] max-[600px]:pr-3',
  'max-[600px]:pb-[11px] max-[600px]:pl-3 max-[600px]:gap-[9px]',
  'max-[600px]:[&_strong]:text-[length:11px] max-[600px]:[&_small]:text-[length:9px]',
  "max-[600px]:[&_>_div_>_svg]:hidden [&_[class~='group/btn']]:min-h-9.5",
  "[&_[class~='group/btn']]:text-[length:12px] [&_[class~='group/btn']]:whitespace-nowrap",
  "max-[600px]:[&_[class~='group/btn']]:min-h-[37px]",
  "max-[600px]:[&_[class~='group/btn']]:text-[length:11px] max-[600px]:[&_[class~='group/btn']]:pt-2",
  "max-[600px]:[&_[class~='group/btn']]:pr-[11px] max-[600px]:[&_[class~='group/btn']]:pb-2",
  "max-[600px]:[&_[class~='group/btn']]:pl-[11px]",
);

export const reviewDecisionSheetHeaderStyles = cn(
  'shrink-0 flex items-center justify-between pt-[23px] pr-6.5 pb-[23px] pl-6.5',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] [&_>_span]:flex [&_>_span]:items-center',
  '[&_>_span]:gap-[9px] [&_>_span]:text-[length:17px] [&_>_span]:[font-weight:550] [&_svg]:text-brand',
  'max-[600px]:pt-4.5 max-[600px]:pr-4.5 max-[600px]:pb-4.5 max-[600px]:pl-4.5',
  'max-[600px]:[&_>_span]:text-[length:17px]',
);

export const reviewDecisionPanelStyles = cn(
  'group/review-decision-panel border border-solid border-[color:var(--line)] rounded-[12px] bg-paper pt-5 pr-5.5',
  'pb-5 pl-5.5 [scroll-margin-top:110px] [&_textarea]:w-full',
  '[&_textarea]:border [&_textarea]:border-solid [&_textarea]:border-[color:var(--line)] [&_textarea]:rounded-[8px] [&_textarea]:pt-2.5',
  '[&_textarea]:pr-3 [&_textarea]:pb-2.5 [&_textarea]:pl-3 [&_textarea]:[resize:vertical]',
  '[&_textarea]:min-h-[75px] [&_textarea]:bg-paper [&_textarea]:text-ink',
  '[&_textarea]:text-[length:12px] [&_textarea]:leading-[1.8] max-[600px]:pt-4 max-[600px]:pr-[15px]',
  "max-[600px]:pb-4 max-[600px]:pl-[15px] [&_>_[class~='group/notice']]:mt-3",
);

export const reviewDecisionSheetBodyStyles = cn(
  'group/review-decision-sheet-body border-0 rounded-none flex-1 overflow-auto pt-6 pr-6.5 pb-6',
  'pl-6.5 [overscroll-behavior:contain] [scrollbar-width:thin] [&_textarea]:text-[length:12px]',
  '[&_textarea]:min-h-[105px] max-[600px]:pt-5 max-[600px]:pr-4.5 max-[600px]:pb-5',
  "max-[600px]:pl-4.5 [&_[class~='group/decision-panel-footer']_[class~='group/btn']]:min-h-[43px]",
  "[&_[class~='group/decision-panel-footer']_[class~='group/btn']]:text-[length:12px]",
);

export const decisionPanelHeadingStyles = cn(
  'flex items-center gap-2.5 mb-[15px] [&_h3]:text-[length:12px] [&_p]:text-[length:11px]',
  '[&_p]:text-muted-ink [&_p]:mt-[3px] max-[600px]:items-start max-[600px]:gap-2',
  'max-[600px]:[&_p]:text-[length:11px] max-[600px]:[&_p]:leading-[1.8]',
  "[[class~='group/review-decision-sheet-body']_&_h3]:font-mono",
  "[[class~='group/review-decision-sheet-body']_&_h3]:text-[length:17px]",
  "[[class~='group/review-decision-sheet-body']_&_h3]:[overflow-wrap:anywhere]",
  "[[class~='group/review-decision-sheet-body']_&_p]:text-[length:12px]",
  "[[class~='group/review-decision-sheet-body']_&_p]:mt-1.5",
  "max-[600px]:[[class~='group/review-decision-sheet-body']_&_h3]:text-[length:15px]",
);

export const decisionIconStyles = 'flex pt-2 pr-2 pb-2 pl-2 bg-brand-soft text-brand rounded-[8px]';

export const decisionWarningStyles = cn(
  'group/decision-warning border border-solid border-[color:color-mix(in_srgb,_var(--warning),_transparent_75%)]',
  '[background:color-mix(in_srgb,_var(--warning),_transparent_97%)] rounded-[9px] pt-[15px] pr-[15px]',
  'pb-[15px] pl-[15px] mt-5 mr-0 mb-5 ml-0 [&_>_code]:block [&_>_code]:text-[length:11px]',
  '[&_>_code]:[overflow-wrap:anywhere] [&_>_code]:leading-[1.8] [&_>_code]:mt-[9px] [&_>_code]:mr-0',
  '[&_>_code]:mb-1.5 [&_>_code]:ml-0 [&_>_p]:text-[length:12px] [&_>_p]:leading-[1.8]',
  '[&_>_p]:text-muted-ink [&_textarea]:mt-[5px] [&_textarea]:min-h-[85px] [&_textarea]:bg-paper',
);

export const warningAcceptanceStyles = cn(
  'text-[length:11px] gap-[5px] mt-3 text-muted-ink [&_input]:border [&_input]:border-solid [&_input]:border-[color:var(--line)]',
  '[&_input]:bg-paper [&_input]:rounded-[7px] [&_input]:pt-2 [&_input]:pr-2.5 [&_input]:pb-2',
  '[&_input]:pl-2.5 [&_input]:text-[length:11px] [&_input]:text-ink [&_input]:w-full',
  "max-[600px]:[&_input]:text-[length:11px] [[class~='group/decision-warning']_&]:text-[length:12px]",
);

export const reviewAcknowledgementStyles = cn(
  'group/review-acknowledgement max-[600px]:text-[length:11px] max-[600px]:pt-2.5 max-[600px]:pr-2.5',
  'max-[600px]:pb-2.5 max-[600px]:pl-2.5',
  "[[class~='group/review-decision-sheet-body']_&]:text-[length:12px]",
);

export const reviewCommentLabelStyles = cn(
  'flex flex-row items-center gap-1.5 text-[length:11px] mb-[7px] [&_small]:text-[length:9px]',
  '[&_small]:font-normal [&_small]:text-muted-ink',
  "[[class~='group/review-decision-sheet-body']_&]:text-[length:12px]",
);

export const decisionPanelFooterStyles = cn(
  'group/decision-panel-footer flex items-center justify-between gap-[15px] mt-3.5',
  '[&_>_span]:text-[length:11px] [&_>_span]:text-muted-ink [&_>_div]:flex [&_>_div]:gap-[9px]',
  'max-[1050px]:items-end max-[1050px]:[&_>_span]:max-w-40 max-[1050px]:[&_>_span]:leading-[1.8]',
  'max-[600px]:flex-col max-[600px]:items-stretch max-[600px]:gap-3',
  'max-[600px]:[&_>_span]:max-w-none max-[600px]:[&_>_span]:text-[length:9px]',
  'max-[600px]:[&_>_div]:grid max-[600px]:[&_>_div]:grid-cols-[1fr_1.2fr]',
  "max-[600px]:[&_>_div]:gap-[9px] [[class~='group/review-decision-sheet-body']_&]:sticky",
  "[[class~='group/review-decision-sheet-body']_&]:bottom-[-24px]",
  "[[class~='group/review-decision-sheet-body']_&]:flex",
  "[[class~='group/review-decision-sheet-body']_&]:flex-col",
  "[[class~='group/review-decision-sheet-body']_&]:items-stretch",
  "[[class~='group/review-decision-sheet-body']_&]:mt-5",
  "[[class~='group/review-decision-sheet-body']_&]:mr-[-26px]",
  "[[class~='group/review-decision-sheet-body']_&]:mb-[-24px]",
  "[[class~='group/review-decision-sheet-body']_&]:ml-[-26px]",
  "[[class~='group/review-decision-sheet-body']_&]:pt-[17px]",
  "[[class~='group/review-decision-sheet-body']_&]:pr-6.5",
  "[[class~='group/review-decision-sheet-body']_&]:pb-6",
  "[[class~='group/review-decision-sheet-body']_&]:pl-6.5",
  "[[class~='group/review-decision-sheet-body']_&]:bg-paper",
  "[[class~='group/review-decision-sheet-body']_&]:border-t [[class~='group/review-decision-sheet-body']_&]:[border-top-style:solid] [[class~='group/review-decision-sheet-body']_&]:border-t-[color:var(--line)]",
  "[[class~='group/review-decision-sheet-body']_&]:[box-shadow:0_-6px_16px_var(--paper)]",
  "[[class~='group/review-decision-sheet-body']_&_>_span]:text-[length:11px]",
  "[[class~='group/review-decision-sheet-body']_&_>_span]:max-w-none",
  "[[class~='group/review-decision-sheet-body']_&_>_div]:grid",
  "[[class~='group/review-decision-sheet-body']_&_>_div]:grid-cols-[1fr_1.2fr]",
  "max-[600px]:[[class~='group/review-decision-sheet-body']_&]:mt-5",
  "max-[600px]:[[class~='group/review-decision-sheet-body']_&]:mr-[-18px]",
  "max-[600px]:[[class~='group/review-decision-sheet-body']_&]:mb-[-20px]",
  "max-[600px]:[[class~='group/review-decision-sheet-body']_&]:ml-[-18px]",
  "max-[600px]:[[class~='group/review-decision-sheet-body']_&]:pt-[15px]",
  "max-[600px]:[[class~='group/review-decision-sheet-body']_&]:pr-4.5",
  "max-[600px]:[[class~='group/review-decision-sheet-body']_&]:pb-5",
  "max-[600px]:[[class~='group/review-decision-sheet-body']_&]:pl-4.5",
  "max-[600px]:[[class~='group/review-decision-sheet-body']_&]:bottom-[-20px]",
  "[&_[class~='group/btn']]:text-[length:11px] [&_[class~='group/btn']]:pt-2",
  "[&_[class~='group/btn']]:pr-[13px] [&_[class~='group/btn']]:pb-2",
  "[&_[class~='group/btn']]:pl-[13px] [&_[class~='group/btn']]:min-h-9",
  "max-[600px]:[&_[class~='group/btn']]:text-[length:11px] max-[600px]:[&_[class~='group/btn']]:pt-2",
  "max-[600px]:[&_[class~='group/btn']]:pr-2 max-[600px]:[&_[class~='group/btn']]:pb-2",
  "max-[600px]:[&_[class~='group/btn']]:pl-2",
);

export const reviewViewOnlyStyles = cn(
  'flex items-start gap-2.5 bg-brand-soft text-brand',
  'border border-solid border-[color:color-mix(in_srgb,_var(--brand),_transparent_85%)] rounded-[10px] pt-4 pr-4.5',
  'pb-4 pl-4.5 [&_>_svg]:shrink-0 [&_>_svg]:mt-0.5 [&_strong]:text-[length:12px]',
  '[&_strong]:[font-weight:550] [&_p]:text-[length:11px] [&_p]:leading-[1.8] [&_p]:mt-1',
  '[&_p]:text-muted-ink max-[600px]:pt-3.5 max-[600px]:pr-3.5 max-[600px]:pb-3.5 max-[600px]:pl-3.5',
);

export const reviewRecordStyles = cn(
  'flex items-start gap-2.5 bg-brand-soft text-brand',
  'border border-solid border-[color:color-mix(in_srgb,_var(--brand),_transparent_85%)] rounded-[10px] pt-4 pr-4.5',
  'pb-4 pl-4.5 [&_>_svg]:shrink-0 [&_>_svg]:mt-0.5 [&_strong]:text-[length:12px]',
  '[&_strong]:[font-weight:550] [&_p]:text-[length:11px] [&_p]:leading-[1.8] [&_p]:mt-1',
  '[&_p]:text-muted-ink max-[600px]:pt-3.5 max-[600px]:pr-3.5 max-[600px]:pb-3.5 max-[600px]:pl-3.5',
);

export const reviewPageStyles = cn(
  "group/review-page max-[600px]:[&_[class~='group/page-head']_>_[class~='group/btn']]:min-h-8",
  "max-[600px]:[&_[class~='group/page-head']_>_[class~='group/btn']]:pt-1.5",
  "max-[600px]:[&_[class~='group/page-head']_>_[class~='group/btn']]:pr-2.5",
  "max-[600px]:[&_[class~='group/page-head']_>_[class~='group/btn']]:pb-1.5",
  "max-[600px]:[&_[class~='group/page-head']_>_[class~='group/btn']]:pl-2.5",
  "max-[600px]:[&_[class~='group/page-head']_>_[class~='group/btn']]:text-[length:11px]",
  "[&_[class~='group/page-head']_[class~='group/eyebrow']]:text-caption",
  "[&_[class~='group/page-head']_[class~='group/eyebrow']]:leading-[18px]",
  "[&_[class~='group/page-head']_[class~='group/eyebrow']]:mt-0",
  "[&_[class~='group/page-head']_[class~='group/eyebrow']]:mr-0",
  "[&_[class~='group/page-head']_[class~='group/eyebrow']]:mb-[var(--space-1)]",
  "[&_[class~='group/page-head']_[class~='group/eyebrow']]:ml-0 [&_[class~='group/page-head']]:pt-0",
  "[&_[class~='group/page-head']]:pr-0 [&_[class~='group/page-head']]:pb-[var(--section-gap)]",
  "[&_[class~='group/page-head']]:pl-0 [&_[class~='group/page-head']]:mt-0",
  "[&_[class~='group/page-head']]:mr-0 [&_[class~='group/page-head']]:mb-0",
  "[&_[class~='group/page-head']]:ml-0",
  "[&_[class~='group/page-head']_h1]:text-[length:31px]",
  "[&_[class~='group/page-head']_h1]:mt-0 [&_[class~='group/page-head']_h1]:mr-0",
  "[&_[class~='group/page-head']_h1]:mb-0 [&_[class~='group/page-head']_h1]:ml-0",
  "[&_[class~='group/page-head']_h1]:font-semibold [&_[class~='group/page-head']_h1]:leading-[1.4]",
  "[&_[class~='group/page-head']_h1]:tracking-[-0.015em]",
  "max-[800px]:[&_[class~='group/page-head']]:pt-7",
  "max-[800px]:[&_[class~='group/page-head']_h1]:text-[length:27px]",
  "max-[600px]:[&_[class~='group/page-head']]:gap-3",
  "max-[600px]:[&_[class~='group/page-head']]:pt-[23px]",
  "max-[600px]:[&_[class~='group/page-head']]:pr-0 max-[600px]:[&_[class~='group/page-head']]:pb-4",
  "max-[600px]:[&_[class~='group/page-head']]:pl-0",
  "max-[600px]:[&_[class~='group/page-head']_h1]:text-[length:25px]",
);

export const reviewStatusbarStyles = 'mb-6 flex min-w-0 items-center justify-between gap-4';

export const reviewWorkspaceStyles = cn(
  'grid grid-cols-[235px_minmax(0,_1fr)] items-start gap-5.5',
  'min-[1300px]:grid-cols-[240px_minmax(0,_1fr)] max-[1050px]:grid-cols-[205px_minmax(0,_1fr)]',
  'max-[1050px]:gap-[15px] max-[800px]:grid-cols-[1fr] max-[600px]:gap-[15px]',
);

export const reviewInboxStyles = cn(
  'sticky top-[101px] bg-paper border border-solid border-[color:var(--line)] rounded-[13px] overflow-hidden',
  'max-[800px]:static',
);

export const inboxCaptionStyles = cn(
  'flex justify-between pt-3.5 pr-4 pb-3.5 pl-4 text-[length:11px] text-muted-ink',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] [&_>_span:last-child]:bg-page',
  '[&_>_span:last-child]:min-w-4.5 [&_>_span:last-child]:text-center',
  '[&_>_span:last-child]:rounded-[4px] [&_>_span:last-child]:text-[length:11px] max-[800px]:hidden',
);

export const inboxItemsStyles = cn(
  'group/inbox-items max-h-[calc(100vh_-_270px)] overflow-y-auto pt-[7px] pr-[7px] pb-[7px] pl-[7px]',
  '[overscroll-behavior:contain] [scrollbar-width:thin] [&_>_button]:w-full',
  '[&_>_button]:border [&_>_button]:border-solid [&_>_button]:border-transparent [&_>_button]:rounded-[9px]',
  '[&_>_button]:bg-transparent [&_>_button]:text-ink [&_>_button]:text-left [&_>_button]:pt-[13px]',
  '[&_>_button]:pr-[11px] [&_>_button]:pb-[13px] [&_>_button]:pl-[11px] [&_>_button]:flex',
  '[&_>_button]:flex-col [&_>_button]:gap-[7px] [&_>_button]:mb-[5px]',
  "[&_>_button[class~='group/active']]:bg-brand-soft",
  "[&_>_button[class~='group/active']]:border-t-[color:color-mix(in_srgb,_var(--brand),_transparent_80%)]",
  "[&_>_button[class~='group/active']]:border-r-[color:color-mix(in_srgb,_var(--brand),_transparent_80%)]",
  "[&_>_button[class~='group/active']]:border-b-[color:color-mix(in_srgb,_var(--brand),_transparent_80%)]",
  "[&_>_button[class~='group/active']]:border-l-[color:color-mix(in_srgb,_var(--brand),_transparent_80%)]",
  '[&_strong]:font-mono [&_strong]:text-[length:12px] [&_strong]:font-semibold',
  '[&_strong]:[overflow-wrap:anywhere] [&_strong]:leading-[1.6]',
  '[&_>_button:focus-visible]:[outline:2px_solid_var(--brand)]',
  '[&_>_button:focus-visible]:[outline-offset:-2px] max-[800px]:grid',
  'max-[800px]:[grid-auto-flow:column] max-[800px]:[grid-auto-columns:220px]',
  'max-[800px]:max-h-[none] max-[800px]:overflow-x-auto max-[800px]:[&_>_button]:mt-0',
  'max-[800px]:[&_>_button]:mr-0 max-[800px]:[&_>_button]:mb-0 max-[800px]:[&_>_button]:ml-0',
  'max-[800px]:[&:has(>_button:only-child)]:grid-cols-[minmax(0,_1fr)]',
  'max-[800px]:[&:has(>_button:only-child)]:[grid-auto-columns:auto]',
  'max-[800px]:[&_>_button:only-child]:grid',
  'max-[800px]:[&_>_button:only-child]:grid-cols-[minmax(0,_1fr)_auto_auto]',
  "max-[800px]:[&_>_button:only-child]:[grid-template-areas:'name_version_kind'_'foot_foot_kind']",
  'max-[800px]:[&_>_button:only-child]:items-center',
  'max-[800px]:[&_>_button:only-child]:gap-[4px_16px] max-[800px]:[&_>_button:only-child]:pt-2.5',
  'max-[800px]:[&_>_button:only-child]:pr-3 max-[800px]:[&_>_button:only-child]:pb-2.5',
  'max-[800px]:[&_>_button:only-child]:pl-3',
  'max-[800px]:[&_>_button:only-child_>_strong]:[grid-area:name]',
  'max-[800px]:[&_>_button:only-child_>_strong]:min-w-0',
  'max-[600px]:[&_>_button:only-child]:grid-cols-[minmax(0,_1fr)_auto]',
  "max-[600px]:[&_>_button:only-child]:[grid-template-areas:'kind_kind'_'name_version'_'foot_foot']",
  'max-[600px]:[&_>_button:only-child]:gap-x-3',
);

export const inboxMetadataStyles = 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5';

export const inboxKindStyles = cn(
  'group/inbox-kind flex items-center justify-between gap-[7px] [&_small]:text-caption',
  '[&_small]:text-muted-ink',
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:[grid-area:kind]",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:flex-col",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:items-end",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:gap-[5px]",
  "max-[600px]:[[class~='group/inbox-items']_>_button:only-child_&]:flex-row",
  "max-[600px]:[[class~='group/inbox-items']_>_button:only-child_&]:items-center",
  "max-[600px]:[[class~='group/inbox-items']_>_button:only-child_&]:justify-between",
  "[&_[class~='group/tag']]:text-[length:11px] [&_[class~='group/tag']]:pt-px",
  "[&_[class~='group/tag']]:pr-[5px] [&_[class~='group/tag']]:pb-px",
  "[&_[class~='group/tag']]:pl-[5px]",
);

export const tagAmberStyles = 'bg-warning-soft text-warning';

export const inboxVersionStyles = cn(
  'font-mono text-caption text-muted-ink',
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:[grid-area:version]",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:max-w-40",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:[overflow-wrap:anywhere]",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:text-right",
  "max-[600px]:[[class~='group/inbox-items']_>_button:only-child_&]:max-w-35",
);

export const inboxFootStyles = cn(
  'flex justify-between items-center gap-2 text-caption text-muted-ink pt-2',
  'border-t [border-top-style:solid] border-t-[color:color-mix(in_srgb,_var(--line),_transparent_25%)] [&_>_span]:min-w-0',
  '[&_>_span]:[overflow-wrap:anywhere] [&_>_span:last-child]:shrink-0',
  '[&_>_span:last-child]:whitespace-nowrap',
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:[grid-area:foot]",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:justify-start",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:flex-wrap",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:gap-[4px_12px]",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:pt-0",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&]:border-t-0",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&_>_span]:min-w-0",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&_>_span]:[overflow-wrap:anywhere]",
  "max-[800px]:[[class~='group/inbox-items']_>_button:only-child_&_>_span:last-child]:shrink-0",
);

export const inboxGuidanceStyles = cn(
  'flex items-start gap-[7px] border-t [border-top-style:solid] border-t-[color:var(--line)] pt-3.5 pr-3.5 pb-3.5 pl-3.5',
  'text-[length:11px] leading-[1.8] text-muted-ink [&_svg]:shrink-0 [&_svg]:mt-0.5',
  'max-[800px]:hidden',
);

export const reviewStageStyles =
  'min-w-0 flex flex-col gap-[var(--space-4)] max-[600px]:gap-[13px]';
