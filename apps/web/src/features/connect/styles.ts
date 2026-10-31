import { cn } from '../../shared/styles/cn.js';

export const agentExperienceStyles =
  'min-w-0 min-h-130 [contain:size] max-[799px]:min-h-0 max-[799px]:[contain:none]';

export const conversationDemoStyles = cn(
  'flex flex-col h-full min-w-0 overflow-hidden border border-solid border-[color:var(--line)] rounded-[20px]',
  'bg-paper [box-shadow:var(--shadow)] max-[799px]:h-auto',
);

export const conversationDemoHeaderStyles = cn(
  'group/conversation-demo-header flex items-center gap-[var(--space-3)] shrink-0 justify-between',
  'flex-wrap pt-[var(--space-4)] pr-[var(--space-4)] pb-[var(--space-4)] pl-[var(--space-4)]',
  'border-b [border-bottom-style:solid] border-b-[color:var(--line)] text-label max-[600px]:pt-[var(--space-3)]',
  'max-[600px]:pr-[var(--space-4)] max-[600px]:pb-[var(--space-3)] max-[600px]:pl-[var(--space-4)]',
  "[&_[class~='group/segmented']]:flex-nowrap [&_[class~='group/segmented']]:shrink-0",
  "[&_[class~='group/segmented']_button]:px-2 [&_[class~='group/segmented']_button]:text-label",
);

export const demoControlsStyles = cn(
  'group/demo-controls grid items-center gap-1.5 grid-cols-[auto_30px_auto] ml-auto',
  "[&_[class~='group/icon-btn']]:[grid-column:2] [&_[class~='group/icon-btn']]:w-7.5",
  "[&_[class~='group/icon-btn']]:h-7.5",
);

export const demoLabelStyles = 'text-muted-ink text-caption';

export const demoReplayStyles = cn(
  'flex items-center gap-[var(--space-2)] [grid-column:3] pt-1.5 pr-2.5 pb-1.5 pl-2.5',
  'border border-solid border-[color:var(--line)] rounded-[20px] text-caption text-muted-ink bg-paper',
  'whitespace-nowrap hover:text-brand hover:border-t-[color:var(--brand)]',
  'hover:border-r-[color:var(--brand)] hover:border-b-[color:var(--brand)]',
  'hover:border-l-[color:var(--brand)]',
  '[@media_(min-width:_800px)_and_(max-width:_1120px)]:[&_>_span]:hidden',
  '[@media_(min-width:_800px)_and_(max-width:_1120px)]:w-7.5',
  '[@media_(min-width:_800px)_and_(max-width:_1120px)]:h-7.5',
  '[@media_(min-width:_800px)_and_(max-width:_1120px)]:pt-0',
  '[@media_(min-width:_800px)_and_(max-width:_1120px)]:pr-0',
  '[@media_(min-width:_800px)_and_(max-width:_1120px)]:pb-0',
  '[@media_(min-width:_800px)_and_(max-width:_1120px)]:pl-0',
  '[@media_(min-width:_800px)_and_(max-width:_1120px)]:justify-center',
);

export const conversationDemoThreadStyles = cn(
  'flex flex-col items-stretch gap-[var(--space-4)] flex-1 h-100 min-h-0 pt-[var(--space-4)]',
  'pr-[var(--space-4)] pb-[var(--space-4)] pl-[var(--space-4)] overflow-y-auto',
  '[overflow-anchor:none] [scrollbar-width:thin]',
  'bg-paper',
  'focus-visible:[outline:2px_solid_var(--brand)] focus-visible:[outline-offset:-2px]',
  'max-[799px]:[flex:none] max-[799px]:h-95 max-[799px]:min-h-0 max-[600px]:pt-[var(--space-4)]',
  'max-[600px]:pr-[var(--space-4)] max-[600px]:pb-[var(--space-4)] max-[600px]:pl-[var(--space-4)]',
);

export const demoStepStyles = 'flex gap-[var(--space-2)] min-w-0 shrink-0';

export const demoStepUserStyles = 'group/demo-step-user [flex-direction:row-reverse]';

export const demoStepToolStyles = 'pl-9 max-[600px]:pl-0';

export const demoStepConfirmationStyles = 'pl-9 max-[600px]:pl-0';

export const demoToolStyles = cn(
  'flex flex-col gap-[var(--space-1)] pt-[var(--space-3)] pr-[var(--space-4)] pb-[var(--space-3)]',
  'pl-[var(--space-4)] min-w-0 w-full border border-solid border-[color:var(--line)] rounded-[14px] text-label',
  'leading-[1.7] [&_>_p]:text-muted-ink',
);

export const demoToolHeadingStyles =
  'flex items-center gap-[var(--space-2)] text-brand [&_code]:text-body';

export const demoToolStatusStyles = 'ml-auto whitespace-nowrap text-caption';

export const demoToolInputStyles = 'text-muted-ink [overflow-wrap:anywhere]';

export const demoConfirmationStyles = cn(
  'flex items-start gap-[var(--space-3)] pt-[var(--space-4)] pr-[var(--space-4)] pb-[var(--space-4)]',
  'pl-[var(--space-4)] border border-solid border-[color:color-mix(in_srgb,_var(--brand)_40%,_var(--line))]',
  'rounded-[14px] bg-brand-soft min-w-0 [&_>_svg]:text-brand [&_>_svg]:shrink-0 [&_>_svg]:mt-0.5',
  '[&_strong]:text-body [&_strong]:font-semibold [&_p]:text-muted-ink [&_p]:text-label',
  '[&_p]:leading-[1.8] [&_p]:mt-[var(--space-2)]',
);

export const demoDecisionStyles = 'block text-label text-brand mt-[var(--space-3)]';

export const demoConfirmationActionsStyles = cn(
  'group/demo-confirmation-actions flex flex-wrap gap-[var(--space-2)] mt-[var(--space-4)]',
  "[&_[class~='group/btn']]:min-h-9 [&_[class~='group/btn']]:pt-1.5 [&_[class~='group/btn']]:pr-3",
  "[&_[class~='group/btn']]:pb-1.5 [&_[class~='group/btn']]:pl-3 [&_[class~='group/btn']]:text-label",
);

export const demoAvatarStyles = cn(
  'flex items-center justify-center w-7 h-7 shrink-0 text-paper bg-ink rounded-[50%]',
  "[[class~='group/demo-step-user']_&]:bg-brand-soft [[class~='group/demo-step-user']_&]:text-brand",
);

export const demoBubbleStyles = cn(
  'pt-[var(--space-3)] pr-[var(--space-4)] pb-[var(--space-3)] pl-[var(--space-4)] text-body',
  'leading-[1.8] bg-page rounded-[4px_16px_16px] max-w-[min(calc(100%_-_36px),_72ch)]',
  "[overflow-wrap:anywhere] [[class~='group/demo-step-user']_&]:rounded-[16px_4px_16px_16px]",
  "[[class~='group/demo-step-user']_&]:bg-brand-soft [[class~='group/demo-step-user']_&]:text-ink",
);

export const demoTypingStyles = cn(
  'flex gap-1 pt-1.5 pr-0 pb-1.5 pl-10 [&_i]:w-[5px] [&_i]:h-[5px] [&_i]:rounded-[50%] [&_i]:bg-brand',
  '[&_i]:[animation:demo-dot_1s_ease-in-out_infinite] [&_i:nth-child(2)]:[animation-delay:0.15s]',
  '[&_i:nth-child(3)]:[animation-delay:0.3s]',
);

export const conversationDemoFooterStyles = cn(
  'group/conversation-demo-footer shrink-0 flex items-center justify-between flex-wrap',
  'gap-[var(--space-2)] pt-[var(--space-3)] pr-[var(--space-4)] pb-[var(--space-3)]',
  'pl-[var(--space-4)] border-t [border-top-style:solid] border-t-[color:var(--line)] text-caption text-muted-ink',
  '[&_>_span:first-child]:text-brand [&_>_button]:text-brand [&_>_button]:bg-brand-soft',
  'max-[600px]:px-[var(--space-4)]',
);

export const demoFollowStyles = cn(
  "[[class~='group/conversation-demo-footer']_>_&]:ml-auto",
  "[[class~='group/conversation-demo-footer']_>_&]:pt-1",
  "[[class~='group/conversation-demo-footer']_>_&]:pr-0",
  "[[class~='group/conversation-demo-footer']_>_&]:pb-1",
  "[[class~='group/conversation-demo-footer']_>_&]:pl-0",
  "[[class~='group/conversation-demo-footer']_>_&]:bg-transparent",
  "[[class~='group/conversation-demo-footer']_>_&]:text-caption",
);

export const connectionAuthorizationStyles =
  'max-w-160 mt-6 mr-auto mb-6 ml-auto [overflow-wrap:anywhere]';

export const connectOverviewStyles = cn(
  'grid grid-cols-[minmax(248px,_0.85fr)_minmax(0,_1.65fr)] items-stretch gap-[var(--section-gap)]',
  'max-[799px]:grid-cols-[minmax(0,_1fr)]',
);

export const connectEntryStyles = cn(
  'group/connect-entry [grid-column:1] [grid-row:1] max-[960px]:[grid-column:1]',
  "max-[960px]:[grid-row:1] [[class~='group/connect-layout--guest']_>_&]:flex-row",
  "[[class~='group/connect-layout--guest']_>_&]:items-center",
  "[[class~='group/connect-layout--guest']_>_&]:justify-between",
  "[[class~='group/connect-layout--guest']_>_&]:flex-wrap",
  "max-[640px]:[[class~='group/connect-layout--guest']_>_&]:flex-col",
  "max-[640px]:[[class~='group/connect-layout--guest']_>_&]:items-stretch",
);

export const connectionMethodsStyles =
  'grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-3 max-[600px]:grid-cols-[1fr]';

export const connectionMethodStyles = cn(
  'grid gap-2 pt-4.5 pr-4.5 pb-4.5 pl-4.5 border border-solid border-[color:var(--line)] rounded-[14px] bg-paper',
  "text-ink text-left cursor-pointer [&[class~='group/is-active']]:border-t-[color:var(--brand)]",
  "[&[class~='group/is-active']]:border-r-[color:var(--brand)]",
  "[&[class~='group/is-active']]:border-b-[color:var(--brand)]",
  "[&[class~='group/is-active']]:border-l-[color:var(--brand)]",
  "[&[class~='group/is-active']]:bg-brand-soft [&_span]:text-muted-ink [&_span]:text-caption",
);

export const isActiveStyles = 'group/is-active';

export const connectionStepsStyles = cn(
  '[&_span]:text-muted-ink [&_span]:text-caption [&_span]:block [&_span]:mt-2 grid',
  'grid-cols-[repeat(3,_minmax(0,_1fr))] gap-4.5 pl-6 max-[600px]:grid-cols-[1fr]',
);

export const connectToolboxStyles = cn(
  "[[class~='group/connect-layout']_>_&]:min-w-0",
  "[[class~='group/connect-layout']_>_&]:[grid-column:2]",
  "[[class~='group/connect-layout']_>_&]:[grid-row:1]",
  "max-[960px]:[[class~='group/connect-layout']_>_&]:[grid-column:1]",
  "max-[960px]:[[class~='group/connect-layout']_>_&]:[grid-row:2]",
  "[[class~='group/connect-layout--guest']_>_&]:[grid-column:1_/_-1]",
  "[[class~='group/connect-layout--guest']_>_&]:[grid-row:2]",
);

export const connectionPermissionStyles =
  'pt-4.5 pr-4.5 pb-4.5 pl-4.5 rounded-[12px] bg-brand-soft';

export const connectAccessStyles = cn(
  'flex flex-col gap-[var(--space-4)] min-w-0 [&_>_h2]:mt-0 [&_>_h2]:mr-0 [&_>_h2]:mb-0',
  '[&_>_h2]:ml-0',
);

export const accessMethodsStyles = 'grid gap-[var(--space-2)]';

export const accessMethodStyles = cn(
  'group/access-method relative grid grid-cols-[34px_minmax(0,_1fr)_16px] items-center gap-2.5 pt-3',
  'pr-3 pb-3 pl-3 border border-solid border-[color:var(--line)] rounded-[12px] bg-page cursor-pointer',
  '[transition:border-color_var(--duration-fast),_background-color_var(--duration-normal),_box-shadow_var(--duration-normal)]',
  "[&_input[type='radio']]:absolute [&_input[type='radio']]:top-0 [&_input[type='radio']]:right-0",
  "[&_input[type='radio']]:bottom-0 [&_input[type='radio']]:left-0 [&_input[type='radio']]:w-full",
  "[&_input[type='radio']]:h-full [&_input[type='radio']]:min-h-0 [&_input[type='radio']]:mt-0",
  "[&_input[type='radio']]:mr-0 [&_input[type='radio']]:mb-0 [&_input[type='radio']]:ml-0",
  "[&_input[type='radio']]:pt-0 [&_input[type='radio']]:pr-0 [&_input[type='radio']]:pb-0",
  "[&_input[type='radio']]:pl-0 [&_input[type='radio']]:border-0 [&_input[type='radio']]:opacity-0",
  "[&_input[type='radio']]:cursor-pointer",
  'hover:border-t-[color:color-mix(in_srgb,_var(--brand)_50%,_var(--line))]',
  'hover:border-r-[color:color-mix(in_srgb,_var(--brand)_50%,_var(--line))]',
  'hover:border-b-[color:color-mix(in_srgb,_var(--brand)_50%,_var(--line))]',
  'hover:border-l-[color:color-mix(in_srgb,_var(--brand)_50%,_var(--line))]',
  '[&:has(input:checked)]:border-t-[color:var(--brand)]',
  '[&:has(input:checked)]:border-r-[color:var(--brand)]',
  '[&:has(input:checked)]:border-b-[color:var(--brand)]',
  '[&:has(input:checked)]:border-l-[color:var(--brand)] [&:has(input:checked)]:bg-brand-soft',
  '[&:has(input:checked)]:[box-shadow:inset_0_0_0_1px_var(--brand)]',
  '[&:has(input:focus-visible)]:[outline:2px_solid_var(--brand)]',
  '[&:has(input:focus-visible)]:[outline-offset:2px]',
);

export const accessMethodIconStyles = cn(
  'grid [place-items:center] w-8.5 h-8.5 border border-solid border-[color:var(--line)] rounded-[10px] bg-paper',
  "text-muted-ink [[class~='group/access-method']:has(input:checked)_&]:text-brand",
);

export const accessMethodCopyStyles = cn(
  'min-w-0 [&_strong]:block [&_strong]:text-body [&_strong]:font-medium [&_strong]:text-ink',
  '[&_small]:block [&_small]:mt-[var(--space-1)] [&_small]:text-label [&_small]:leading-[1.65]',
  '[&_small]:text-muted-ink',
);

export const accessMethodCheckStyles = cn(
  'grid [place-items:center] w-4 h-4 border border-solid border-[color:var(--line)] rounded-[50%] text-on-brand',
  '[transition:border-color_var(--duration-fast),_background-color_var(--duration-fast)]',
  '[&_>_svg]:opacity-0 [&_>_svg]:[transform:scale(0.5)]',
  '[&_>_svg]:[transition:opacity_var(--duration-fast),_transform_var(--duration-normal)_var(--ease-out)]',
  "[[class~='group/access-method']:has(input:checked)_&_>_svg]:opacity-[1]",
  "[[class~='group/access-method']:has(input:checked)_&_>_svg]:[transform:scale(1)]",
  "[[class~='group/access-method']:has(input:checked)_&]:border-t-[color:var(--brand)]",
  "[[class~='group/access-method']:has(input:checked)_&]:border-r-[color:var(--brand)]",
  "[[class~='group/access-method']:has(input:checked)_&]:border-b-[color:var(--brand)]",
  "[[class~='group/access-method']:has(input:checked)_&]:border-l-[color:var(--brand)]",
  "[[class~='group/access-method']:has(input:checked)_&]:bg-brand",
);

export const accessMethodStepsStyles = cn(
  'grid gap-[var(--space-3)] min-h-27 pt-0 pr-0 pb-0 pl-0 mt-0 mr-0 mb-0 ml-0 [list-style:none]',
  '[counter-reset:access-step] [&_li]:grid [&_li]:grid-cols-[20px_minmax(0,_1fr)]',
  '[&_li]:gap-[var(--space-2)] [&_li]:items-start [&_li]:[counter-increment:access-step]',
  '[&_li]:text-label [&_li]:leading-[1.75] [&_li]:text-muted-ink',
  '[&_li::before]:[content:counter(access-step)] [&_li::before]:grid',
  '[&_li::before]:[place-items:center] [&_li::before]:w-5 [&_li::before]:h-5',
  '[&_li::before]:rounded-[50%] [&_li::before]:bg-brand-soft [&_li::before]:text-brand',
  '[&_li::before]:text-[length:11px] [&_li::before]:tabular-nums',
);

export const accessMethodActionStyles = cn(
  'group/access-method-action grid gap-[var(--space-3)] mt-auto [&_p]:min-h-9.5 [&_p]:text-caption',
  "[&_p]:leading-[1.75] [&_p]:text-muted-ink [&_[class~='group/btn']]:justify-center",
  "[&_[class~='group/btn']]:whitespace-normal",
);

export const toolboxStyles = cn(
  'group/toolbox border border-solid border-[color:var(--line)] rounded-[17px] bg-paper pt-[var(--panel-space)]',
  'pr-[var(--panel-space)] pb-[var(--panel-space)] pl-[var(--panel-space)]',
  '[&_>_h3]:text-[length:21px] max-[850px]:mt-0 max-[600px]:pt-5.5 max-[600px]:pr-5.5',
  'max-[600px]:pb-5.5 max-[600px]:pl-5.5 max-[600px]:[&_>_h3]:text-[length:21px] max-[760px]:pt-5',
  'max-[760px]:pr-5 max-[760px]:pb-5 max-[760px]:pl-5',
  "[[class~='group/connect-layout--guest']_&]:grid",
  "[[class~='group/connect-layout--guest']_&]:grid-cols-[repeat(3,_minmax(0,_1fr))]",
  "[[class~='group/connect-layout--guest']_&]:gap-x-[var(--space-5)]",
  "max-[1000px]:[[class~='group/connect-layout--guest']_&]:grid-cols-[repeat(2,_minmax(0,_1fr))]",
  "max-[640px]:[[class~='group/connect-layout--guest']_&]:grid-cols-[minmax(0,_1fr)]",
  "[&_>_[class~='group/subtle']]:text-label [&_>_[class~='group/subtle']]:mt-3",
  "[&_>_[class~='group/subtle']]:mr-0 [&_>_[class~='group/subtle']]:mb-[25px]",
  "[&_>_[class~='group/subtle']]:ml-0 [&_>_[class~='group/subtle']]:leading-[1.8]",
);

export const toolboxHeadingStyles = cn(
  "flex gap-3 items-center mb-4 [[class~='group/toolbox']_&_h3]:text-[length:17px]",
  "[[class~='group/toolbox']_&_h3]:leading-[1.5] [[class~='group/toolbox']_&_p]:text-[length:11px]",
  "[[class~='group/toolbox']_&_p]:mt-[5px]",
  "[[class~='group/connect-layout--guest']_&]:[grid-column:1_/_-1]",
);

export const asideIconStyles = cn(
  'inline-flex items-center justify-center w-13 h-13 bg-brand-soft text-brand rounded-[15px] mb-4.5',
  "[[class~='group/toolbox']_&]:w-10 [[class~='group/toolbox']_&]:h-10",
  "[[class~='group/toolbox']_&]:rounded-[11px] [[class~='group/toolbox']_&]:mt-0",
  "[[class~='group/toolbox']_&]:mr-0 [[class~='group/toolbox']_&]:mb-0",
  "[[class~='group/toolbox']_&]:ml-0 [[class~='group/toolbox']_&]:shrink-0",
);

export const toolItemStyles = cn(
  'flex items-start gap-3 pt-[17px] pr-0 pb-[17px] pl-0 border-t [border-top-style:solid] border-t-[color:var(--line)]',
  '[&_>_span]:text-muted-ink [&_>_span]:flex [&_>_span]:pt-[7px] [&_>_span]:pr-[7px] [&_>_span]:pb-[7px]',
  '[&_>_span]:pl-[7px] [&_>_span]:bg-page [&_>_span]:rounded-[8px] [&_>_div]:min-w-0',
  '[&_strong]:text-[length:11px] [&_p]:text-[length:12px] [&_p]:text-muted-ink [&_p]:leading-[1.65]',
  '[&_p]:mt-[5px] max-[850px]:inline-flex max-[850px]:w-[50%] max-[850px]:[vertical-align:top]',
  'max-[850px]:pr-[15px] max-[600px]:w-full max-[600px]:pt-[15px] max-[600px]:pr-0',
  "max-[600px]:pb-[15px] max-[600px]:pl-0 [[class~='group/toolbox']_&]:flex",
  "[[class~='group/toolbox']_&]:w-auto [[class~='group/toolbox']_&]:pt-3",
  "[[class~='group/toolbox']_&]:pr-0 [[class~='group/toolbox']_&]:pb-3",
  "[[class~='group/toolbox']_&]:pl-0 [[class~='group/toolbox']_&]:gap-2.5",
  "[[class~='group/toolbox']_&_strong]:text-body [[class~='group/toolbox']_&_strong]:font-medium",
  "[[class~='group/toolbox']_&_p]:text-body [[class~='group/toolbox']_&_p]:leading-[1.65]",
);

export const toolPermissionStyles = 'block text-muted-ink mt-[var(--space-1)] text-caption';

export const asideNoteStyles = cn(
  'text-[length:12px] text-muted-ink pt-5 mt-5.5 border-t [border-top-style:solid] border-t-[color:var(--line)] leading-[1.7]',
  "flex items-start gap-3 [[class~='group/toolbox']_&]:text-[length:11px]",
  "[[class~='group/toolbox']_&]:leading-[1.7] [[class~='group/toolbox']_&]:pt-4",
  "[[class~='group/toolbox']_&]:mt-0 [&_>_svg]:[flex:0_0_18px] [&_>_svg]:mt-[3px]",
  "[[class~='group/connect-layout--guest']_&]:[grid-column:1_/_-1]",
);

export const hubShareTriggerStyles = cn(
  "[[class~='group/app-header']_&]:text-brand [[class~='group/app-header']_&]:bg-brand-soft",
  "[[class~='group/app-header']_&]:border-t-[color:color-mix(in_srgb,_var(--brand)_20%,_var(--line))]",
  "[[class~='group/app-header']_&]:border-r-[color:color-mix(in_srgb,_var(--brand)_20%,_var(--line))]",
  "[[class~='group/app-header']_&]:border-b-[color:color-mix(in_srgb,_var(--brand)_20%,_var(--line))]",
  "[[class~='group/app-header']_&]:border-l-[color:color-mix(in_srgb,_var(--brand)_20%,_var(--line))]",
  "[[class~='group/app-header']_&]:whitespace-nowrap",
  "max-[1000px]:[[class~='group/app-header']_&_>_span]:hidden",
  "max-[1000px]:[[class~='group/app-header']_[class~='group/header-actions']_>_&]:w-9.5",
  "max-[1000px]:[[class~='group/app-header']_[class~='group/header-actions']_>_&]:pt-0",
  "max-[1000px]:[[class~='group/app-header']_[class~='group/header-actions']_>_&]:pr-0",
  "max-[1000px]:[[class~='group/app-header']_[class~='group/header-actions']_>_&]:pb-0",
  "max-[1000px]:[[class~='group/app-header']_[class~='group/header-actions']_>_&]:pl-0",
);

export const hubShareSceneStyles = cn(
  'relative pt-32.5 pr-5.5 pb-3 pl-5.5 [perspective:1200px] max-[480px]:pt-25 max-[480px]:pr-2',
  'max-[480px]:pb-2 max-[480px]:pl-2 [@media_(max-height:_800px)_and_(min-width:_481px)]:pt-[75px]',
);

export const hubShareCloseStyles = cn(
  'absolute top-21 right-5 z-[5] w-8.5 h-8.5 text-muted-ink border border-solid border-[color:var(--line)]',
  'rounded-[50%] bg-paper [&:not(:disabled):hover]:bg-brand-soft [&:not(:disabled):hover]:text-brand',
  'max-[480px]:right-2 max-[480px]:top-[47px]',
  '[@media_(max-height:_800px)_and_(min-width:_481px)]:top-8',
);

export const hubSharePassStyles = 'relative [transform-origin:50%_0]';

export const hubPassLanyardStyles =
  'absolute top-0 right-0 bottom-auto left-0 h-px pointer-events-none z-[3]';

export const hubPassRibbonStyles = cn(
  'absolute bottom-2.5 left-[calc(50%_-_23px)] w-11.5 h-29 overflow-hidden',
  'border border-solid border-[color:color-mix(in_srgb,_var(--highlight)_30%,_transparent)] [border-inline:3px_double_color-mix(in_srgb,_var(--highlight)_30%,_transparent)]',
  'rounded-[3px_3px_9px_9px] [transform-origin:50%_100%]',
  '[box-shadow:inset_3px_0_5px_color-mix(in_srgb,_var(--highlight)_20%,_transparent),_0_4px_10px_color-mix(in_srgb,_var(--shadow-ink)_10%,_transparent)]',
  '[background-blend-mode:soft-light,_normal] [mask-image:linear-gradient(transparent_0,_var(--mask-solid)_45%)]',
  '[&_>_span]:absolute [&_>_span]:top-1.5 [&_>_span]:left-2.5 [&_>_span]:[writing-mode:vertical-rl]',
  '[&_>_span]:whitespace-nowrap [&_>_span]:text-[length:12px] [&_>_span]:[font-weight:800]',
  '[&_>_span]:tracking-[1.3px] max-[480px]:h-22',
  '[@media_(max-height:_800px)_and_(min-width:_481px)]:h-[65px]',
);

export const hubPassRibbonTealStyles = cn(
  '[transform:rotate(-23deg)] text-on-brand',
  '[background-image:repeating-linear-gradient(0deg,_transparent_0_2px,_color-mix(in_srgb,_var(--highlight)_25%,_transparent)_2px_3px),_linear-gradient(90deg,_var(--brand-hover),_var(--brand)_45%,_var(--brand-hover))]',
);

export const hubPassRibbonMistStyles = cn(
  '[transform:rotate(23deg)] text-brand',
  '[background-image:repeating-linear-gradient(0deg,_transparent_0_2px,_color-mix(in_srgb,_var(--highlight)_35%,_transparent)_2px_3px),_linear-gradient(90deg,_var(--line),_var(--brand-soft)_45%,_var(--line))]',
);

export const hubPassRingStyles = cn(
  'absolute top-[-26px] left-[calc(50%_-_40px)] w-20 h-7 border-4 border-solid border-[color:var(--muted-ink)]',
  'border-t-[color:var(--line)] border-b-[color:var(--muted-ink)] rounded-[9px]',
  '[box-shadow:0_2px_4px_color-mix(in_srgb,_var(--shadow-ink)_12%,_transparent),_inset_0_1px_2px_color-mix(in_srgb,_var(--shadow-ink)_12%,_transparent)]',
);

export const hubPassClaspStyles = cn(
  'absolute top-[-38px] left-[calc(50%_-_17px)] w-8.5 h-[59px] border border-solid border-[color:var(--line)]',
  'rounded-[7px_7px_5px_5px]',
  '[background:linear-gradient(_100deg,_var(--line),_var(--paper)_16%,_var(--line)_50%,_var(--paper)_85%,_var(--muted-ink)_)]',
  '[box-shadow:inset_0_1px_1px_color-mix(in_srgb,_var(--highlight)_45%,_transparent),_0_2px_5px_color-mix(in_srgb,_var(--shadow-ink)_16%,_transparent)] [&_i]:absolute',
  '[&_i]:bottom-2 [&_i]:left-2 [&_i]:w-4 [&_i]:h-4 [&_i]:border [&_i]:border-solid [&_i]:border-[color:var(--line)]',
  '[&_i]:rounded-[50%]',
  '[&_i]:[background:linear-gradient(130deg,_var(--paper),_var(--line)_55%,_var(--paper))]',
  '[&_i]:[box-shadow:0_1px_2px_color-mix(in_srgb,_var(--shadow-ink)_12%,_transparent)]',
);

export const hubShareCardStyles = cn(
  'group/hub-share-card relative [isolation:isolate] pt-6.5 pr-5 pb-4 pl-5',
  'border-2 border-solid border-transparent rounded-[28px] text-ink',
  '[background:linear-gradient(var(--paper),_var(--paper))_padding-box,_linear-gradient(_130deg,_var(--paper),_var(--line)_25%,_var(--paper)_48%,_var(--line)_80%,_var(--paper)_)_border-box]',
  '[box-shadow:inset_0_0_0_1px_var(--line),_var(--shadow-floating)] [&_h2]:mt-0 [&_h2]:mr-0',
  '[&_h2]:mb-0 [&_h2]:ml-0 [&_h2]:text-[length:33px] [&_h2]:font-semibold',
  '[&_h2]:leading-[1.3] [&_h2]:tracking-[-0.8px] [&_h2_span]:text-muted-ink max-[480px]:px-4',
  'max-[480px]:rounded-[23px]',
  '[@media_(max-height:_800px)_and_(min-width:_481px)]:[&_h2]:text-[length:29px]',
  "[&_[class~='group/copy-invitation']]:justify-center [&_[class~='group/copy-invitation']]:w-full",
  "[&_[class~='group/copy-invitation']]:min-h-11 [&_[class~='group/copy-invitation']]:mt-[13px]",
  "[&_[class~='group/copy-invitation']]:rounded-[10px]",
  "[&_[class~='group/copy-invitation']]:[box-shadow:var(--shadow)]",
);

export const hubPassSlotStyles = cn(
  'absolute top-2.5 left-[calc(50%_-_28px)] w-14 h-[9px] border border-solid border-[color:var(--line)]',
  'rounded-[8px] bg-muted-ink [box-shadow:inset_0_1px_2px_color-mix(in_srgb,_var(--shadow-ink)_15%,_transparent),_0_1px_0_var(--paper)]',
);

export const hubPassHeadingStyles = cn(
  'flex items-center justify-between gap-1.5 mt-1.5 mr-0 mb-[13px] ml-0 text-[length:9px]',
  '[font-weight:650] tracking-[1px] [&_>_span]:flex [&_>_span]:items-center',
  '[&_>_span]:justify-between [&_>_span]:gap-1.5 [&_>_span:last-child]:text-muted-ink',
  '[&_>_span:last-child]:text-[length:9px] [&_>_span:last-child]:font-normal',
  '[&_>_span:last-child]:tracking-normal max-[480px]:tracking-[0.4px]',
);

export const hubPassStatusStyles =
  'w-[5px] h-[5px] rounded-[50%] bg-brand [box-shadow:0_0_0_3px_var(--brand-soft)]';

export const hubShareArtStyles = cn(
  'relative [isolation:isolate] grid [place-items:center] h-[183px] overflow-hidden',
  'border border-solid border-[color:var(--line)] rounded-[16px] text-brand',
  '[background:radial-gradient(ellipse_at_48%_60%,_var(--hero-wash),_transparent_70%),_linear-gradient(140deg,_var(--page),_var(--brand-soft))]',
  '[box-shadow:inset_0_1px_0_color-mix(in_srgb,_var(--paper)_70%,_transparent)] max-[480px]:h-39.5',
  '[@media_(max-height:_800px)_and_(min-width:_481px)]:h-[145px]',
);

export const hubArtGridStyles = cn(
  'absolute top-0 right-0 bottom-0 left-0 opacity-[0.18]',
  '[background-image:linear-gradient(var(--brand)_1px,_transparent_1px),_linear-gradient(90deg,_var(--brand)_1px,_transparent_1px)]',
  '[background-size:24px_24px] [mask-image:linear-gradient(transparent,_var(--mask-solid))]',
);

export const hubArtWordmarkStyles = cn(
  'absolute top-[-37px] left-4.5 text-[color-mix(in_srgb,_var(--brand)_7%,_transparent)]',
  'text-[length:151px] [font-weight:900] leading-[1.5] tracking-[-12px]',
);

export const hubArtOrbitStyles = cn(
  'absolute w-70 h-19.5 border border-solid border-[color:color-mix(in_srgb,_var(--brand)_20%,_transparent)]',
  'rounded-[50%]',
);

export const hubArtOrbitOneStyles = '[transform:rotate(-24deg)]';

export const hubArtOrbitTwoStyles = cn(
  'w-57.5 h-25 [border-top-style:dashed] [border-right-style:dashed] [border-bottom-style:dashed]',
  '[border-left-style:dashed] opacity-[0.5] [transform:rotate(24deg)]',
);

export const hubArtTileStyles = cn(
  'absolute flex flex-col items-center justify-center gap-[5px] w-[61px] h-17',
  'border border-solid border-[color:var(--hero-tile-border)] rounded-[14px]',
  '[box-shadow:inset_0_1px_1px_color-mix(in_srgb,_var(--paper)_80%,_transparent),_1px_2px_0_var(--line),_var(--shadow)]',
  '[&_small]:text-[length:9px] [&_small]:font-bold [&_small]:tracking-[2px]',
);

export const hubArtTileSkillStyles = cn(
  'left-[12%] top-[39px] text-brand',
  '[background:linear-gradient(135deg,_var(--paper),_var(--brand-soft))] [transform:rotate(-20deg)]',
  'max-[480px]:left-[5%]',
);

export const hubArtCoreStyles = cn(
  '[--glyph-off:var(--hero-glyph-off)] relative grid [place-items:center] w-28 h-28 mb-1.5',
  'border border-solid border-[color:var(--hero-tile-border)] rounded-[25px]',
  '[background:linear-gradient(135deg,_var(--hero-tile-start),_var(--brand-soft))]',
  '[box-shadow:inset_0_1px_1px_color-mix(in_srgb,_var(--paper)_80%,_transparent),_2px_3px_0_var(--line),_var(--hero-tile-shadow)]',
  "[transform:rotate(-12deg)] [animation:hub-pass-hover_6s_ease-in-out_infinite] after:[content:'']",
  'after:absolute after:top-0 after:right-0 after:bottom-0 after:left-0 after:rounded-[inherit]',
  'after:[background:linear-gradient(_115deg,_transparent_30%,_color-mix(in_srgb,_var(--highlight)_22%,_transparent)_47%,_transparent_65%_)]',
  'after:[background-size:300%_100%] after:[animation:hub-pass-sheen_7s_ease-in-out_infinite]',
  'after:pointer-events-none max-[480px]:w-24.5 max-[480px]:h-24.5 motion-reduce:[animation:none]',
  'motion-reduce:after:[animation:none]',
);

export const hubArtTileMcpStyles = cn(
  'right-[10%] bottom-[31px] text-warning',
  '[background:linear-gradient(135deg,_var(--paper),_var(--warning-soft))] [transform:rotate(17deg)]',
  'max-[480px]:right-[5%]',
);

export const hubArtStarStyles = 'absolute top-[23px] right-[23%] text-warning';

export const hubArtCaptionStyles = cn(
  'absolute top-auto right-3.5 bottom-3 left-3.5 flex justify-between font-mono text-[length:9px]',
  'tracking-[1px] text-muted-ink',
);

export const hubShareIntroStyles = cn(
  'relative pt-5 pr-0.5 pb-[15px] pl-0.5',
  '[@media_(max-height:_800px)_and_(min-width:_481px)]:py-[14px_12px]',
);

export const hubShareEyebrowStyles =
  'mt-0 mr-0 mb-[7px] ml-0 text-muted-ink font-mono text-[length:9px] tracking-[1.4px]';

export const hubShareDescriptionStyles = cn(
  'mt-2.5 mr-0 mb-0 ml-0 text-muted-ink text-[length:12px] leading-[1.7]',
  '[@media_(max-height:_800px)_and_(min-width:_481px)]:mt-[7px]',
);

export const hubPassPerforationStyles = cn(
  'relative flex items-center gap-2.5 mt-0 mr-[-20px] mb-4 ml-[-20px] pt-0 pr-5 pb-0 pl-5',
  'text-muted-ink [&_>_span]:flex-1 [&_>_span]:border-t [&_>_span]:[border-top-style:dashed] [&_>_span]:border-t-[color:var(--line)]',
  "before:[content:''] before:absolute before:top-0 before:w-[7px] before:h-[13px] before:bg-line",
  'before:[box-shadow:inset_0_1px_1px_color-mix(in_srgb,_var(--shadow-ink)_6%,_transparent)] before:left-[-1px]',
  "before:rounded-[0_8px_8px_0] after:[content:''] after:absolute after:top-0 after:w-[7px]",
  'after:h-[13px] after:bg-line after:[box-shadow:inset_0_1px_1px_color-mix(in_srgb,_var(--shadow-ink)_6%,_transparent)]',
  'after:right-[-1px] after:rounded-[8px_0_0_8px] max-[480px]:mx-[-16px] max-[480px]:px-4',
);

export const hubShareLoadingStyles = 'pt-6 pr-6 pb-6 pl-6 text-center text-muted-ink';

export const hubSharePromptStyles = cn(
  'pt-[13px] pr-3.5 pb-[13px] pl-3.5 border border-solid border-[color:var(--line)] rounded-[10px]',
  '[background:color-mix(in_srgb,_var(--line)_18%,_transparent)] [&_p]:mt-2 [&_p]:mr-0 [&_p]:mb-0',
  '[&_p]:ml-0 [&_p]:text-[length:12px] [&_p]:leading-[1.8] [&_p]:whitespace-pre-wrap',
  '[&_p]:[overflow-wrap:anywhere] [&_p]:[user-select:text]',
);

export const hubSharePromptLabelStyles = cn(
  'flex items-center justify-between gap-2 text-muted-ink text-[length:11px]',
  '[&_>_span:last-child]:font-mono [&_>_span:last-child]:text-[length:9px]',
  '[&_>_span:last-child]:tracking-[0.6px] max-[480px]:[&_>_span:last-child]:hidden',
);

export const hubShareGuideStyles = cn(
  'flex items-center justify-center gap-1 w-[fit-content] mt-3.5 mr-auto mb-0 ml-auto text-muted-ink',
  'text-[length:11px] hover:text-ink',
);

export const hubPassFooterStyles =
  'flex items-center justify-between gap-3 mt-4 pt-[13px] border-t [border-top-style:solid] border-t-[color:var(--line)]';

export const hubPassBrandStyles = cn(
  'flex items-center gap-2 text-[length:11px] font-semibold [&_small]:block [&_small]:mt-0.5',
  '[&_small]:text-muted-ink [&_small]:text-[length:9px] [&_small]:font-normal',
  '[&_small]:tracking-[1px]',
);

export const hubPassStampStyles = cn(
  'pt-1 pr-[7px] pb-1 pl-[7px] border border-solid border-[color:var(--line)] rounded-[3px] text-muted-ink font-mono',
  'text-[length:7px] leading-[1.5] tracking-[1px] [transform:rotate(-7deg)]',
);

export const hubShareFooterStyles = cn(
  'mt-4 mr-0 mb-0 ml-0 text-center text-on-backdrop text-[length:11px] tracking-[0.5px]',
  '[text-shadow:0_1px_3px_color-mix(in_srgb,_var(--shadow-ink)_25%,_transparent)]',
);
