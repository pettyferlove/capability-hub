import { cn } from '../styles/cn.js';
import type { AssetResponse } from '@capability-hub/contracts/http';
import { motion } from 'motion/react';
type Kind = AssetResponse['kind'];

/** FNV-1a 32 位字符串散列，用于稳定生成图案。 */
export function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 按行生成 25 个网格，再左右镜像。 */
export function cells(seed: string): boolean[] {
  const h = hash(seed);
  const out: boolean[] = Array.from({ length: 25 }, () => false);
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      const on = ((h >>> (r * 3 + c)) & 1) === 1;
      out[r * 5 + c] = on;
      out[r * 5 + (4 - c)] = on;
    }
  }
  if (out.filter(Boolean).length < 6) out[12] = out[6] = out[8] = out[16] = out[18] = true;
  return out;
}

export function Glyph({
  seed,
  kind,
  size = 40,
  animate = false,
  diffWith,
  className = '',
}: {
  seed: string;
  kind: Kind;
  size?: number;
  animate?: boolean;
  diffWith?: string;
  className?: string;
}) {
  const on = cells(seed);
  const other = diffWith ? cells(diffWith) : null;
  const fill = kind === 'skill' ? 'var(--glyph-skill)' : 'var(--glyph-mcp)';
  const cell = 100 / 5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-6 -6 112 112"
      role="img"
      aria-label={
        seed.startsWith('sha256:') ? `内容点阵 ${seed.slice(7, 19)}` : 'Capability Hub 品牌点阵'
      }
      className={cn('shrink-0', className)}
    >
      {on.map((v, i) => {
        const r = Math.floor(i / 5);
        const c = i % 5;
        const changed = other ? other[i] !== v : false;
        const shape = {
          x: c * cell + 2,
          y: r * cell + 2,
          width: cell - 4,
          height: cell - 4,
          rx: 5,
          fill: v ? fill : 'var(--glyph-off)',
          stroke: changed ? 'var(--danger)' : 'none',
          strokeWidth: changed ? 3 : 0,
        };
        if (!animate) return <rect key={i} {...shape} opacity={v ? 1 : 0.9} />;
        return (
          <motion.rect
            key={i}
            {...shape}
            initial={{ scale: 0.2, opacity: 0 }}
            animate={{ scale: 1, opacity: v ? 1 : 0.9 }}
            transition={{
              delay: animate ? (r + c) * 0.025 : 0,
              type: 'spring',
              stiffness: 420,
              damping: 26,
            }}
            style={{ transformOrigin: `${c * cell + cell / 2}px ${r * cell + cell / 2}px` }}
          />
        );
      })}
    </svg>
  );
}
