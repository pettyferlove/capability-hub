import { cn } from '../../shared/styles/cn.js';

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
