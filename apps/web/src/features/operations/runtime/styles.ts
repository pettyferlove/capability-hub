import { cn } from '../../../shared/styles/cn.js';

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
