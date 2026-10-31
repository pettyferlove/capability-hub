import { cn } from '../../shared/styles/cn.js';

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
  'text-ink text-[length:12px] leading-[1.95] [overflow-wrap:anywhere] [&_h1]:text-[length:25px]',
  '[&_h2]:text-[length:21px] [&_h2]:mt-[25px] [&_h2]:mr-0 [&_h2]:mb-3.5 [&_h2]:ml-0',
  '[&_h3]:text-[length:17px] [&_h3]:mt-5 [&_h3]:mr-0 [&_h3]:mb-2.5 [&_h3]:ml-0 [&_p]:mt-3.5',
  '[&_p]:mr-0 [&_p]:mb-3.5 [&_p]:ml-0 [&_ul]:pl-5.5 [&_ol]:pl-5.5 [&_pre]:bg-page [&_pre]:pt-3.5',
  '[&_pre]:pr-3.5 [&_pre]:pb-3.5 [&_pre]:pl-3.5 [&_pre]:rounded-[9px] [&_pre]:overflow-auto',
  '[&_pre_code]:whitespace-pre [&_pre_code]:text-[length:11px] [&_code]:text-[length:11px]',
  '[&_table]:block [&_table]:overflow-auto',
  "[[class~='group/asset-content']_&_:is(h1,_h2,_h3,_h4,_h5,_h6)]:[scroll-margin-top:112px]",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&]:pt-4.5",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&]:pr-4.5",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&]:pb-4.5",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&]:pl-4.5",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&]:text-[length:12px]",
  "[[class~='group/asset-content']_[class~='group/detail-file-preview-content']_&_:is(h1,_h2,_h3,_h4,_h5,_h6)]:[scroll-margin-top:16px]",
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

export const feedbackListStyles = cn(
  '[list-style:none] pt-0 pr-0 pb-0 pl-0 grid gap-[var(--space-3)]',
  '[&_button]:[overflow-wrap:anywhere]',
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

export const discoverStyles = cn(
  "group/discover [&_[class~='group/hero-copy']_[class~='group/eyebrow']]:text-caption",
  "[&_[class~='group/hero-copy']_[class~='group/eyebrow']]:leading-[18px]",
  "[&_[class~='group/hero-copy']_[class~='group/eyebrow']]:mt-0",
  "[&_[class~='group/hero-copy']_[class~='group/eyebrow']]:mr-0",
  "[&_[class~='group/hero-copy']_[class~='group/eyebrow']]:mb-[var(--space-1)]",
  "[&_[class~='group/hero-copy']_[class~='group/eyebrow']]:ml-0",
);

export const discoverHeroStyles = cn(
  'relative [isolation:isolate] flex pt-15 pr-0 pb-[55px] pl-0 overflow-hidden',
  'min-[1400px]:pt-[67px] min-[1400px]:pb-[65px] max-[600px]:pt-[35px] max-[600px]:pr-0',
  "max-[600px]:pb-8 max-[600px]:pl-0 [[class~='group/discover']_&]:pt-0",
  "[[class~='group/discover']_&]:pr-0 [[class~='group/discover']_&]:pb-[var(--section-gap)]",
  "[[class~='group/discover']_&]:pl-0 [[class~='group/discover']_&]:mt-0",
  "[[class~='group/discover']_&]:mr-0 [[class~='group/discover']_&]:mb-0",
  "[[class~='group/discover']_&]:ml-0 max-[600px]:[[class~='group/discover']_&]:pt-7",
  "max-[600px]:[[class~='group/discover']_&]:pr-0 max-[600px]:[[class~='group/discover']_&]:pb-6",
  "max-[600px]:[[class~='group/discover']_&]:pl-0",
);

export const heroDotsStyles = cn(
  'absolute top-0 right-0 bottom-0 left-0 z-[-2] opacity-[var(--hero-dot-opacity)]',
  '[mask-image:radial-gradient(ellipse_closest-side_at_70%_50%,_black,_transparent)]',
);

export const heroOrbStyles = cn(
  'absolute top-0 right-0 bottom-0 left-auto w-[min(60%,_560px)]',
  '[background:radial-gradient(ellipse_closest-side_at_center,_var(--hero-wash),_transparent)]',
  'z-[-1]',
);

export const heroCopyStyles = cn(
  'group/hero-copy w-[75%] relative z-[2] [&_h1]:text-[length:43px]',
  '[&_h1]:[font-weight:650] [&_h1]:tracking-[-1.6px] [&_h1]:leading-[1.35] [&_h1]:mt-[17px]',
  '[&_h1]:mr-0 [&_h1]:mb-[17px] [&_h1]:ml-0 max-[1100px]:w-[75%] max-[850px]:w-full',
  'max-[600px]:[&_h1]:text-[length:31px] max-[600px]:[&_h1]:tracking-[-1px]',
  'max-[600px]:[&_h1]:leading-[1.4] max-[600px]:[&_h1]:mt-3.5 max-[600px]:[&_h1]:mr-0',
  'max-[600px]:[&_h1]:mb-3.5 max-[600px]:[&_h1]:ml-0',
  "[[class~='group/discover']_&_h1]:text-[length:31px]",
  "[[class~='group/discover']_&_h1]:leading-[1.4]",
  "[[class~='group/discover']_&_h1]:tracking-[-0.015em]",
  "[[class~='group/discover']_&_h1]:mt-[var(--space-2)] [[class~='group/discover']_&_h1]:mr-0",
  "[[class~='group/discover']_&_h1]:mb-[var(--space-2)] [[class~='group/discover']_&_h1]:ml-0",
  "[[class~='group/discover']_&_h1]:max-w-175 [[class~='group/discover']_&_h1]:font-semibold",
  "max-[600px]:[[class~='group/discover']_&_h1]:text-[length:29px]",
  "max-[600px]:[[class~='group/discover']_&_h1]:leading-[1.5]",
  "max-[600px]:[[class~='group/discover']_&_h1]:max-w-full",
  "max-[600px]:[&_[class~='group/eyebrow']]:text-[length:9px]",
  "max-[600px]:[&_[class~='group/eyebrow']]:tracking-[1px]",
);

export const liveDotStyles = 'inline-block w-1.5 h-1.5 bg-brand rounded-[50%] shrink-0';

export const heroDescriptionStyles = cn(
  'text-[length:15px] text-muted-ink leading-[1.9] max-[600px]:text-[length:12px]',
  "[[class~='group/discover']_&]:text-body [[class~='group/discover']_&]:leading-[1.8]",
  "max-[600px]:[[class~='group/discover']_&]:text-[length:12px]",
);

export const catalogSearchStyles = cn(
  'group/catalog-search grid grid-cols-[20px_minmax(0,_1fr)_32px] items-center gap-3 w-full',
  'max-w-162.5 h-13.5 mt-[var(--space-5)] pt-0 pr-2.5 pb-0 pl-4 border border-solid border-[color:var(--line)]',
  'rounded-[14px] bg-paper [box-shadow:0_2px_8px_color-mix(in_srgb,_var(--ink)_4%,_transparent)]',
  'text-muted-ink [transition:border-color_150ms_ease]',
  'hover:border-t-[color:color-mix(in_srgb,_var(--brand)_40%,_var(--line))]',
  'hover:border-r-[color:color-mix(in_srgb,_var(--brand)_40%,_var(--line))]',
  'hover:border-b-[color:color-mix(in_srgb,_var(--brand)_40%,_var(--line))]',
  'hover:border-l-[color:color-mix(in_srgb,_var(--brand)_40%,_var(--line))]',
  '[&_>_input]:min-w-0 [&_>_input]:min-h-0',
  '[&_>_input]:w-full [&_>_input]:h-full [&_>_input]:mt-0 [&_>_input]:mr-0 [&_>_input]:mb-0',
  '[&_>_input]:ml-0 [&_>_input]:pt-0 [&_>_input]:pr-0 [&_>_input]:pb-0 [&_>_input]:pl-0',
  '[&_>_input]:border-0 [&_>_input]:rounded-none [&_>_input]:[outline:0] [&_>_input]:bg-transparent',
  '[&_>_input]:[box-shadow:none] [&_>_input]:text-ink [&_>_input]:text-[length:15px]',
  '[&_>_input]:leading-[1.5] [&_>_input::placeholder]:text-muted-ink',
  '[&_>_input::placeholder]:opacity-[0.8] max-[600px]:h-12.5 max-[600px]:gap-2.5 max-[600px]:pl-3',
  'max-[600px]:rounded-[12px] max-[600px]:[&_>_input]:text-[length:17px]',
  '[&:has(:focus-visible)]:outline-2 [&:has(:focus-visible)]:outline-solid [&:has(:focus-visible)]:outline-muted-ink [&:has(:focus-visible)]:outline-offset-2',
);

export const catalogSearchIconStyles =
  "[transition:color_150ms_ease] [[class~='group/catalog-search']:focus-within_&]:text-brand";

export const catalogSearchActionStyles = cn(
  'grid [place-items:center] w-8 h-8 [&_>_kbd]:grid [&_>_kbd]:[place-items:center] [&_>_kbd]:w-6',
  '[&_>_kbd]:h-6 [&_>_kbd]:border [&_>_kbd]:border-solid [&_>_kbd]:border-[color:var(--line)] [&_>_kbd]:rounded-[6px] [&_>_kbd]:bg-page',
  '[&_>_kbd]:text-muted-ink [&_>_kbd]:font-mono [&_>_kbd]:text-[length:12px] [&_>_kbd]:leading-[1]',
);

export const catalogSearchClearStyles = cn(
  'grid [place-items:center] w-8 h-8 pt-0 pr-0 pb-0 pl-0 border-0 rounded-[8px] bg-transparent',
  'text-muted-ink [transition:background-color_120ms_ease,_color_120ms_ease] hover:bg-brand-soft',
  'hover:text-brand',
);

export const quickSearchStyles = cn(
  'relative flex items-center flex-nowrap gap-[9px] mt-3.5 text-[length:11px] text-muted-ink min-h-7',
  'overflow-x-auto [overscroll-behavior-x:contain] [scrollbar-width:none] whitespace-nowrap',
  '[&_>_*]:shrink-0 max-[600px]:gap-1.5 max-[600px]:text-[length:11px]',
  "[[class~='group/discover']_&]:mt-[11px]",
);

export const quickSearchItemStyles = cn(
  'inline-flex items-center [&_>_button]:flex [&_>_button]:items-center [&_>_button]:gap-[7px]',
  '[&_>_button]:border [&_>_button]:border-solid [&_>_button]:border-[color:var(--line)] [&_>_button]:bg-paper [&_>_button]:text-muted-ink',
  '[&_>_button]:pt-[3px] [&_>_button]:pr-[9px] [&_>_button]:pb-[3px] [&_>_button]:pl-[9px]',
  '[&_>_button]:rounded-[5px] [&_>_button]:text-[length:11px] [&_>_button:hover]:text-brand',
  '[&_>_button:hover]:border-t-[color:var(--brand)]',
  '[&_>_button:hover]:border-r-[color:var(--brand)]',
  '[&_>_button:hover]:border-b-[color:var(--brand)]',
  '[&_>_button:hover]:border-l-[color:var(--brand)] max-[600px]:[&_>_button]:text-[length:11px]',
  'max-[600px]:[&_>_button]:pt-[3px] max-[600px]:[&_>_button]:pr-[7px]',
  'max-[600px]:[&_>_button]:pb-[3px] max-[600px]:[&_>_button]:pl-[7px]',
);

export const keywordRefreshingStyles =
  'motion-safe:[animation:keyword-refresh_0.9s_linear_infinite]';

export const heroArtStyles = cn(
  'group/hero-art absolute right-5 top-[75px] w-70 h-[255px] max-[1100px]:right-2',
  'max-[1100px]:[transform:scale(0.85)] max-[850px]:opacity-[0.22] max-[850px]:right-0',
  "max-[850px]:top-10 max-[850px]:z-[-1] max-[600px]:hidden [[class~='group/discover']_&]:top-0",
  "[[class~='group/discover']_&]:[transform:scale(0.85)]",
  "[[class~='group/discover']_&]:[transform-origin:top_right]",
);

export const orbitLineStyles =
  'absolute w-60 h-35 top-9.5 left-0 [transform:rotate(-28deg)] overflow-visible [fill:none]';

export const orbitTrackStyles =
  '[stroke:color-mix(in_srgb,_var(--brand),_transparent_78%)] [stroke-width:1] [stroke-dasharray:3_3]';

export const orbitSignalStyles = cn(
  '[stroke:var(--brand)] [stroke-width:2] [stroke-linecap:round] [stroke-dasharray:3_97]',
  'opacity-[0.65]',
  "motion-safe:[[class~='group/hero-art']_&]:[animation:hero-orbit-signal_14s_linear_infinite]",
);

export const orbitTileStyles = cn(
  '[--glyph-off:var(--hero-glyph-off)] flex flex-col items-center justify-center gap-[5px] absolute',
  '[background:linear-gradient(145deg,_var(--hero-tile-start),_var(--paper))]',
  'border border-solid border-[color:var(--hero-tile-border)] [box-shadow:var(--hero-tile-shadow)] rounded-[22px]',
  'text-brand text-[length:12px]',
);

export const tileMainStyles = cn(
  'left-4.5 top-[13px] w-[125px] h-33 [transform:rotate(-8deg)]',
  "motion-safe:[[class~='group/hero-art']_&]:[animation:hero-skill-float_7s_ease-in-out_infinite]",
);

export const tileMcpStyles = cn(
  'right-2 top-[105px] w-24 h-25.5 [transform:rotate(10deg)] text-warning',
  "motion-safe:[[class~='group/hero-art']_&]:[animation:hero-mcp-float_8s_ease-in-out_-2s_infinite]",
);

export const artCrossStyles = cn(
  'absolute text-brand text-[length:23px] [font-weight:200]',
  "motion-safe:[[class~='group/hero-art']_&]:[animation:hero-cross-drift_6s_ease-in-out_infinite]",
);

export const cross1Styles = 'right-[17px] top-0';

export const cross2Styles =
  "left-[-30px] bottom-12.5 motion-safe:[[class~='group/hero-art']_&]:[animation-delay:-3s]";

export const catalogToolbarStyles = cn(
  'group/catalog-toolbar flex items-center justify-between gap-5 pt-4.5 pr-0 pb-6 pl-0 [&_h2]:flex',
  '[&_h2]:items-center [&_h2]:mt-1.5 [&_h2]:text-[length:23px] max-[600px]:items-start',
  'max-[600px]:flex-col max-[600px]:gap-4 max-[600px]:pt-[13px] max-[600px]:pb-4',
  "max-[600px]:[&_h2]:text-[length:21px] [[class~='group/discover']_&]:pt-[15px]",
  "[[class~='group/discover']_&]:pr-0 [[class~='group/discover']_&]:pb-[17px]",
  "[[class~='group/discover']_&]:pl-0 [&_[class~='group/eyebrow']]:text-[length:9px]",
);

export const catalogFiltersStyles = cn(
  'flex justify-between items-center gap-3 border-b [border-bottom-style:solid] border-b-[color:var(--line)] mb-[23px] flex-wrap',
  'max-[600px]:gap-[5px]',
);

export const scenarioFilterStyles = cn(
  'flex flex-row items-center gap-2 text-muted-ink [&_select]:bg-transparent [&_select]:border-0',
  '[&_select]:text-muted-ink [&_select]:text-[length:12px] [&_select]:pt-1.5 [&_select]:pr-1.5',
  '[&_select]:pb-1.5 [&_select]:pl-1.5 [&_select]:max-w-40 max-[600px]:ml-auto max-[600px]:mb-2',
);

export const catalogResultsStyles = cn(
  "group/catalog-results min-h-85 [&_[class~='group/empty']]:min-h-85",
  "[&_[class~='group/empty']]:mt-0 [&_[class~='group/empty']]:mr-0 [&_[class~='group/empty']]:mb-0",
  "[&_[class~='group/empty']]:ml-0",
);

export const assetGridStyles = cn(
  'relative grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-4.5',
  'max-[850px]:grid-cols-[repeat(2,_minmax(0,_1fr))] max-[600px]:grid-cols-[1fr] max-[600px]:gap-3',
);

export const catalogResultStateStyles = '[grid-column:1_/_-1] min-w-0';

export const assetGridItemStyles = 'group/asset-grid-item min-w-0';

export const assetCardStyles = cn(
  "group/asset-card [[class~='group/asset-grid-item']_>_&]:h-full flex flex-col pt-6 pr-[23px]",
  'pb-[17px] pl-[23px] bg-paper border border-solid border-[color:var(--line)] rounded-[14px] text-ink min-h-[285px]',
  '[transition:box-shadow_0.2s,_border-color_0.2s,_transform_0.2s]',
  'hover:border-t-[color:color-mix(in_srgb,_var(--brand),_var(--line)_50%)]',
  'hover:border-r-[color:color-mix(in_srgb,_var(--brand),_var(--line)_50%)]',
  'hover:border-b-[color:color-mix(in_srgb,_var(--brand),_var(--line)_50%)]',
  'hover:border-l-[color:color-mix(in_srgb,_var(--brand),_var(--line)_50%)]',
  'hover:[transform:translateY(-3px)] hover:[box-shadow:var(--shadow)]',
  'focus-visible:border-t-[color:color-mix(in_srgb,_var(--brand),_var(--line)_50%)]',
  'focus-visible:border-r-[color:color-mix(in_srgb,_var(--brand),_var(--line)_50%)]',
  'focus-visible:border-b-[color:color-mix(in_srgb,_var(--brand),_var(--line)_50%)]',
  'focus-visible:border-l-[color:color-mix(in_srgb,_var(--brand),_var(--line)_50%)]',
  'focus-visible:[transform:translateY(-3px)] focus-visible:[box-shadow:var(--shadow)]',
  'focus-visible:[outline:2px_solid_var(--brand)] focus-visible:[outline-offset:3px]',
  '[&_h3]:[display:-webkit-box] [&_h3]:[-webkit-line-clamp:2] [&_h3]:[-webkit-box-orient:vertical]',
  '[&_h3]:overflow-hidden [&_h3]:font-mono [&_h3]:text-[length:15px] [&_h3]:[font-weight:550]',
  '[&_h3]:tracking-[-0.3px] [&_h3]:[overflow-wrap:anywhere] [&_>_p]:[display:-webkit-box]',
  '[&_>_p]:[-webkit-line-clamp:3] [&_>_p]:[-webkit-box-orient:vertical] [&_>_p]:overflow-hidden',
  '[&_>_p]:min-h-[5.7em] [&_>_p]:text-[length:12px] [&_>_p]:text-muted-ink [&_>_p]:leading-[1.9]',
  '[&_>_p]:[flex:initial] [&_>_p]:mb-[15px] [&_>_p]:[overflow-wrap:anywhere] min-[1400px]:min-h-75',
  'max-[600px]:pt-[21px] max-[600px]:pr-5 max-[600px]:pb-4 max-[600px]:pl-5',
  'max-[600px]:min-h-[255px] max-[600px]:[&_>_p]:text-[length:12px]',
);

export const assetCardTopStyles = 'flex items-center gap-2.5 mb-[15px] max-[600px]:mb-3';

export const cardArrowStyles = cn(
  "ml-auto text-muted-ink opacity-[0.4] [[class~='group/asset-card']:hover_&]:opacity-[1]",
  "[[class~='group/asset-card']:hover_&]:text-brand",
  "[[class~='group/asset-card']:focus-visible_&]:opacity-[1]",
  "[[class~='group/asset-card']:focus-visible_&]:text-brand",
);

export const assetVersionStyles = cn(
  'block overflow-hidden text-ellipsis whitespace-nowrap text-[length:11px] text-muted-ink mt-[3px]',
  'mr-0 mb-2.5 ml-0',
);

export const assetCardMetaStyles = 'flex flex-col gap-2 mt-auto pb-4';

export const assetCardTagsStyles = cn(
  "group/asset-card-tags items-start min-h-6 [&_[class~='group/tag']]:max-w-full",
  "[&_[class~='group/tag']]:[overflow-wrap:anywhere]",
);

export const matchReasonStyles = cn(
  'text-brand [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]',
  'overflow-hidden leading-[1.6] [overflow-wrap:anywhere]',
);

export const assetCardFootStyles = cn(
  'flex items-center gap-1.5 text-[length:11px] text-muted-ink border-t [border-top-style:solid] border-t-[color:var(--line)]',
  'pt-[13px] mt-0',
);

export const cardRecommendationsStyles =
  'inline-flex items-center gap-[var(--space-2)] text-brand text-label';

export const assetOwnerStyles = 'group/asset-owner inline-flex items-center flex-1 min-w-0 gap-1.5';

export const ownerAvatarStyles = cn(
  'flex items-center justify-center border border-solid border-[color:var(--line)] bg-brand-soft text-brand',
  'rounded-[50%] font-semibold w-5.5 h-5.5 text-[length:11px]',
  "[[class~='group/asset-owner']_&]:shrink-0",
);

export const assetOwnerNameStyles = 'overflow-hidden text-ellipsis whitespace-nowrap';

export const audienceLabelStyles =
  'ml-auto text-[length:11px] shrink-0 max-w-[48%] overflow-hidden text-ellipsis whitespace-nowrap';

export const paginationStyles = 'flex justify-center mt-7.5';

export const catalogNoteStyles = cn(
  'flex items-center justify-center gap-[7px] text-muted-ink text-[length:11px] mt-8.5 pt-2.5 pr-2.5',
  'pb-2.5 pl-2.5 text-center [&_svg]:shrink-0 max-[600px]:text-[length:11px] max-[600px]:items-start',
  'max-[600px]:text-left max-[600px]:mt-[23px]',
);

export const assetDetailScrollStyles = cn(
  'group/asset-detail-scroll [--detail-padding:26px] pt-[var(--detail-padding)]',
  'pr-[var(--detail-padding)] pb-[var(--detail-padding)] pl-[var(--detail-padding)]',
  '[overflow-anchor:none] max-[760px]:[--detail-padding:20px]',
);

export const feedbackDetailStyles = cn(
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

export const managementGridStyles = 'items-stretch';

export const managementCardStyles = cn(
  'group/management-card flex flex-col min-w-0 [&_h3]:[overflow-wrap:anywhere]',
  "[&_[class~='group/source-actions']]:mt-auto [&_[class~='group/source-actions']]:pt-5",
);

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
