import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixedColorLines, readThemePalettes } from '../../scripts/checks/lib/style-policy.js';
import { themePalettes } from '../../apps/web/src/app/appearance.js';

const theme = readFileSync(new URL('../../apps/web/src/styles/theme.css', import.meta.url), 'utf8');
const palettes = readThemePalettes(theme);

function luminance(hex: string) {
  return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const channel = parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return (
      sum + weight * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    );
  }, 0);
}

test('业务样式只引用主题颜色，避免新增深色模式遗漏的固定色值', () => {
  const source = fileURLToPath(new URL('../../apps/web/src', import.meta.url));
  function files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
    );
  }
  for (const path of files(source).filter((path) => /\.(?:tsx?|css)$/.test(path))) {
    if (path === join(source, 'styles/theme.css')) continue;
    assert.deepEqual(
      fixedColorLines(path, readFileSync(path, 'utf8')),
      [],
      `${path} 包含未集中管理的颜色`,
    );
  }
});

test('深浅主题正文、状态和按钮保持文字对比度', () => {
  assert.deepEqual(
    palettes.map((palette) => `${palette.name}/${palette.mode}`),
    themePalettes.flatMap(({ id }) => [`${id}/light`, `${id}/dark`]),
  );
  const pairs: [string, string, number][] = [
    ['ink', 'page', 4.5],
    ['ink', 'paper', 4.5],
    ['muted-ink', 'page', 4.5],
    ['muted-ink', 'paper', 4.5],
    ['brand', 'brand-soft', 4.5],
    ['brand', 'paper', 4.5],
    ['on-brand', 'brand', 4.5],
    ['on-brand', 'brand-hover', 4.5],
    ['success', 'success-soft', 4.5],
    ['warning', 'warning-soft', 4.5],
    ['danger', 'danger-soft', 4.5],
    ['info', 'info-soft', 4.5],
    ['code-fg', 'code-bg', 4.5],
    ['code-dim', 'code-bg', 4.5],
    ['code-key', 'code-bg', 4.5],
    ['code-str', 'code-bg', 4.5],
  ];
  for (const { name, mode, colors } of palettes) {
    for (const [foreground, background, minimum] of pairs) {
      const fg = colors.get(foreground),
        bg = colors.get(background);
      assert(fg && bg, `${name}/${mode} 缺少 ${foreground}/${background}`);
      const values = [luminance(fg), luminance(bg)].sort((a, b) => a - b);
      const ratio = (values[1] + 0.05) / (values[0] + 0.05);
      assert(
        ratio >= minimum,
        `${name}/${mode} ${foreground}/${background}: ${ratio.toFixed(2)} < ${minimum}`,
      );
    }
  }
});
