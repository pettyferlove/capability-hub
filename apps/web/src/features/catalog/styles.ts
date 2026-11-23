import { cn } from '../../shared/styles/cn.js';
import { checkLabelStyles, textBtnStyles } from '../../shared/styles/recipes.js';

export const assetCommunityStyles = cn(
  'group/asset-community flex flex-col gap-[var(--space-4)] pt-[var(--space-4)] pr-[var(--space-4)]',
  'pb-[var(--space-4)] pl-[var(--space-4)] border border-solid border-[color:var(--line)] rounded-[14px] bg-paper',
  "my-[var(--section-gap)] [[class~='group/asset-content']_&]:mt-4",
  "[[class~='group/asset-content']_&]:mr-0 [[class~='group/asset-content']_&]:mb-4",
  "[[class~='group/asset-content']_&]:ml-0 [[class~='group/asset-content']_&]:pt-0",
  "[[class~='group/asset-content']_&]:pr-0 [[class~='group/asset-content']_&]:pb-4",
  "[[class~='group/asset-content']_&]:pl-0 [[class~='group/asset-content']_&]:border-0",
  "[[class~='group/asset-content']_&]:border-b [[class~='group/asset-content']_&]:[border-bottom-style:solid] [[class~='group/asset-content']_&]:border-b-[color:var(--line)]",
  "[[class~='group/asset-content']_&]:rounded-none [[class~='group/asset-content']_&]:bg-transparent",
  "[&_>_[class~='group/text-btn']]:[align-self:flex-start]",
);

export const communityActionsStyles =
  'group/community-actions flex items-center flex-wrap gap-[var(--space-3)]';

export const communitySelectedStyles = cn(
  "[[class~='group/community-actions']_&]:text-brand",
  "[[class~='group/community-actions']_&]:border-t-[color:var(--brand)]",
  "[[class~='group/community-actions']_&]:border-r-[color:var(--brand)]",
  "[[class~='group/community-actions']_&]:border-b-[color:var(--brand)]",
  "[[class~='group/community-actions']_&]:border-l-[color:var(--brand)]",
  "[[class~='group/community-actions']_&]:bg-brand-soft",
);

export const communityCountStyles =
  'tabular-nums border-l [border-left-style:solid] border-l-[color:var(--line)] pl-[var(--space-2)]';

export const communityStateStyles =
  'inline-flex items-center gap-[var(--space-2)] text-brand text-label';

export const nominationFormStyles =
  'pt-[var(--space-4)] border-t [border-top-style:solid] border-t-[color:var(--line)]';

export const assetContentStyles = cn(
  "group/asset-content min-w-0 [&_[class~='group/history-list']_[class~='group/tag']]:ml-auto",
  "[&_[class~='group/history-list']_[class~='group/tag']]:shrink-0",
  "[&_[class~='group/page-tabs']]:mt-0 [&_[class~='group/page-tabs']]:mr-0",
  "[&_[class~='group/page-tabs']]:mb-0 [&_[class~='group/page-tabs']]:ml-0",
  "[&_[class~='group/page-tabs']]:gap-5 [&_[class~='group/page-tabs']_>_button]:text-[length:12px]",
  "[&_[class~='group/page-tabs']_>_button]:py-3 max-[760px]:[&_[class~='group/page-tabs']]:gap-4",
  "max-[760px]:[&_[class~='group/page-tabs']_>_button]:text-[length:12px]",
);

export const detailActionsStyles = 'flex items-center gap-[13px] mb-[19px] flex-wrap';

export const detailContentNavigationStyles =
  'sticky top-[calc(-1_*_var(--detail-padding))] z-[5] bg-paper [box-shadow:0_-1px_var(--paper)]';

export const detailReadingNavigationStyles = cn(
  'group/detail-reading-navigation flex items-center gap-2 pt-2 pr-0 pb-2 pl-0',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] mb-4 min-w-0 max-[600px]:gap-1.5',
  "[&_[class~='group/icon-btn']]:w-7 [&_[class~='group/icon-btn']]:h-7",
  "[&_[class~='group/icon-btn']]:shrink-0 [&_[class~='group/icon-btn']:disabled]:opacity-[0.35]",
  "[&_[class~='group/icon-btn']:disabled]:cursor-default",
  "max-[760px]:[&_[class~='group/icon-btn']]:w-8 max-[760px]:[&_[class~='group/icon-btn']]:h-8",
  "[&_[class~='group/text-btn']]:text-[length:12px] [&_[class~='group/text-btn']]:shrink-0",
  "[&_[class~='group/text-btn']]:whitespace-nowrap",
  "max-[600px]:[&_[class~='group/text-btn']]:text-[length:11px]",
);

export const detailCurrentFileStyles = cn(
  'min-w-0 flex-1 text-[length:12px] font-mono text-muted-ink overflow-hidden text-ellipsis',
  'whitespace-nowrap',
);

export const assetContentPanelStyles = cn(
  'min-w-0 focus-visible:[outline:2px_solid_var(--brand)] focus-visible:[outline-offset:4px]',
  'focus-visible:rounded-[8px] [&_>_[hidden]]:hidden',
);

export const markdownStyles = cn(
  'min-w-0 text-base leading-[1.75] text-ink [overflow-wrap:anywhere]',
  '[&_>_div_>_*+*]:mt-4',
  '[&_p]:text-pretty [&_>_div_>_:is(h2,h3,h4,h5,h6):not(:first-child)]:mt-8',
  '[&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold [&_:is(h1,h2,h3,h4,h5,h6)]:leading-tight',
  '[&_h1]:text-3xl max-[600px]:[&_h1]:text-2xl [&_h2]:text-2xl [&_h3]:text-xl',
  '[&_h2]:border-b [&_h2]:border-line [&_h2]:pb-2',
  '[&_ul]:list-disc [&_ol]:list-decimal [&_:is(ul,ol)]:ps-6 [&_li+li]:mt-1',
  '[&_li_:is(ul,ol)]:mt-1 [&_li_p+p]:mt-2 [&_li.task-list-item]:list-none [&_li.task-list-item_input]:me-1',
  '[&_blockquote]:rounded-e-lg [&_blockquote]:border-s-[3px] [&_blockquote]:border-brand [&_blockquote]:bg-page',
  '[&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-muted-ink [&_blockquote_p+p]:mt-2',
  '[&_:is(a[href],[data-markdown-link])]:underline [&_:is(a[href],[data-markdown-link])]:decoration-brand/55',
  '[&_:is(a[href],[data-markdown-link])]:underline-offset-3 [&_:is(a[href],[data-markdown-link]):hover]:decoration-brand',
  '[&_[data-markdown-link]]:max-w-full [&_[data-markdown-link]]:[text-align:inherit]',
  '[&_:not(pre)>code]:box-decoration-clone [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-line/40',
  '[&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:text-[length:0.9em]',
  '[&_pre]:overflow-x-auto [&_pre]:overscroll-x-contain [&_pre]:[scrollbar-width:thin]',
  '[&_pre]:p-4 [&_pre]:text-[length:13px] [&_pre]:leading-[1.65] [&_pre_code]:whitespace-pre',
  '[&_pre:focus-visible]:outline-2 [&_pre:focus-visible]:-outline-offset-2 [&_pre:focus-visible]:outline-code-dim',
  "[[class~='group/asset-content']_&_:is(h1,_h2,_h3,_h4,_h5,_h6)]:[scroll-margin-top:112px]",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&]:pt-4.5",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&]:pr-4.5",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&]:pb-4.5",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&]:pl-4.5",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&_:is(h1,_h2,_h3,_h4,_h5,_h6)]:[scroll-margin-top:16px]",
);

export const markdownTableStyles = cn(
  'max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-line [scrollbar-width:thin]',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
  '[&_table]:w-full [&_table]:text-[length:13px] [&_table]:leading-normal',
  '[&_:is(th,td)]:min-w-28 [&_:is(th,td)]:px-3.5 [&_:is(th,td)]:py-2',
  '[&_th]:whitespace-normal [&_th]:bg-page [&_th]:font-semibold [&_th]:text-ink',
  '[&_:is(th,td_strong)]:text-[length:inherit] [&_tbody_tr:nth-child(even)]:bg-page/60',
  '[&_tbody_tr:last-child_td]:border-b-0',
);

export const markdownCodeStyles = cn(
  'overflow-hidden rounded-xl border border-line bg-code-bg text-code-fg',
  '[&_figcaption]:flex [&_figcaption]:items-center [&_figcaption]:justify-between [&_figcaption]:gap-3',
  '[&_figcaption]:border-b [&_figcaption]:border-code-control [&_figcaption]:px-4 [&_figcaption]:py-1.5',
  '[&_figcaption>span:first-child]:truncate [&_figcaption>span:first-child]:font-mono',
  '[&_figcaption>span:first-child]:text-caption [&_figcaption>span:first-child]:text-code-dim',
  '[&_figcaption>button]:shrink-0',
);

export const historyListStyles = cn(
  'group/history-list [&_>_div]:flex [&_>_div]:items-center [&_>_div]:gap-2.5 [&_>_div]:pt-[17px]',
  '[&_>_div]:pr-0 [&_>_div]:pb-[17px] [&_>_div]:pl-0 [&_>_div]:border-b [&_>_div]:[border-bottom-style:solid] [&_>_div]:border-b-[color:var(--line)]',
  '[&_>_div:last-child]:border-b-0 [&_>_div_>_svg]:shrink-0 [&_>_div_>_div]:flex-1',
  '[&_>_div_>_div]:min-w-0 [&_strong]:text-body [&_strong]:[overflow-wrap:anywhere] [&_small]:block',
  '[&_small]:text-caption [&_small]:text-muted-ink [&_small]:mt-[var(--space-1)]',
  '[&_small]:[overflow-wrap:anywhere] [&_code]:block [&_code]:text-caption [&_code]:text-muted-ink',
  '[&_code]:mt-[var(--space-1)] [&_code]:[overflow-wrap:anywhere]',
  "[&_>_div_>_[class~='group/icon-btn']]:shrink-0",
);

export const communityHeadingStyles = cn(
  '[&_p]:mt-[var(--space-1)] [&_p]:text-muted-ink [&_p]:text-label [&_p]:leading-[1.8]',
  '[&_p]:[overflow-wrap:anywhere]',
);

export const detailIdentityStyles = cn(
  'flex items-center gap-[15px] [&_h2]:font-mono [&_h2]:text-[length:21px]',
  '[&_h2]:[overflow-wrap:anywhere] [&_h2]:mt-1 [&_h2]:mr-0 [&_h2]:mb-1 [&_h2]:ml-0',
  '[&_p]:text-[length:11px] max-[600px]:[&_h2]:text-[length:17px]',
  "max-[760px]:[[class~='group/asset-detail-scroll']_&_h2]:text-[length:19px]",
);

export const assetSymbolStyles = cn(
  'bg-brand-soft inline-flex items-center justify-center rounded-[12px] pt-[7px] pr-[7px] pb-[7px]',
  "pl-[7px] shrink-0 [&[class~='group/mcp']]:bg-warning-soft",
);

export const typeLabelStyles = cn(
  'text-muted-ink text-[length:9px] font-semibold tracking-[1.1px]',
  "[&[class~='group/mcp']]:text-warning",
);

export const detailDescriptionWrapStyles = cn(
  "group/detail-description-wrap [&_>_[class~='group/text-btn']]:mt-[-4px]",
  "[&_>_[class~='group/text-btn']]:mb-4 [&_>_[class~='group/text-btn']]:text-[length:11px]",
);

export const detailDescriptionStyles = cn(
  'text-[length:15px] text-muted-ink leading-[1.9] mt-[21px] mr-0 mb-[15px] ml-0',
  "max-[600px]:text-[length:12px] [&[class~='group/collapsed']]:[display:-webkit-box]",
  "[&[class~='group/collapsed']]:[-webkit-line-clamp:4]",
  "[&[class~='group/collapsed']]:[-webkit-box-orient:vertical]",
  "[&[class~='group/collapsed']]:overflow-hidden",
);

export const collapsedStyles = 'group/collapsed';

export const detailMetaStyles = cn(
  'grid grid-cols-[repeat(3,_1fr)] gap-3 mt-[23px] mr-0 mb-[23px] ml-0 pt-4.5 pr-0 pb-4.5 pl-0',
  'border-t [border-top-style:solid] border-t-[color:var(--line)] border-b [border-bottom-style:solid] border-b-[color:var(--line)]',
  '[&_>_span]:text-[length:11px] [&_>_span]:text-muted-ink [&_strong]:block',
  '[&_strong]:text-[length:12px] [&_strong]:font-medium [&_strong]:text-ink [&_strong]:mt-1.5',
  'max-[600px]:grid-cols-[1fr_1fr] max-[600px]:gap-[17px] max-[600px]:[&_strong]:text-[length:11px]',
);

export const managementToolsStyles =
  'mt-5 text-[length:12px] text-muted-ink [&_summary]:cursor-pointer [&_summary]:mb-[15px]';

export const assetDetailScrollStyles = cn(
  'group/asset-detail-scroll [--detail-padding:26px] pt-[var(--detail-padding)]',
  'pr-[var(--detail-padding)] pb-[var(--detail-padding)] pl-[var(--detail-padding)]',
  '[overflow-anchor:none] max-[760px]:[--detail-padding:20px]',
);

export const feedbackDetailStyles = cn(
  '[&:has(>aside)>form]:pb-16',
  '[&_fieldset]:border-0 [&_fieldset]:pt-0 [&_fieldset]:pr-0 [&_fieldset]:pb-0 [&_fieldset]:pl-0',
  '[&_fieldset]:mt-0 [&_fieldset]:mr-0 [&_fieldset]:mb-0 [&_fieldset]:ml-0 [&_fieldset]:min-w-0',
  '[overflow-wrap:anywhere] border-t [border-top-style:solid] border-t-[color:var(--line)] pt-[var(--space-4)]',
  'mt-[var(--space-3)] [&_dl]:grid [&_dl]:gap-[var(--space-3)] [&_dl]:my-[var(--space-4)]',
  '[&_dt]:font-semibold [&_dd]:mt-[var(--space-1)] [&_dd]:mr-0 [&_dd]:mb-0 [&_dd]:ml-0',
  '[&_dd]:whitespace-pre-wrap',
);

export const feedbackFormStyles = cn(
  '[&_fieldset]:border-0 [&_fieldset]:pt-0 [&_fieldset]:pr-0 [&_fieldset]:pb-0 [&_fieldset]:pl-0',
  '[&_fieldset]:mt-0 [&_fieldset]:mr-0 [&_fieldset]:mb-0 [&_fieldset]:ml-0 [&_fieldset]:min-w-0',
);

export const managementTableStyles = cn(
  '[&_table]:min-w-288 [&_table]:border-separate [&_table]:border-spacing-0 [&_td]:py-4',
  "[&_[class~='group/table-wrap']>table]:table-fixed",
  '[&_th:nth-child(2)]:w-44 [&_th:nth-child(3)]:w-42 [&_th:nth-child(4)]:w-[16%] [&_th:nth-child(5)]:w-36',
  '[&_small]:block [&_small]:text-muted-ink [&_small]:text-caption',
  "[&_[class~='group/table-wrap']]:max-h-none [&_[class~='group/table-wrap']]:[--management-actions-width:256px]",
  "min-[760px]:[&_[class~='group/table-wrap']]:scroll-pe-[calc(var(--management-actions-width)_+_1rem)]",
  'min-[760px]:[&_th:last-child]:w-(--management-actions-width)',
  'min-[760px]:[&_:is(th,td):last-child]:sticky min-[760px]:[&_:is(th,td):last-child]:end-0 min-[760px]:[&_:is(th,td):last-child]:border-s',
  'min-[760px]:[&_td:last-child]:bg-paper',
  'min-[760px]:[&_tbody_tr:hover>td]:bg-[color-mix(in_srgb,var(--brand-soft)_35%,var(--paper))]',
  'min-[760px]:[&_tbody_tr:focus-within>td]:bg-[color-mix(in_srgb,var(--brand-soft)_45%,var(--paper))]',
  'max-[760px]:[&_table]:block max-[760px]:[&_table]:min-w-0',
  'max-[760px]:[&_thead]:absolute max-[760px]:[&_thead]:w-px max-[760px]:[&_thead]:h-px',
  'max-[760px]:[&_thead]:overflow-hidden max-[760px]:[&_thead]:[clip-path:inset(50%)]',
  'max-[760px]:[&_tbody]:block max-[760px]:[&_tbody_tr]:grid',
  'max-[760px]:[&_tbody_tr]:[grid-template-columns:minmax(0,1.4fr)_minmax(0,1fr)]',
  "max-[760px]:[&_tbody_tr]:[grid-template-areas:'resource_contributor'_'release_intake'_'activity_activity'_'actions_actions']",
  'max-[760px]:[&_tbody_tr]:gap-3 max-[760px]:[&_tbody_tr]:p-4',
  'max-[760px]:[&_tbody_tr]:border-b max-[760px]:[&_tbody_tr]:border-line',
  'max-[760px]:[&_tbody_tr:last-child]:border-b-0',
  'max-[760px]:[&_td:nth-child(n)]:w-auto max-[760px]:[&_td:nth-child(n)]:max-w-none',
  'max-[760px]:[&_td:nth-child(n)]:min-w-0 max-[760px]:[&_td:nth-child(n)]:h-auto',
  'max-[760px]:[&_td:nth-child(n)]:p-0 max-[760px]:[&_td:nth-child(n)]:border-0',
  'max-[760px]:[&_td:nth-child(1)]:[grid-area:resource]',
  'max-[760px]:[&_td:nth-child(2)]:[grid-area:release]',
  'max-[760px]:[&_td:nth-child(3)]:[grid-area:intake]',
  'max-[760px]:[&_td:nth-child(4)]:[grid-area:contributor] max-[760px]:[&_td:nth-child(4)]:text-right',
  'max-[760px]:[&_td:nth-child(5)]:[grid-area:activity]',
  'max-[760px]:[&_td:nth-child(6)]:[grid-area:actions]',
);

export const managementActionsStyles = cn(
  'flex flex-wrap items-center gap-x-2 gap-y-1 [&>button]:min-h-8 [&>a]:min-h-8',
  '[&>button]:px-3 [&>button]:py-1.5 [&>a]:py-1.5',
  'pointer-coarse:[&>button]:min-h-11 pointer-coarse:[&>a]:min-h-11',
);

export const managementStatusStyles = cn(
  'inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md text-caption leading-5 text-muted-ink [&>svg]:shrink-0',
  "[&[data-state='approved']]:text-success",
  "[&:is([data-state='received'],[data-state='fetching'],[data-state='scanning'])]:text-brand",
  "[&:is([data-state='ready'],[data-state='pending'],[data-state='stale'],[data-state='deprecated'])]:text-warning",
  "[&:is([data-state='ready'],[data-state='pending'],[data-state='stale'],[data-state='deprecated'])]:bg-warning-soft",
  "[&:is([data-state='failed'],[data-state='rejected'],[data-state='blocked'])]:text-danger",
  "[&:is([data-state='failed'],[data-state='rejected'],[data-state='blocked'])]:bg-danger-soft",
  "[&:is([data-state='ready'],[data-state='pending'],[data-state='stale'],[data-state='deprecated'],[data-state='failed'],[data-state='rejected'],[data-state='blocked'])]:px-1.5",
  "[&:is([data-state='ready'],[data-state='pending'],[data-state='stale'],[data-state='deprecated'],[data-state='failed'],[data-state='rejected'],[data-state='blocked'])]:py-0.5",
);

export const managementIntakeLinkStyles =
  'inline-flex min-h-6 min-w-0 max-w-full items-center gap-1.5 text-caption font-medium leading-5 text-brand hover:underline [&>span]:truncate [&>svg]:shrink-0';

export const managementIntakeStatusStyles = cn(
  'mt-1 flex flex-wrap items-center gap-1.5',
  '[&_[data-state]]:min-h-6 [&_[data-state]]:px-1.5 [&_[data-state]]:py-0.5',
  "[&_[data-state='approved']]:bg-success-soft",
  "[&_:is([data-state='received'],[data-state='fetching'],[data-state='scanning'])]:bg-brand-soft",
  "[&_[data-state='cancelled']]:bg-page",
);

export const managementVersionRowStyles = cn(
  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3.5',
  'max-[600px]:grid-cols-[auto_minmax(0,1fr)]',
);

export const managementVersionMetaStyles =
  'mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption leading-5 text-muted-ink';

export const managementContributorStyles = cn(
  'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-line bg-page py-0.5 pl-0.5 pr-2 align-middle text-caption font-medium leading-4 text-ink',
  "[&[data-compact='true']]:border-0 [&[data-compact='true']]:bg-transparent [&[data-compact='true']]:p-0",
  "[&[data-compact='true']]:font-normal [&[data-compact='true']]:text-muted-ink",
);

export const managementContributorAvatarStyles =
  'inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand';

export const conversationInstallStyles = cn(
  'group/conversation-install flex flex-col items-stretch gap-3 my-5 [&_>_h3]:mt-0 [&_>_h3]:mr-0',
  '[&_>_h3]:mb-0 [&_>_h3]:ml-0 [&_>_p]:mt-0 [&_>_p]:mr-0 [&_>_p]:mb-0 [&_>_p]:ml-0 [&_ol]:grid',
  '[&_ol]:gap-2 [&_ol]:pl-5.5 [&_ol]:my-4 [&_ol]:text-muted-ink [&_ol]:leading-[1.8]',
  "[&_>_[class~='group/text-btn']]:[align-self:flex-start] [&_>_[class~='group/codewrap']]:mt-0",
  "[&_>_[class~='group/codewrap']]:mr-0 [&_>_[class~='group/codewrap']]:mb-0",
  "[&_>_[class~='group/codewrap']]:ml-0 [&_[class~='group/codeblock']]:whitespace-pre-wrap",
  "[&_[class~='group/codeblock']]:[overflow-wrap:anywhere] [&_[class~='group/codeblock']]:max-h-82.5",
);

export const installationLoginStyles = cn(
  'min-w-0 pt-3 pr-3.5 pb-3 pl-3.5 border border-solid border-[color:var(--line)] rounded-[10px]',
  '[&_>_summary]:cursor-pointer [&_>_summary]:font-medium [&_>_summary]:leading-[1.6]',
  '[&_>_:not(summary)]:my-[12px_0]',
);

export const detailFileWorkspaceStyles = cn(
  'grid grid-cols-[185px_minmax(0,_1fr)] h-115 min-h-80 max-h-[65vh] border border-solid border-[color:var(--line)]',
  'rounded-[10px] bg-paper overflow-hidden max-[600px]:grid-cols-[1fr] max-[600px]:max-h-[none]',
  "max-[600px]:h-auto [[class~='group/asset-content']_&]:grid-cols-[220px_minmax(0,_1fr)]",
  "[[class~='group/asset-content']_&]:grid-rows-[minmax(0,_1fr)]",
  "[[class~='group/asset-content']_&]:h-[calc(100dvh_-_220px)]",
  "[[class~='group/asset-content']_&]:min-h-105 [[class~='group/asset-content']_&]:max-h-[none]",
  "max-[600px]:[[class~='group/asset-content']_&]:grid-cols-[minmax(0,_1fr)]",
  "max-[600px]:[[class~='group/asset-content']_&]:grid-rows-[auto_auto]",
  "max-[600px]:[[class~='group/asset-content']_&]:h-auto",
);

export const detailFileExplorerStyles = cn(
  'group/detail-file-explorer min-w-0 flex flex-col border-r [border-right-style:solid] border-r-[color:var(--line)] bg-page',
  'max-[600px]:border-r-0 max-[600px]:border-b max-[600px]:[border-bottom-style:solid] max-[600px]:border-b-[color:var(--line)]',
  "max-[600px]:max-h-[175px] [[class~='group/asset-content']_&]:min-h-0",
);

export const detailFileSearchStyles = cn(
  'group/detail-file-search flex flex-row items-center gap-1.5 pt-[11px] pr-2.5 pb-[11px] pl-2.5',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] text-muted-ink text-[length:11px] [&_input]:min-w-0',
  '[&_input]:w-full [&_input]:border-0! [&_input]:pt-0! [&_input]:pr-0! [&_input]:pb-0!',
  '[&_input]:pl-0! [&_input]:[outline:0]! [&_input]:[background:none]! [&_input]:text-[length:11px]!',
  '[&_input]:text-ink [&_svg]:shrink-0 [&_>_span]:shrink-0',
  '[&:focus-within]:[box-shadow:inset_0_-2px_var(--brand)]',
  "[[class~='group/asset-content']_&]:min-h-11 [[class~='group/asset-content']_&]:text-[length:11px]",
  "[[class~='group/asset-content']_&_input]:text-[length:12px]!",
  "max-[760px]:[[class~='group/asset-content']_&_input]:text-[length:17px]!",
  "[&_[class~='group/icon-btn']]:w-5.5 [&_[class~='group/icon-btn']]:h-5.5",
  "[&_[class~='group/icon-btn']]:shrink-0",
);

export const fileListStyles = cn(
  'flex flex-col gap-[3px] [&_>_button]:flex [&_>_button]:items-center [&_>_button]:gap-[9px]',
  '[&_>_button]:pt-3 [&_>_button]:pr-3 [&_>_button]:pb-3 [&_>_button]:pl-3',
  '[&_>_button]:border [&_>_button]:border-solid [&_>_button]:border-[color:var(--line)] [&_>_button]:rounded-[8px]',
  '[&_>_button]:bg-transparent [&_>_button]:text-left [&_>_button]:text-ink',
  "[&_>_button[class~='group/active']]:bg-brand-soft",
  "[&_>_button[class~='group/active']]:border-t-[color:var(--brand)]",
  "[&_>_button[class~='group/active']]:border-r-[color:var(--brand)]",
  "[&_>_button[class~='group/active']]:border-b-[color:var(--brand)]",
  "[&_>_button[class~='group/active']]:border-l-[color:var(--brand)] [&_>_button_>_span]:flex-1",
  '[&_>_button_>_span]:min-w-0 [&_>_button_>_span]:[overflow-wrap:anywhere]',
  '[&_>_button_>_span]:text-[length:12px] [&_small]:block [&_small]:text-[length:11px]',
  '[&_small]:text-muted-ink [&_>_button_>_svg]:shrink-0',
  "[[class~='group/detail-file-explorer']_&]:flex-1",
  "[[class~='group/detail-file-explorer']_&]:min-h-0",
  "[[class~='group/detail-file-explorer']_&]:overflow-auto",
  "[[class~='group/detail-file-explorer']_&]:gap-0 [[class~='group/detail-file-explorer']_&]:mt-0",
  "[[class~='group/detail-file-explorer']_&]:mr-0 [[class~='group/detail-file-explorer']_&]:mb-0",
  "[[class~='group/detail-file-explorer']_&]:ml-0 [[class~='group/detail-file-explorer']_&]:pt-[5px]",
  "[[class~='group/detail-file-explorer']_&]:pr-0 [[class~='group/detail-file-explorer']_&]:pb-[5px]",
  "[[class~='group/detail-file-explorer']_&]:pl-0",
  "[[class~='group/detail-file-explorer']_&_>_button]:border-0",
  "[[class~='group/detail-file-explorer']_&_>_button]:rounded-none",
  "[[class~='group/detail-file-explorer']_&_>_button]:[background:none]",
  "[[class~='group/detail-file-explorer']_&_>_button]:pt-2.5",
  "[[class~='group/detail-file-explorer']_&_>_button]:pr-[9px]",
  "[[class~='group/detail-file-explorer']_&_>_button]:pb-2.5",
  "[[class~='group/detail-file-explorer']_&_>_button]:pl-[9px]",
  "[[class~='group/detail-file-explorer']_&_>_button]:gap-[7px]",
  "[[class~='group/detail-file-explorer']_&_>_button]:min-h-[51px]",
  "[[class~='group/detail-file-explorer']_&_>_button]:min-w-0",
  "[[class~='group/detail-file-explorer']_&_>_button[class~='group/active']]:bg-brand-soft",
  "[[class~='group/detail-file-explorer']_&_>_button[class~='group/active']]:[box-shadow:inset_2px_0_var(--brand)]",
  "[[class~='group/detail-file-explorer']_&_>_button_>_svg]:w-[13px]",
  "[[class~='group/detail-file-explorer']_&_>_button_>_svg]:shrink-0",
  "[[class~='group/detail-file-explorer']_&_>_button_>_span]:min-w-0",
  "[[class~='group/detail-file-explorer']_&_>_button_>_span]:block",
  "[[class~='group/detail-file-explorer']_&_>_button_>_span]:text-[length:12px]",
  "[[class~='group/detail-file-explorer']_&_strong]:block",
  "[[class~='group/detail-file-explorer']_&_strong]:font-medium",
  "[[class~='group/detail-file-explorer']_&_strong]:overflow-hidden",
  "[[class~='group/detail-file-explorer']_&_strong]:text-ellipsis",
  "[[class~='group/detail-file-explorer']_&_strong]:whitespace-nowrap",
  "[[class~='group/detail-file-explorer']_&_small]:block",
  "[[class~='group/detail-file-explorer']_&_small]:text-caption",
  "[[class~='group/detail-file-explorer']_&_small]:overflow-hidden",
  "[[class~='group/detail-file-explorer']_&_small]:text-ellipsis",
  "[[class~='group/detail-file-explorer']_&_small]:whitespace-nowrap",
  "[[class~='group/detail-file-explorer']_&_small]:mt-[3px]",
  "max-[600px]:[[class~='group/detail-file-explorer']_&]:max-h-[131px]",
  "max-[600px]:[[class~='group/detail-file-explorer']_&_>_button]:min-h-11",
  "max-[600px]:[[class~='group/detail-file-explorer']_&_>_button]:pt-2",
  "max-[600px]:[[class~='group/detail-file-explorer']_&_>_button]:pr-[11px]",
  "max-[600px]:[[class~='group/detail-file-explorer']_&_>_button]:pb-2",
  "max-[600px]:[[class~='group/detail-file-explorer']_&_>_button]:pl-[11px]",
  '[&_>_button:focus-visible]:[outline:2px_solid_var(--brand)]',
  '[&_>_button:focus-visible]:[outline-offset:-2px]',
  "[[class~='group/asset-content']_[class~='group/detail-file-explorer']_&]:[overflow-anchor:none]",
  "[[class~='group/asset-content']_[class~='group/detail-file-explorer']_&]:[overscroll-behavior:contain]",
);

export const detailFileNoMatchStyles = 'pt-5 pr-2.5 pb-5 pl-2.5 text-[length:11px] text-center';

export const detailFilePreviewStyles = cn(
  'min-w-0 min-h-0 flex flex-col max-[600px]:h-85',
  "max-[600px]:[[class~='group/asset-content']_&]:h-[max(340px,_calc(100dvh_-_420px))]",
);

export const detailFilePreviewHeadStyles = cn(
  'flex items-center gap-[9px] pt-[11px] pr-3 pb-[11px] pl-3 border-b [border-bottom-style:solid] border-b-[color:var(--line)]',
  'shrink-0 min-h-[43px] [&_>_code]:min-w-0 [&_>_code]:flex-1 [&_>_code]:text-[length:11px]',
  '[&_>_code]:whitespace-nowrap [&_>_code]:overflow-hidden [&_>_code]:text-ellipsis',
  '[&_>_button]:text-[length:11px] [&_>_button]:text-muted-ink [&_>_button]:bg-page',
  '[&_>_button:hover]:text-ink [&_>_button:hover]:bg-brand-soft [&_>_a]:flex [&_>_a]:text-muted-ink',
  'max-[600px]:pt-2.5 max-[600px]:pr-2.5 max-[600px]:pb-2.5 max-[600px]:pl-2.5',
  "[[class~='group/asset-content']_&]:flex-wrap [[class~='group/asset-content']_&]:pt-2.5",
  "[[class~='group/asset-content']_&]:pr-3 [[class~='group/asset-content']_&]:pb-2.5",
  "[[class~='group/asset-content']_&]:pl-3",
  "[[class~='group/asset-content']_&_>_code]:[flex:1_1_180px]",
  "[[class~='group/asset-content']_&_>_code]:text-[length:12px]",
  "max-[600px]:[[class~='group/asset-content']_&_>_code]:basis-full",
);

export const detailPreviewActionsStyles = cn(
  'flex items-center gap-2.5 ml-auto max-w-full shrink-0 [&_>_a]:inline-flex [&_>_a]:items-center',
  '[&_>_a]:justify-center [&_>_a]:w-7.5 [&_>_a]:h-8 [&_>_a]:text-muted-ink',
  '[&_>_button]:text-[length:11px] max-[760px]:[&_>_button]:min-h-9 max-[760px]:[&_>_a]:min-h-9',
);

export const detailPreviewModesStyles = cn(
  'flex pt-0.5 pr-0.5 pb-0.5 pl-0.5 border border-solid border-[color:var(--line)] rounded-[8px] bg-page',
  '[&_button]:text-[length:11px] [&_button]:pt-[3px] [&_button]:pr-2 [&_button]:pb-[3px]',
  '[&_button]:pl-2 [&_button]:rounded-[6px] [&_button]:text-muted-ink [&_button]:min-h-7',
  "[&_button[aria-pressed='true']]:text-ink [&_button[aria-pressed='true']]:bg-paper",
  "[&_button[aria-pressed='true']]:[box-shadow:0_1px_3px_var(--line)] max-[760px]:[&_button]:min-h-9",
);

export const detailFilePreviewContentStyles = cn(
  'group/detail-file-preview-content flex-1 min-h-0 overflow-auto [overscroll-behavior:contain]',
  "[scrollbar-width:thin] [[class~='group/asset-content']_&]:[overflow-anchor:none]",
  "[[class~='group/asset-content']_&]:[overscroll-behavior:contain] [&_[class~='group/notice']]:mt-4",
  "[&_[class~='group/notice']]:mr-4 [&_[class~='group/notice']]:mb-4",
  "[&_[class~='group/notice']]:ml-4 [&_[class~='group/notice']]:text-[length:11px]",
  "[&_[class~='group/notice']]:leading-[1.9]",
);

export const detailFileSourceStyles = cn(
  'font-mono text-[length:11px] leading-[1.9] pt-3.5 pr-3.5 pb-3.5 pl-3.5 whitespace-pre-wrap',
  '[overflow-wrap:anywhere] max-[600px]:pt-3 max-[600px]:pr-3 max-[600px]:pb-3 max-[600px]:pl-3',
  "max-[600px]:text-[length:11px] [[class~='group/asset-content']_&]:text-[length:12px]",
);

export const detailFileProofStyles = cn(
  'flex items-center justify-between gap-2 pt-2 pr-3 pb-2 pl-3 border-t [border-top-style:solid] border-t-[color:var(--line)]',
  'text-[length:9px] text-muted-ink shrink-0 [&_code]:text-[length:9px]',
  "[[class~='group/asset-content']_&]:text-[length:11px]",
  "[[class~='group/asset-content']_&]:flex-wrap",
);

/** 首页发现的版面：首屏舞台、任务输入、能力横条、资源目录与提交后的结果面板。 */

export const discoverStyles = '-mt-4 flex min-w-0 flex-col [overflow-anchor:none]';

// 首屏标题与提问框整体居中；提交后收起标题区，让回应紧接在输入框下方。
export const discoverHeroStyles = cn(
  'relative flex flex-col items-center justify-center',
  'min-h-[min(640px,calc(100dvh_-_200px))] pt-12 pb-14 motion-reduce:transition-none',
  '[transition:min-height_520ms_var(--ease-out),padding_520ms_var(--ease-out)]',
  'group-data-[engaged]/hero:min-h-0 group-data-[engaged]/hero:pt-7 group-data-[engaged]/hero:pb-5',
  'max-[850px]:min-h-0 max-[850px]:pt-11 max-[850px]:pb-10 max-[600px]:pt-8 max-[600px]:pb-8',
  'max-[850px]:group-data-[engaged]/hero:pt-5 max-[850px]:group-data-[engaged]/hero:pb-4',
);

// 背景覆盖输入区和整张结果面板，淡出跟随面板底边，而不跟随视口滚动。
export const heroStageStyles = cn(
  'pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-clip',
  '[background:radial-gradient(ellipse_46%_62%_at_50%_42%,color-mix(in_srgb,var(--brand)_9%,transparent),transparent_76%)]',
  '[mask-image:linear-gradient(to_bottom,var(--mask-solid)_58%,transparent)]',
  'group-data-[engaged]/hero:[mask-image:linear-gradient(to_bottom,var(--mask-solid)_calc(100%_-_48px),transparent)]',
  'forced-colors:hidden',
);

// 长结果只绘制一屏点阵；sticky 始终留在舞台内，不在目录横条背后继续绘制。
export const heroDotsStyles = 'sticky inset-auto top-0 max-h-lvh [--hero-dot-opacity:1]';

// 提交后标题区以行高过渡收起，标题仍留在文档中供读屏使用。
export const heroIntroStyles = cn(
  'grid w-full grid-rows-[1fr] [transition:grid-template-rows_520ms_var(--ease-out),opacity_300ms_ease]',
  'group-data-[engaged]/hero:grid-rows-[0fr] group-data-[engaged]/hero:opacity-0 motion-reduce:transition-none',
);

export const heroCopyStyles = cn(
  'flex min-h-0 min-w-0 flex-col items-center gap-[18px] overflow-hidden pb-10 text-center',
  'max-[850px]:gap-3.5 max-[850px]:pb-8 max-[600px]:gap-3 max-[600px]:pb-6',
);

export const heroEyebrowStyles =
  'flex flex-wrap items-center justify-center gap-2.5 font-mono text-[length:10.5px] leading-none text-brand';

export const heroEyebrowRuleStyles = 'h-px w-[30px] bg-brand-line-strong';

export const heroEyebrowSubStyles =
  'font-mono text-[length:10.5px] leading-none tracking-[1.6px] text-quieter';

export const heroTitleStyles = cn(
  'flex flex-col items-center text-[length:56px] leading-[68px] font-bold tracking-[-0.6px] text-ink',
  'max-[1100px]:text-[length:48px] max-[1100px]:leading-[60px] max-[850px]:text-[length:38px]',
  'max-[850px]:leading-[48px] max-[600px]:text-[length:30px] max-[600px]:leading-[39px]',
);

// 第二行字多，字号与字重各退一级，宽度落在标题与输入框之间，自上而下逐行加宽。
export const heroTitleSubStyles = cn(
  'text-[length:40px] leading-[56px] font-medium',
  'max-[1100px]:text-[length:34px] max-[1100px]:leading-[48px] max-[850px]:text-[length:28px]',
  'max-[850px]:leading-[40px] max-[600px]:text-[length:20px] max-[600px]:leading-[30px]',
);

export const heroTitleAccentStyles = cn(
  'bg-clip-text text-transparent forced-colors:bg-none forced-colors:text-ink',
  '[background-image:linear-gradient(0deg,var(--headline-from),var(--brand)_55%,var(--headline-to))]',
);

// 提交后与下方回应面板同宽。
export const taskComposerStyles = cn(
  'group/composer relative z-[2] w-full max-w-[760px] group-data-[engaged]/hero:max-w-full',
  '[transition:max-width_520ms_var(--ease-out)] motion-reduce:transition-none',
);

// 单行时文本域与按钮同为 40px 高；草稿在单行的文字列宽内放不下时，文本域占满整行，
// 快捷键与按钮移到下一行右侧，图标停在首行。
export const taskInputStyles = cn(
  'group/task-input relative grid min-h-[58px] grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-3 gap-y-1',
  'cursor-text overflow-hidden rounded-[15px] py-2 pr-2 pl-[18px]',
  'border border-solid border-[color:var(--line)] bg-surface-card [box-shadow:var(--shadow-panel)]',
  'motion-safe:[transition:box-shadow_200ms_ease]',
  'focus-within:[box-shadow:0_0_0_1px_var(--brand-line-strong),0_0_12px_2px_var(--brand-line),0_0_32px_4px_var(--brand-veil),var(--shadow-panel)]',
  "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:opacity-0 after:content-['']",
  'after:bg-no-repeat after:[background-image:linear-gradient(90deg,transparent,var(--brand),transparent)]',
  'after:[background-size:40%_100%] motion-reduce:after:[background-size:100%_100%] forced-colors:after:hidden',
  'group-data-[busy]/composer:after:opacity-100',
  'motion-safe:group-data-[busy]/composer:after:[animation:composer-progress_1.3s_ease-in-out_infinite]',
  'forced-colors:has-[textarea:focus-visible]:outline-2 forced-colors:has-[textarea:focus-visible]:outline-solid',
  'forced-colors:has-[textarea:focus-visible]:outline-offset-2 max-[600px]:gap-x-2 max-[600px]:pl-3.5',
);

export const taskInputIconStyles = cn(
  'col-start-1 row-start-1 mt-[11.5px] self-start text-brand',
  'motion-safe:group-data-[busy]/composer:[animation:hero-sparkle_1.4s_ease-in-out_infinite]',
);

const taskInputTextStyles = 'text-[length:15px] leading-[22px] max-[600px]:text-[length:16px]';

export const taskFieldStyles =
  'relative col-start-2 row-start-1 flex min-w-0 group-data-[multiline]/task-input:col-end-4';

// 与文本域同字号、同换行规则的不可见量尺，只占单行布局的文字列和一行高度；末尾补空格，结尾换行也算一行。
export const taskFieldMeasureStyles = cn(
  'invisible absolute inset-x-0 top-0 col-start-2 col-end-3 row-start-1 h-lh overflow-hidden',
  "whitespace-pre-wrap break-words after:content-[attr(data-value)_'_']",
  taskInputTextStyles,
);

// 展开后最多显示九行再滚动；文字只在上下 9px 内边距里渐隐，光标带动滚动时也留出这段边距，
// 正在输入的行不会落进渐隐区。
export const taskInputFieldStyles = cn(
  'max-h-32 w-full min-w-0 resize-none border-0 bg-transparent py-[9px] [scroll-padding-block:9px]',
  'text-ink [scrollbar-width:thin]',
  taskInputTextStyles,
  '[field-sizing:content] [outline:0] [box-shadow:none] [&::placeholder]:text-quieter',
  'group-data-[multiline]/task-input:max-h-54 group-data-[multiline]/task-input:pr-2.5',
  'group-data-[multiline]/task-input:[mask-image:linear-gradient(transparent,var(--mask-solid)_9px,var(--mask-solid)_calc(100%_-_9px),transparent)]',
);

// 原生占位文字在打字提示期间变透明但保留，读屏与输入框高度仍以它为准。
export const taskInputTypingStyles = '[&::placeholder]:text-transparent';

// 悬停或键盘聚焦按钮时提高当前示例的对比度；保留空白，避免预览与提交内容不同。
export const taskTypingStyles = cn(
  'pointer-events-none absolute inset-x-0 top-0 overflow-hidden py-[9px] text-[length:15px] leading-[22px]',
  'text-ellipsis whitespace-pre text-quieter [transition:color_150ms_ease]',
  'group-has-[[type=submit]:enabled:hover]/task-input:text-muted-ink',
  'group-has-[[type=submit]:enabled:focus-visible]/task-input:text-muted-ink',
);

export const taskTypingCursorStyles = cn(
  'ml-0.5 inline-block h-[17px] w-[1.5px] translate-y-[3px] rounded-full bg-brand',
  'motion-safe:[animation:caret-blink_1.05s_steps(1)_infinite]',
);

// 接近上限的字数只在展开后的第二行与文字左对齐；达到上限改用警示色。
export const taskCountStyles = cn(
  'col-start-2 row-start-2 self-center text-caption leading-none tabular-nums text-muted-ink',
  'data-[full]:font-medium data-[full]:text-warning',
);

export const taskActionsStyles =
  'col-start-3 row-start-1 flex items-center gap-3 group-data-[multiline]/task-input:row-start-2';

export const taskKbdStyles = cn(
  'shrink-0 rounded-[6px] border border-solid border-[color:var(--stroke-card)] bg-surface-chip',
  'px-[6px] py-[2px] font-mono text-[length:11px] leading-[14px] text-muted-ink [transition:opacity_150ms_ease]',
  'group-has-[textarea:placeholder-shown]/task-input:opacity-50 max-[600px]:hidden',
);

export const taskSubmitStyles = cn(
  'group/submit inline-flex h-10 shrink-0 items-center justify-center gap-[7px] rounded-[10px]',
  'bg-brand px-[18px] text-[length:13.5px] font-bold text-on-brand',
  '[transition:background-color_150ms_ease,color_150ms_ease,scale_120ms_ease]',
  'enabled:hover:bg-brand-hover enabled:active:scale-[0.97] pointer-coarse:min-h-11',
  'disabled:bg-surface-chip disabled:text-quieter disabled:opacity-100',
);

export const taskSubmitIconStyles =
  '[transition:translate_150ms_ease] group-enabled/submit:group-hover/submit:translate-x-0.5';

// 示例与主题只用于开始新问题，提交后连同这一行收起。
export const taskSuggestRowStyles = cn(
  'relative z-[2] mt-5 flex w-full max-w-[760px] flex-wrap items-center justify-center gap-2',
  'group-data-[engaged]/hero:hidden max-[600px]:mt-4',
);

export const taskMetaRowStyles = cn(
  'relative z-[2] mt-4 flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2',
  'group-data-[engaged]/hero:mt-3 max-[600px]:mt-3',
);

export const taskSuggestLabelStyles = 'text-[length:11px] leading-none text-quieter';

export const taskChipStyles = cn(
  'rounded-[8px] border border-solid border-[color:var(--stroke-card)] bg-surface-chip-soft',
  'px-[11px] py-[5px] text-[length:12px] leading-[17px] text-muted-ink',
  '[transition:color_150ms_ease,border-color_150ms_ease,background-color_150ms_ease,translate_150ms_ease]',
  'hover:border-[color:var(--brand-line)] hover:bg-brand-tint hover:text-ink motion-safe:hover:-translate-y-px',
  'pointer-coarse:min-h-9',
);

export const taskTopicHashStyles = 'mr-0.5 font-mono text-quieter';

export const taskPrivacyNoteStyles =
  'inline-flex min-w-0 items-center gap-1.5 text-[length:11.5px] leading-[1.5] text-muted-ink';

export const browseEntryStyles = cn(
  'group/browse -mx-2 inline-flex shrink-0 items-center gap-[7px] rounded-[8px] px-2 py-1',
  'text-[length:12.5px] font-medium text-ink [transition:color_150ms_ease,background-color_150ms_ease]',
  'hover:bg-brand-tint hover:text-brand pointer-coarse:min-h-9',
);

export const browseEntryCountStyles = cn(
  'min-w-[22px] rounded-full bg-surface-chip px-1.5 text-center font-mono text-[length:10.5px] leading-[17px]',
  'font-normal text-muted-ink [transition:color_150ms_ease] group-hover/browse:text-brand',
);

export const capabilityTickerStyles = cn(
  'flex min-h-[58px] items-center border-y border-solid border-y-[color:var(--stroke-card)] py-2.5',
  'max-[600px]:min-h-12',
);

export const tickerLinkStyles = cn(
  'group/ticker inline-flex items-center gap-2 py-1 font-mono text-[length:12px] tracking-[0.2px]',
  'text-muted-ink [transition:color_150ms_ease] hover:text-ink',
);

export const tickerGlyphStyles =
  'inline-flex opacity-60 [transition:opacity_150ms_ease] group-hover/ticker:opacity-100';

export const directoryStyles = 'flex min-w-0 flex-col gap-[22px] pt-16 max-[850px]:pt-10';

export const directoryHeadStyles =
  'flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-2 max-[600px]:gap-y-3';

export const directoryHeadCopyStyles = 'flex min-w-0 flex-col gap-2.5';

export const directoryEyebrowStyles = 'flex items-center gap-[9px]';

export const directoryEyebrowLabelStyles =
  'font-mono text-[length:10.5px] leading-none tracking-[1.8px] text-quieter';

export const directoryEyebrowRuleStyles = 'h-px w-[26px] bg-[color:var(--line)]';

// 跳到目录时标题停在吸顶导航与上方标签之下。
export const directoryTitleStyles = cn(
  'mt-1.5 flex scroll-mt-36 items-baseline gap-2.5 text-[length:30px] leading-none font-bold tracking-[-0.4px]',
  'text-ink max-[850px]:scroll-mt-44 max-[600px]:text-[length:24px]',
);

export const directoryCountStyles =
  'font-mono text-[length:12px] font-normal tabular-nums text-quieter';

export const directorySubStyles =
  'max-w-[560px] text-[length:13px] leading-[21px] text-muted-ink max-[600px]:text-[length:12px]';

export const typeSegmentedStyles = cn(
  'rounded-[11px] border border-solid border-[color:var(--stroke-card)] bg-surface-sunken',
  'p-1 gap-0.5',
);

export const typeSegmentedIndicatorStyles = 'rounded-[8px] bg-surface-seg shadow-none';

export const typeSegmentedItemStyles = cn(
  'min-h-0 rounded-[8px] px-3 py-1.5 text-[length:12px] text-muted-ink hover:text-ink',
);

export const filterRowStyles = cn(
  'flex flex-wrap items-stretch justify-between gap-x-3 gap-y-2 border-b border-solid',
  'border-b-[color:var(--stroke-card)]',
);

export const directoryTabsStyles = cn(
  'flex gap-5 [&_>_button]:flex [&_>_button]:items-center [&_>_button]:gap-1.5',
  '[&_>_button]:border-0 [&_>_button]:[background:none] [&_>_button]:px-0 [&_>_button]:pb-[10px]',
  '[&_>_button]:pt-1.5 [&_>_button]:text-[length:12.5px] [&_>_button]:font-medium',
  '[&_>_button]:text-muted-ink [&_>_button]:whitespace-nowrap [&_>_button]:border-b-2',
  '[&_>_button]:border-b-transparent [&_>_button]:[transition:color_120ms_ease]',
  '[&_>_button:hover]:text-ink',
  "[&_>_button[class~='group/selected']]:font-semibold [&_>_button[class~='group/selected']]:text-ink",
  "[&_>_button[class~='group/selected']]:border-b-[color:var(--brand)]",
);

export const directoryTabCountStyles = 'font-mono text-[length:10.5px] font-normal text-quieter';

export const directoryTabCountActiveStyles =
  'font-mono text-[length:10.5px] font-normal text-brand';

export const directoryToolsStyles = cn(
  'mb-1.5 flex w-[356px] max-w-full min-w-0 items-center rounded-full border border-control-border',
  'bg-paper p-0.5 [box-shadow:var(--shadow-card)] max-[760px]:w-full',
);

export const keywordFieldStyles = cn(
  'relative block min-w-0 flex-1',
  'after:pointer-events-none after:absolute after:right-3 after:bottom-0.5 after:left-9 after:h-0.5',
  'after:origin-left after:scale-x-0 after:rounded-full after:bg-brand has-[input:focus]:after:scale-x-100',
  'motion-safe:after:transition-transform forced-colors:after:hidden',
);

export const keywordInputStyles = cn(
  'min-h-8 rounded-full border-0 bg-transparent py-1.5 text-body leading-5 caret-brand',
  'placeholder:text-muted-ink focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none',
  'forced-colors:focus-visible:[outline:2px_solid_Highlight] pointer-coarse:min-h-11 max-[600px]:text-[length:16px]',
);

export const keywordClearStyles = cn(
  'grid size-6 place-items-center rounded-full text-muted-ink hover:bg-surface-sunken hover:text-ink',
  'focus-visible:outline-brand pointer-coarse:size-9',
);

export const scenarioSelectStyles = cn(
  'relative w-32 max-w-2/5 shrink-0 pl-1.5',
  'before:pointer-events-none before:absolute before:top-1/2 before:left-0 before:h-4 before:w-px before:-translate-y-1/2 before:bg-line',
  '[&_button]:min-h-8 [&_button]:gap-1 [&_button]:rounded-full [&_button]:border-0 [&_button]:bg-transparent',
  '[&_button]:px-2 [&_button]:py-1.5 [&_button]:text-body [&_button]:font-medium [&_button]:text-muted-ink',
  '[&_button>svg]:size-3.5 [&_button>svg]:text-current [&_button[data-focus-visible]]:-outline-offset-2',
  '[&_button[data-hovered]]:bg-surface-chip-soft [&[data-open]_button]:bg-surface-sunken',
  'pointer-coarse:[&_button]:min-h-11 motion-reduce:[&_button>svg]:transition-none',
);

export const scenarioActiveStyles = cn(
  '[&_button]:bg-brand-tint [&_button]:font-semibold [&_button]:text-brand',
  '[&_button[data-hovered]]:bg-brand-veil [&[data-open]_button]:bg-brand-veil',
);

export const directoryGridStyles = cn(
  'grid grid-cols-[repeat(3,_minmax(0,1fr))] gap-4 max-[850px]:grid-cols-[repeat(2,_minmax(0,1fr))]',
  'max-[600px]:grid-cols-[1fr] max-[600px]:gap-3',
);

export const directoryCardStyles = cn(
  'group/card relative flex min-w-0 flex-col gap-[13px] rounded-[16px] p-[17px] [&>p]:mb-auto',
  'min-h-[244px]',
  'border border-solid border-[color:var(--stroke-card)] bg-paper text-ink',
  '[box-shadow:var(--shadow-card)] [transition:border-color_180ms_ease,box-shadow_180ms_ease,translate_180ms_ease]',
  'hover:border-[color:var(--brand-line)] hover:[box-shadow:var(--shadow-panel)]',
  'focus-visible:border-[color:var(--brand)] focus-visible:[outline:2px_solid_var(--brand)]',
  'focus-visible:[outline-offset:2px] motion-safe:hover:-translate-y-0.5',
  'motion-reduce:transition-none max-[600px]:p-4',
  '[&_h3]:line-clamp-1 [&_h3]:font-mono [&_h3]:text-[length:12.5px] [&_h3]:font-semibold [&_h3]:text-ink',
  '[&>p]:line-clamp-3 [&>p]:text-[length:11.5px] [&>p]:leading-5 [&>p]:text-muted-ink',
  '[&>p]:[overflow-wrap:anywhere]',
);

export const cardTopStyles = 'flex items-start gap-[11px]';

export const cardGlyphStyles = cn(
  'grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-brand-tint text-brand',
  'outline outline-1 -outline-offset-[0.5px] outline-[color:var(--brand-line)]',
  'group-[.mcp]/card:bg-[color:var(--success-soft)] group-[.mcp]/card:text-success',
  'group-[.mcp]/card:outline-[color:color-mix(in_srgb,var(--success)_30%,transparent)]',
);

export const cardTitleColStyles = 'flex min-w-0 flex-1 flex-col gap-1';

export const cardMetaStyles = 'flex flex-wrap items-center gap-1.5';

export const cardTypeChipStyles = cn(
  'rounded-[4px] bg-brand-tint px-[5px] py-px font-mono text-[length:8.5px] tracking-[0.6px]',
  'leading-none text-brand',
);

export const cardTypeChipMcpStyles = cn(
  'rounded-[4px] bg-[color:var(--success-soft)] px-[5px] py-px font-mono text-[length:8.5px]',
  'leading-none tracking-[0.6px] text-success',
);

export const cardScopeStyles = 'text-[length:10.5px] leading-none text-quieter';

export const cardOpenIconStyles =
  'mt-0.5 shrink-0 text-quieter [transition:color_150ms_ease] group-hover/card:text-brand';

export const cardTagRowStyles = 'flex flex-wrap items-center gap-1.5';

export const cardFeatureTagStyles = cn(
  'inline-flex items-center gap-1 rounded-[6px] px-[7px] py-[3px] text-[length:10px]',
  'bg-[color:color-mix(in_srgb,var(--warning)_12%,transparent)] text-warning',
  'outline outline-1 -outline-offset-[0.5px] outline-[color:color-mix(in_srgb,var(--warning)_26%,transparent)]',
);

export const cardTagStyles =
  'rounded-[6px] bg-surface-chip px-[7px] py-[3px] text-[length:10px] text-muted-ink';

export const cardFootStyles = cn(
  'flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-solid',
  'border-t-[color:var(--stroke-card)] pt-2.5 text-[length:10.5px] leading-none text-quieter',
);

export const cardFootItemStyles = 'inline-flex min-w-0 items-center gap-1.5';

export const paginationStyles = 'flex flex-wrap justify-center gap-3 pt-1';

/* 目录对当前访问者为空时的上线引导 */

export const onboardingStyles = cn(
  'relative isolate mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-12 gap-y-8',
  'overflow-hidden rounded-[22px] p-8 border border-solid border-[color:var(--stroke-panel)]',
  '[box-shadow:var(--shadow-panel)]',
  '[background-image:linear-gradient(-133deg,var(--surface-panel-start)_26%,var(--surface-panel-end)_74%)]',
  'max-[850px]:grid-cols-[minmax(0,1fr)] max-[600px]:rounded-[16px] max-[600px]:p-5',
);

export const onboardingDotsStyles = cn(
  '[--hero-dot-opacity:1.6]',
  '[mask-image:radial-gradient(ellipse_55%_90%_at_82%_50%,var(--mask-solid)_10%,transparent_80%)]',
);

export const onboardingCopyStyles = 'flex min-w-0 flex-col items-start gap-3';

export const onboardingIconStyles = cn(
  'mb-1 grid size-11 place-items-center rounded-[14px] bg-brand-soft text-brand',
  'outline outline-1 -outline-offset-[0.5px] outline-[color:var(--brand-line)]',
);

export const onboardingTitleStyles = cn(
  'scroll-mt-36 text-[length:21px] leading-[1.35] font-semibold text-ink outline-none',
  'max-[850px]:scroll-mt-44 max-[600px]:text-[length:19px]',
);

export const onboardingTextStyles =
  'max-w-[440px] text-[length:13px] leading-[1.8] text-muted-ink max-[600px]:text-[length:12px]';

export const onboardingActionsStyles = 'mt-2 flex flex-wrap items-center gap-2.5';

export const onboardingFlowStyles = 'relative min-w-0';

// 竖线连接三个步骤圆点，光点沿线向下流动，表示资源从发布走到可用。
export const onboardingTrackStyles = cn(
  'absolute top-4 bottom-4 left-[15px] w-px overflow-hidden bg-[color:var(--stroke-card)]',
);

export const onboardingBeamStyles = cn(
  'absolute left-0 h-1/4 w-px opacity-0 forced-colors:hidden',
  '[background:linear-gradient(transparent,var(--brand),transparent)]',
  'motion-safe:[animation:onboarding-beam_2.8s_ease-in-out_infinite]',
);

export const onboardingStepsStyles = 'relative m-0 flex list-none flex-col gap-5 p-0';

export const onboardingStepStyles = 'relative flex items-start gap-3.5';

export const onboardingStepIndexStyles = cn(
  'grid size-8 shrink-0 place-items-center rounded-full border border-solid border-[color:var(--stroke-tile)]',
  'bg-surface-card font-mono text-[length:12px] text-brand [box-shadow:var(--shadow-card)]',
);

export const onboardingStepTitleStyles = 'block pt-1 text-[length:13px] font-semibold text-ink';

export const onboardingStepTextStyles =
  'mt-0.5 block text-[length:12px] leading-[1.7] text-muted-ink';

/* 提交后的任务面板 */

// 只在最外层模糊背后的点阵。内部卡片叠加半透明底色，文字与操作不参与滤镜。
export const taskPanelStyles = cn(
  'relative mt-[18px] mb-7 overflow-hidden rounded-[22px] [overflow-anchor:none]',
  'border border-solid border-[color:var(--stroke-panel)] bg-paper [box-shadow:var(--shadow-panel)]',
  'supports-backdrop-filter:bg-paper/35 backdrop-blur-[1.5px]',
  '[@media_(prefers-reduced-transparency:_reduce)]:bg-paper [@media_(prefers-reduced-transparency:_reduce)]:backdrop-filter-none',
  'forced-colors:bg-[Canvas] forced-colors:backdrop-filter-none',
  '[--text-quiet:var(--muted-ink)] [--text-quieter:var(--muted-ink)]',
  'max-[600px]:rounded-[16px]',
);

// 面板高度跟随这一层的实际高度过渡，结果增减时不跳动。
export const taskPanelBodyStyles = cn(
  'flex flex-wrap items-start gap-4 p-5',
  'max-[850px]:flex-col max-[850px]:items-stretch max-[600px]:p-3.5',
);

export const taskColumnStyles = 'flex min-w-0 flex-1 flex-col gap-3';

// 本轮问题以靠右的对话气泡呈现，与上方输入框区分开，不会被当成第二个输入框。
export const queryStripStyles = 'flex flex-row-reverse items-end justify-start gap-2.5';

export const queryStripTextStyles = cn(
  'max-w-[78%] rounded-[14px] rounded-br-[5px] bg-brand-tint px-3.5 py-2.5 text-[length:13px] leading-[1.6] text-ink',
  'outline outline-1 -outline-offset-[0.5px] outline-[color:var(--brand-line)] [overflow-wrap:anywhere]',
  'max-[600px]:max-w-[88%]',
);

export const queryEditStyles = cn(
  'shrink-0 rounded-[7px] border border-solid border-[color:var(--stroke-card)] px-[9px] py-1',
  'text-[length:11px] text-muted-ink [transition:color_120ms_ease] hover:text-ink',
);

export const resultsHeadStyles = 'flex flex-wrap items-center justify-between gap-2';

export const resultsCountStyles = 'text-[length:12px] text-muted-ink';

export const resultsSortStyles = cn(
  'inline-flex items-center gap-1.5 rounded-[8px] px-2 py-1 text-[length:11.5px] text-quieter',
  '[transition:color_120ms_ease,background-color_120ms_ease] hover:bg-brand-tint hover:text-ink',
);

export const resultCardStyles = cn(
  'flex min-w-0 flex-wrap items-start gap-3 rounded-[13px] border border-solid',
  'border-[color:var(--stroke-card)] bg-surface-card/50 p-[13px] pr-3.5',
  '[transition:border-color_150ms_ease,box-shadow_180ms_ease,translate_180ms_ease]',
  'hover:border-[color:var(--brand-line)] hover:[box-shadow:var(--shadow-card)] motion-safe:hover:-translate-y-px',
);

export const resultSkeletonStyles = cn(
  'flex items-start gap-3 rounded-[13px] border border-solid',
  'border-[color:var(--stroke-card)] bg-surface-card/50 p-[13px]',
);

export const resultSkeletonBlockStyles =
  '[animation:none] [background:color-mix(in_srgb,var(--brand)_calc(16%*var(--discovery-glow)),var(--line))]';

export const resultSkeletonLinesStyles = 'flex min-w-0 flex-1 flex-col gap-2.5 pt-1';

export const resultGlyphStyles = cn(
  'grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-brand-tint text-brand',
  'outline outline-1 -outline-offset-[0.5px] outline-[color:var(--brand-line)]',
);

// 正文至少保留 240px，放不下时操作列换到下一行并与正文对齐。
export const resultBodyStyles = 'flex min-w-0 flex-1 basis-[240px] flex-col gap-[5px]';

export const resultNameRowStyles = 'flex flex-wrap items-center gap-[7px]';

export const resultNameStyles =
  'min-w-0 font-mono text-[length:13px] font-semibold text-ink [overflow-wrap:anywhere]';

export const resultKindStyles = cn(
  'rounded-[6px] bg-brand-tint px-2 py-[3px] text-[length:10px] leading-none text-brand',
  'outline outline-1 -outline-offset-[0.5px] outline-[color:var(--brand-line)]',
);

export const resultKindMcpStyles =
  'rounded-[6px] bg-surface-chip px-2 py-[3px] text-[length:10px] leading-none text-muted-ink outline outline-1 -outline-offset-[0.5px] outline-[color:var(--stroke-card)]';

export const resultMetaStyles =
  'text-[length:11px] leading-[1.5] text-quieter [overflow-wrap:anywhere]';

export const resultDescStyles =
  'line-clamp-2 text-[length:12px] leading-[19px] text-muted-ink [overflow-wrap:anywhere]';

export const resultEvidenceStyles = cn(
  'mt-0.5 flex flex-col gap-1 border-l-2 border-solid border-l-[color:var(--brand-line)]',
  'pl-2 text-[length:11px] leading-[1.6] text-quiet',
);

export const resultEvidenceLabelStyles = 'font-medium text-brand';

export const resultJudgmentStyles =
  'mt-0.5 flex flex-col gap-1.5 text-[length:11.5px] leading-[1.65] text-ink [overflow-wrap:anywhere]';

export const resultJudgmentLabelStyles = cn(
  'mr-1.5 inline-flex items-center gap-1 rounded-[5px] bg-brand-tint px-1.5 py-px align-[1px]',
  'text-[length:10px] leading-[16px] font-medium text-brand',
);

export const resultSideStyles = cn(
  'ml-auto flex shrink-0 flex-col items-end gap-2',
  'max-[600px]:w-full max-[600px]:flex-row max-[600px]:items-center max-[600px]:justify-between max-[600px]:pl-[46px]',
);

export const resultVisibilityStyles =
  'rounded-[6px] bg-surface-chip px-2 py-[3px] text-[length:10px] leading-none text-muted-ink outline outline-1 -outline-offset-[0.5px] outline-[color:var(--stroke-card)]';

export const resultInstallStyles = cn(
  'inline-flex items-center gap-1 text-[length:11.5px] text-brand hover:underline pointer-coarse:min-h-9',
);

export const resultsNoteStyles =
  'text-[length:11px] leading-[1.7] text-quieter [overflow-wrap:anywhere]';

export const bundleSelectActionStyles = cn(
  textBtnStyles,
  'aria-disabled:cursor-default aria-disabled:opacity-50 pointer-coarse:min-h-10',
);

export const bundleRowStyles = cn(
  checkLabelStyles,
  'min-h-12 grid-cols-[minmax(0,1fr)_var(--check-size)] items-center gap-3 rounded-none px-1 py-2.5',
  '[&>span]:col-start-1 [&>span]:row-start-1 [&>input]:col-start-2 [&>input]:row-start-1',
  "[&_>_input[type='checkbox']]:[margin-block-start:0]",
  '[&:has(>_input:checked)]:bg-transparent [&:has(>_input:checked)]:[box-shadow:none]',
  '[@media_(hover:_hover)]:[&:hover:has(>_input:not(:disabled))]:bg-surface-chip-soft',
  '[&:has(>_input:focus-visible)]:bg-brand-tint [&:has(>_input:focus-visible)]:[box-shadow:none]',
);

export const bundleEntryStyles = cn(
  'grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5',
  'max-[520px]:grid-cols-[auto_minmax(0,1fr)] max-[520px]:gap-x-2.5',
);

export const bundleVersionStyles =
  'max-w-36 text-right font-mono text-caption font-normal text-muted-ink max-[520px]:col-start-2 max-[520px]:max-w-full max-[520px]:text-left';

export const bundleMethodBarStyles = cn(
  'flex w-full flex-nowrap gap-5 rounded-none border-b border-line p-0 [background:none] [box-shadow:none]',
  'max-[520px]:gap-2',
);

export const bundleMethodStyles = cn(
  'min-h-10 rounded-none px-1 py-2 aria-checked:font-semibold aria-checked:text-brand',
  'focus-visible:-outline-offset-2 forced-colors:aria-checked:underline pointer-coarse:min-h-11 max-[520px]:flex-1',
);

// 追问区与结果用一条分隔线分开；快捷问题只填入不发送。
export const followUpBlockStyles =
  'mt-1 flex flex-col gap-2.5 border-t border-solid border-t-[color:var(--stroke-card)] pt-4';

export const followUpQuickStyles = 'flex flex-wrap items-center gap-2';

// 焦点线与原边框重合，不叠出两圈；需要更高对比度时恢复外置轮廓。
export const followUpStyles = cn(
  'flex min-h-12 items-center gap-2.5 rounded-[12px] border border-solid border-control-border bg-paper',
  'py-1.5 pr-1.5 pl-3.5 -outline-offset-1 motion-safe:transition-shadow',
  'has-[input:focus-visible]:outline-1 has-[input:focus-visible]:outline-solid has-[input:focus-visible]:outline-muted-ink/80',
  'has-[input:focus-visible]:[box-shadow:0_0_12px_1px_var(--brand-veil)]',
  'contrast-more:outline-offset-2 contrast-more:has-[input:focus-visible]:outline-2',
  'forced-colors:outline-offset-2 forced-colors:has-[input:focus-visible]:outline-2 forced-colors:has-[input:focus-visible]:[outline-color:Highlight]',
);

export const followUpFieldStyles = cn(
  'min-h-9 min-w-0 flex-1 border-0 bg-transparent text-[length:13px] text-ink [outline:0]',
  '[box-shadow:none] [&::placeholder]:text-muted-ink max-[600px]:text-[length:16px]',
);

export const followUpSendStyles = cn(
  'inline-flex h-9 shrink-0 items-center gap-1 rounded-[9px] bg-brand px-3.5 text-[length:12.5px] font-semibold',
  'text-on-brand [transition:background-color_120ms_ease] enabled:hover:bg-brand-hover',
  'disabled:bg-surface-chip disabled:text-quieter disabled:opacity-100 pointer-coarse:min-h-11',
);

export const stopButtonStyles = cn(
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] border border-solid border-[color:var(--stroke-card)]',
  'bg-surface-chip px-3.5 text-[length:12.5px] font-medium text-ink [transition:background-color_120ms_ease]',
  'hover:bg-brand-tint',
);

// 同一等待区只在祖先上播放一次呼吸；换步骤或更新字数时，圆点和骨架仍沿用同一相位。
export const thinkingFeedbackStyles = cn(
  'flex flex-col gap-3 motion-safe:[animation:discovery-breathe_1.25s_ease-in-out_infinite_alternate]',
  '[--discovery-halo:0_0_0_calc(4.1px*var(--discovery-glow))_color-mix(in_srgb,var(--brand)_calc(9%_+_17%*var(--discovery-glow)),transparent)]',
  'forced-colors:[animation:none]',
);

const thinkingBubbleGlowStyles =
  'motion-safe:[box-shadow:0_0_calc(4px_+_8.5px*var(--discovery-glow))_color-mix(in_srgb,var(--brand)_calc(13%*var(--discovery-glow)),transparent)] forced-colors:[box-shadow:none]';

export const thinkingStyles = cn(
  thinkingBubbleGlowStyles,
  'flex w-fit items-center gap-2.5 rounded-[14px] rounded-tl-[5px] border border-solid border-[color:var(--stroke-card)]',
  'bg-surface-bubble/65 px-3.5 py-2.5 text-[length:12px] text-muted-ink',
);

export const thinkingDotStyles =
  'size-2 shrink-0 rounded-full bg-brand [box-shadow:var(--discovery-halo)]';

export const thinkingTextStyles =
  'font-semibold text-brand motion-reduce:underline forced-colors:underline';

export const thinkingStepsStyles = cn(
  thinkingBubbleGlowStyles,
  'w-fit rounded-[14px] rounded-tl-[5px] border border-solid border-[color:var(--stroke-card)]',
  'bg-surface-bubble/65 px-3.5 py-3',
);

export const thinkingStepListStyles = 'm-0 flex list-none flex-col gap-2 p-0';

export const thinkingStepStyles = cn(
  'group/step flex items-center gap-2.5 text-[length:12px] leading-5 text-quieter',
  '[transition:color_200ms_ease] data-[state=active]:text-ink data-[state=done]:text-muted-ink',
);

// 对勾、实心点和空心圈分别表示已完成、进行中和待处理，不依赖动画区分。
export const thinkingStepMarkStyles = cn(
  'relative grid size-4 shrink-0 place-items-center rounded-full border border-solid border-[color:var(--stroke-card)]',
  "after:absolute after:inset-[3px] after:rounded-full after:content-['']",
  'group-data-[state=done]/step:border-transparent group-data-[state=done]/step:bg-brand-tint',
  'group-data-[state=done]/step:text-brand group-data-[state=active]/step:border-[color:var(--brand)]',
  'group-data-[state=active]/step:after:bg-brand group-data-[state=active]/step:[box-shadow:var(--discovery-halo)]',
);

export const taskBodyStyles = cn(
  'flex flex-col gap-2.5 [transition:opacity_200ms_ease] data-[answered]:transition-none',
  'motion-safe:data-[answered]:[animation:discovery-answer-in_260ms_ease-out]',
);

export const taskBodyStaleStyles = 'opacity-45';

export const conditionRailStyles = 'flex w-[300px] shrink-0 flex-col gap-3 max-[850px]:w-full';

export const conditionCardStyles = cn(
  'flex flex-col gap-2.5 rounded-[14px] border border-solid border-[color:var(--stroke-card)]',
  'bg-surface-card/50 p-3.5',
);

export const conditionHeadStyles = 'flex items-center justify-between gap-2';

export const conditionHeadTitleStyles =
  'inline-flex items-center gap-1.5 text-[length:12px] font-semibold text-ink';

export const conditionHeadHintStyles = 'text-[length:10px] text-quieter';

export const conditionRowStyles = cn(
  'flex w-full items-center justify-between gap-2 rounded-[6px] px-1 py-0.5 text-left',
  '[transition:background-color_120ms_ease] hover:bg-brand-tint',
);

export const conditionKeyStyles = 'shrink-0 text-[length:11px] text-quieter';

export const conditionValueStyles =
  'min-w-0 text-right text-[length:11.5px] text-ink [overflow-wrap:anywhere]';

export const conditionKeywordsStyles = 'flex flex-wrap justify-end gap-1';

export const conditionKeywordStyles =
  'rounded-[5px] bg-surface-chip px-1.5 py-px text-[length:11px] leading-[17px] text-ink';

export const conditionNoteStyles = 'text-[length:10px] leading-[16px] text-quieter';

export const conditionEditorStyles = 'flex flex-wrap items-center gap-1.5 pt-1';

export const conditionChoiceStyles = cn(
  'rounded-[6px] border border-solid border-[color:var(--stroke-card)] px-2 py-1 text-[length:11px]',
  'text-muted-ink hover:text-ink data-[chosen]:border-[color:var(--brand)] data-[chosen]:text-brand',
  'data-[chosen]:bg-brand-tint',
);

export const browseCardStyles = cn(
  'flex flex-col items-start gap-2.5 rounded-[14px] border border-solid border-[color:var(--stroke-card)]',
  'bg-surface-card/50 p-3.5',
);

export const browseCardTitleStyles = 'text-[length:12px] font-semibold text-ink';

export const browseCardDescStyles = 'text-[length:11px] leading-[18px] text-muted-ink';

export const browseCardButtonStyles = cn(
  'inline-flex items-center gap-1.5 rounded-[8px] border border-solid border-[color:var(--brand-line)]',
  'bg-brand-tint px-[11px] py-[7px] text-[length:11px] font-semibold text-brand hover:bg-brand-soft',
);

export const directionStyles = cn(
  'flex w-full items-start gap-2.5 rounded-[11px] border border-solid border-[color:var(--stroke-card)]',
  'bg-surface-card/50 p-3 text-left [transition:border-color_150ms_ease,background-color_150ms_ease,translate_180ms_ease]',
  'hover:border-[color:var(--brand-line)] hover:bg-brand-tint motion-safe:hover:-translate-y-px',
);

export const directionIndexStyles =
  'grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-chip font-mono text-[length:11px] text-muted-ink';

export const directionLabelStyles = 'flex min-w-0 flex-1 flex-col';

export const directionTitleStyles = 'text-[length:12.5px] font-semibold text-ink';

export const directionIntentStyles =
  'mt-0.5 line-clamp-2 text-[length:11px] leading-[17px] text-muted-ink';

export const directionExampleStyles = 'mt-1 font-mono text-[length:10.5px] text-quieter';

export const answerStyles = cn(
  'rounded-[14px] rounded-tl-[5px] border border-solid border-[color:var(--stroke-card)] bg-surface-bubble/65',
  'px-3.5 py-3 text-[length:12.5px] leading-[1.7] text-ink [overflow-wrap:anywhere]',
);

export const taskStateStyles =
  'rounded-[11px] border border-solid border-[color:var(--stroke-card)] bg-surface-card px-[13px] py-3 text-[length:12px] text-muted-ink';
