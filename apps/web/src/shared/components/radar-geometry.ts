/** 分数使用百分制，缺分时可提供单独的轴状态文字。 */
export interface RadarAxis {
  label: string;
  score: number | null;
  confidence?: 'low' | 'medium' | 'high' | null;
  statusLabel?: string;
}

/** 紧凑尺寸只留外圈和本系列，不叠加对比系列。 */
export type RadarSize = 'full' | 'glyph';

/** 缺分轴仍占据角度，闭合边是否跨过缺口由原轴序号决定。 */
export function radarGeometry(
  axes: readonly RadarAxis[],
  size: RadarSize = 'full',
  baseline?: readonly (number | null)[],
) {
  const glyph = size === 'glyph';
  const center = glyph ? { x: 10, y: 10 } : { x: 180, y: 150 };
  const radius = glyph ? 8.5 : 96;
  const directions = axes.map((_, index) => {
    const angle = (2 * Math.PI * index) / axes.length - Math.PI / 2;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  });
  const point = (index: number, distance: number) => ({
    x: center.x + distance * directions[index].x,
    y: center.y + distance * directions[index].y,
  });
  const validScore = (score: number | null) =>
    score !== null && score >= 0 && score <= 100 ? score : null;
  const verticesFor = (scores: readonly (number | null)[]) =>
    scores.flatMap((score, index) =>
      score === null ? [] : [{ index, ...point(index, (radius * score) / 100) }],
    );
  const scores = axes.map((axis) => validScore(axis.score));
  const vertices = verticesFor(scores);
  if (vertices.length < 3) return null;

  const rings = (glyph ? [1] : [0.25, 0.5, 0.75, 1]).map((scale) =>
    directions.map((_, index) => point(index, radius * scale)),
  );
  const spokes = directions.map((direction, index) => {
    const label = point(index, radius + 16);
    label.y += direction.y < -0.5 ? -9 : direction.y > 0.5 ? 8 : -2;
    const anchor = Math.abs(direction.x) < 0.2 ? 'middle' : direction.x < 0 ? 'end' : 'start';
    return { tip: point(index, radius), label, anchor, score: scores[index] } as const;
  });
  const edges = vertices.map((from, index) => {
    const to = vertices[(index + 1) % vertices.length];
    return { from, to, acrossGap: (from.index + 1) % axes.length !== to.index };
  });
  const comparison =
    !glyph && baseline?.length === axes.length ? verticesFor(baseline.map(validScore)) : [];
  return {
    center,
    rings,
    spokes,
    vertices,
    edges,
    complete: vertices.length === axes.length,
    comparison: comparison.length >= 3 ? comparison : [],
  };
}
