import { cn } from '../styles/cn.js';
import { radarGeometry, type RadarAxis, type RadarSize } from './radar-geometry.js';

export { radarGeometry };

const radarRevealStyles =
  '[transform-box:view-box] motion-safe:animate-[radar-grow_560ms_var(--ease-out)_both]';
const radarPointStyles =
  'origin-center [transform-box:fill-box] motion-safe:animate-[agent-dot-in_320ms_var(--ease-out)_both]';
const radarHaloStyles =
  'pointer-events-none origin-center fill-brand/20 [transform-box:fill-box] motion-safe:animate-[agent-dot-in_200ms_var(--ease-out)_both]';
const radarFadeStyles = 'motion-safe:animate-[theme-appear_240ms_ease-out_both]';
const radarTransitionStyles =
  'transition-[fill,stroke] duration-(--duration-normal) ease-(--ease-out)';

/** 顶点与维度清单中的分数共用轴序延迟，展开后再依次落位。 */
export function radarRevealDelay(index: number) {
  return `${280 + index * 70}ms`;
}

interface RadarChartProps {
  axes: readonly RadarAxis[];
  baseline?: readonly (number | null)[];
  size?: RadarSize;
  highlight?: number | null;
}

function polygonPoints(points: readonly { x: number; y: number }[]) {
  return points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

/** 图形只作视觉呈现，可访问名称与数据由调用方的图注和清单承载。 */
export function RadarChart({ axes, baseline, size = 'full', highlight = null }: RadarChartProps) {
  const chart = radarGeometry(axes, size, baseline);
  if (!chart) return null;
  const glyph = size === 'glyph';
  const stroke = glyph ? 1.25 : 2;
  const series = chart.complete ? (
    <polygon
      points={polygonPoints(chart.vertices)}
      className="fill-brand-veil stroke-brand"
      strokeWidth={stroke}
    />
  ) : (
    <g className="stroke-brand" strokeWidth={stroke}>
      {chart.edges.map(({ from, to, acrossGap }) => (
        <line
          key={from.index}
          x1={from.x}
          y1={from.y}
          x2={to.x}
          y2={to.y}
          strokeDasharray={acrossGap ? (glyph ? '2 1' : '4 3') : undefined}
        />
      ))}
    </g>
  );
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={glyph ? '0 0 20 20' : '0 0 360 300'}
      width={glyph ? 20 : 360}
      height={glyph ? 20 : 300}
      className={glyph ? 'block size-5 shrink-0' : 'block h-auto w-full max-w-[360px]'}
      strokeLinejoin="round"
    >
      <g className="fill-none stroke-line">
        {chart.rings.map((ring, index) => (
          <polygon key={index} points={polygonPoints(ring)} />
        ))}
        {!glyph &&
          chart.spokes.map(({ tip }, index) => (
            <line
              key={index}
              x1={chart.center.x}
              y1={chart.center.y}
              x2={tip.x}
              y2={tip.y}
              className={cn(radarTransitionStyles, index === highlight && 'stroke-brand')}
            />
          ))}
      </g>
      {glyph ? (
        series
      ) : (
        // 本系列从中心展开，各轴顶点按轴序落位，与右侧维度清单的分数同节奏出现。
        <g
          className={radarRevealStyles}
          style={{ transformOrigin: `${chart.center.x}px ${chart.center.y}px` }}
        >
          {series}
          {chart.comparison.length > 0 && (
            <polygon
              points={polygonPoints(chart.comparison)}
              className={cn('fill-none stroke-muted-ink', radarFadeStyles)}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}
          {chart.vertices.map(({ index, x, y }) => (
            <g key={index}>
              {index === highlight && <circle cx={x} cy={y} r={9} className={radarHaloStyles} />}
              <circle
                cx={x}
                cy={y}
                r={3.5}
                strokeWidth={1.5}
                className={cn(
                  radarPointStyles,
                  axes[index].confidence === 'low' ? 'fill-paper stroke-brand' : 'fill-brand',
                )}
                style={{ animationDelay: radarRevealDelay(index) }}
              />
            </g>
          ))}
        </g>
      )}
      {!glyph &&
        chart.spokes.map(({ label, anchor, score }, index) => (
          <text key={index} x={label.x} y={label.y} textAnchor={anchor}>
            <tspan
              className={cn(
                radarTransitionStyles,
                index === highlight ? 'fill-brand font-semibold' : 'fill-ink',
              )}
              fontSize={13}
            >
              {axes[index].label}
            </tspan>
            <tspan x={label.x} dy={16} className="fill-muted-ink" fontSize={12}>
              {score ?? `— ${axes[index].statusLabel ?? ''}`.trimEnd()}
            </tspan>
          </text>
        ))}
    </svg>
  );
}
