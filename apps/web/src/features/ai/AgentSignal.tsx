import { cn } from '../../shared/styles/cn.js';
import type { Glyph } from './agent-brief.js';

/** 状态卡的整体信号；`working` 时点阵图形由当前动作的 {@link Glyph} 决定。 */
export type BriefSignal = 'working' | 'waiting' | 'complete' | 'caution' | 'error' | 'idle';

const signals: Record<Glyph | Exclude<BriefSignal, 'working'>, string[]> = {
  work: ['00100', '01101', '11111', '11111', '11111'],
  read: ['11111', '00000', '11110', '00000', '11100'],
  search: ['01100', '10010', '10010', '01100', '00011'],
  browse: ['11000', '11111', '10001', '10001', '11111'],
  think: ['00100', '01010', '10101', '01010', '00100'],
  report: ['11111', '10001', '11111', '10001', '11111'],
  waiting: ['01010', '01010', '01010', '01010', '01010'],
  complete: ['00000', '00001', '00010', '10100', '01000'],
  caution: ['00100', '00100', '00100', '00000', '00100'],
  error: ['10001', '01010', '00100', '01010', '10001'],
  idle: ['00000', '00000', '10101', '00000', '00000'],
};

/**
 * 点阵球：5×5 点阵居中，运行时图形随动作变化并做对角波动、外圈旋转，`pulse` 每变化一次闪一下；
 * 等待人工时外圈扩散光晕；其余状态切换时逐点浮现。颜色继承自 `currentColor`。
 */
export function AgentSignal({
  signal,
  glyph = 'work',
  risk,
  pulse,
  large = false,
}: {
  signal: BriefSignal;
  glyph?: Glyph;
  risk?: string;
  /** 最近一条活动事件的序号，变化即触发一次闪动。 */
  pulse?: number;
  large?: boolean;
}) {
  const live = signal === 'working';
  const pattern = live ? glyph : signal;
  return (
    <span className="relative block rounded-full">
      {signal === 'waiting' && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-2 border-current motion-safe:animate-[agent-halo_1.8s_var(--ease-out)_infinite]"
        />
      )}
      {live && pulse !== undefined && (
        <span
          key={pulse}
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-current opacity-0 motion-safe:animate-[agent-blip_.7s_var(--ease-out)]"
        />
      )}
      <span
        className={cn(
          'relative grid shrink-0 place-items-center rounded-full ring-1 ring-inset',
          large ? 'size-14' : 'size-11',
          {
            working: 'bg-brand-soft ring-brand/20',
            caution:
              risk === 'high' ? 'bg-danger-soft ring-danger/20' : 'bg-warning-soft ring-warning/20',
            complete: 'bg-success-soft ring-success/20',
            waiting: 'bg-warning-soft ring-warning/20',
            error: 'bg-danger-soft ring-danger/20',
            idle: 'bg-page ring-separator',
          }[signal],
        )}
      >
        {live && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border-2 border-transparent border-t-current opacity-70 motion-safe:animate-[spin_1.8s_linear_infinite]"
          />
        )}
        <span
          key={pattern}
          aria-hidden="true"
          className={cn('relative grid grid-cols-5', large ? 'gap-[3px]' : 'gap-[2px]')}
        >
          {signals[pattern].flatMap((row, y) =>
            [...row].map((dot, x) => (
              <span
                key={y * 5 + x}
                className={cn(
                  'rounded-full bg-current',
                  large ? 'size-1' : 'size-[3px]',
                  dot === '0' && 'opacity-15',
                  live
                    ? dot === '1' && 'motion-safe:animate-[agent-signal_1.4s_ease-in-out_infinite]'
                    : 'motion-safe:animate-[agent-dot-in_.32s_var(--ease-out)_both]',
                )}
                style={{
                  animationDelay: live ? `${x * 145 - y * 95}ms` : `${(x + y) * 28}ms`,
                }}
              />
            )),
          )}
        </span>
      </span>
    </span>
  );
}
