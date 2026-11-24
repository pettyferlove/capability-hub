import { radarGeometry, type RadarAxis, type RadarSize } from './radar-geometry.js';

export { radarGeometry };

interface RadarChartProps {
  axes: readonly RadarAxis[];
  baseline?: readonly (number | null)[];
  size?: RadarSize;
}

function polygonPoints(points: readonly { x: number; y: number }[]) {
  return points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

/** 图形只作视觉呈现，可访问名称与数据由调用方的图注和清单承载。 */
export function RadarChart({ axes, baseline, size = 'full' }: RadarChartProps) {
  const chart = radarGeometry(axes, size, baseline);
  if (!chart) return null;
  const glyph = size === 'glyph';
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
            <line key={index} x1={chart.center.x} y1={chart.center.y} x2={tip.x} y2={tip.y} />
          ))}
      </g>
      {chart.complete ? (
        <polygon
          points={polygonPoints(chart.vertices)}
          className="fill-brand-veil stroke-brand"
          strokeWidth={glyph ? 1.25 : 2}
        />
      ) : (
        <g className="stroke-brand" strokeWidth={glyph ? 1.25 : 2}>
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
      )}
      {chart.comparison.length > 0 && (
        <polygon
          points={polygonPoints(chart.comparison)}
          className="fill-none stroke-muted-ink"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}
      {!glyph &&
        chart.vertices.map(({ index, x, y }) => (
          <circle
            key={index}
            cx={x}
            cy={y}
            r={3.5}
            strokeWidth={1.5}
            className={axes[index].confidence === 'low' ? 'fill-paper stroke-brand' : 'fill-brand'}
          />
        ))}
      {!glyph &&
        chart.spokes.map(({ label, anchor, score }, index) => (
          <text key={index} x={label.x} y={label.y} textAnchor={anchor}>
            <tspan className="fill-ink" fontSize={13}>
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
