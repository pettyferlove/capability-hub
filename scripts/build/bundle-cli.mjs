import { resolve } from 'node:path';
import { build } from 'esbuild';

await build({
  absWorkingDir: resolve(import.meta.dirname, '../..'),
  entryPoints: ['apps/cli/src/main.ts'],
  outfile: 'apps/cli/dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  conditions: ['development'],
  mainFields: ['module', 'main'],
  minify: true,
  // ZIP 和文件锁依赖中的 CommonJS 代码仍需加载 Node 内置模块。
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
