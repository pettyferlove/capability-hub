import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  logoLoopFocusShift,
  logoLoopLayout,
} from '../../apps/web/src/shared/components/react-bits/logo-loop-layout.js';

test('可见链接获得焦点时留在原位，只有被裁切的链接才向最近的边缘移动', () => {
  const viewport = 320;
  for (const [left, width, expectedLeft] of [
    [126, 80, 126],
    [240, 80, 240],
    [-15, 80, 4],
    [280, 80, 236],
    [-80, 410, 0],
  ]) {
    assert.equal(left - logoLoopFocusShift(left, width, viewport), expectedLeft);
  }
});

test('横条刚好放得下时不滚动；溢出时不同宽度的链接只在两端都不可见时换边', () => {
  const widths = [120, 45, 95];
  const gap = 20;
  assert.equal(logoLoopLayout(widths, 300, gap), null);
  for (const viewport of [295, 140]) {
    const loop = logoLoopLayout(widths, viewport, gap);
    assert(loop);
    let left = 0;
    for (const [index, width] of widths.entries()) {
      const reentryLeft: number = left + loop.starts[index];
      const exitRight: number = reentryLeft - loop.period + width;
      assert(reentryLeft >= viewport, `第 ${index + 1} 项不应在可见范围内突然出现`);
      assert.equal(exitRight, 0);
      left += width + loop.spacing;
    }
    assert.equal(left, loop.period, '首尾两项之间的间距也须与行内一致');
  }
});
