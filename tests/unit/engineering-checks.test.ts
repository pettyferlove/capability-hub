import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { checkArchitecture } from '../../scripts/checks/check-architecture.js';
import { checkDocumentation } from '../../scripts/checks/lib/documentation.js';

async function put(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

test('文档检查忽略代码示例，检查参考链接与编码错误并限制仓库边界', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-doc-check-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await put(
    root,
    'README.md',
    '`[sample](absent.md)`\n```md\n[a](absent.md)\n```\n[valid](documents/a.md?raw=1#title)\n[web](//example.test/a)\n[reference][doc]\n[doc]: <documents/有 空格.md>',
  );
  await put(root, 'AGENTS.md', '# Instructions');
  await put(root, 'documents/a.md', '# Title');
  await put(root, 'documents/有 空格.md', '# Title');
  assert.deepEqual(checkDocumentation(root).failures, []);
  await put(
    root,
    'documents/b.md',
    '[broken][id]\n\n[id]: nowhere.md\n\n[bad](%ZZ)\n[escape](../../outside.md)',
  );
  const result = checkDocumentation(root);
  assert.equal(result.failures.length, 3);
  assert.match(result.failures.join('\n'), /b.md:3: 无效文档链接/);
  assert.match(result.failures.join('\n'), /b.md:5: 无效链接编码/);
  assert.match(result.failures.join('\n'), /b.md:6: 文档链接超出仓库范围/);
});

test('架构检查识别无扩展名运行时循环，纯类型重导出不造成伪循环', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-architecture-check-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'packages'));
  await put(root, 'apps/web/package.json', JSON.stringify({ name: '@capability-hub/web' }));
  await put(
    root,
    'apps/web/tsconfig.json',
    JSON.stringify({ compilerOptions: { moduleResolution: 'bundler', module: 'esnext' } }),
  );
  await put(root, 'apps/web/src/a.ts', "export { value } from './b';\nexport interface Shape {}\n");
  await put(
    root,
    'apps/web/src/b.ts',
    "export { type Shape } from './a';\nexport const value = 1;\n",
  );
  assert.deepEqual(checkArchitecture(root).failures, []);
  await put(root, 'apps/web/src/b.ts', "export { value } from './a';\n");
  assert.match(checkArchitecture(root).failures.join('\n'), /源码运行时循环/);
});

test('架构检查不把 .. 前缀的包内目录判为越界，require 和无插值动态导入不能绕过依赖规则', async (context) => {
  const root = await mkdtemp(join(tmpdir(), 'hub-architecture-import-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'packages'));
  await put(root, 'apps/web/package.json', JSON.stringify({ name: '@capability-hub/web' }));
  await put(root, 'apps/web/a.ts', "import './..fixtures/b.js';\n");
  await put(root, 'apps/web/..fixtures/b.ts', 'export {};');
  assert.deepEqual(checkArchitecture(root).failures, []);
  await put(
    root,
    'apps/web/a.ts',
    "const a = require('node:fs');\nconst b = import(`node:net`);\n",
  );
  const failures = checkArchitecture(root).failures;
  assert.equal(failures.length, 2);
  assert.equal(
    failures.every((failure) => failure.includes('浏览器入口不能引用 Node')),
    true,
  );
});

test('数据库检查发现缺失或未登记的 SQL，并识别文件数量相同的内容变化', async (context) => {
  const { migrationFiles, validateMigrationJournal } =
    await import('../../scripts/checks/lib/migration-files.js');
  const root = await mkdtemp(join(tmpdir(), 'hub-migration-check-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  await put(
    root,
    'meta/_journal.json',
    JSON.stringify({ entries: [{ idx: 0, tag: '0000_init' }] }),
  );
  await put(root, 'meta/0000_snapshot.json', '{}');
  await assert.rejects(validateMigrationJournal(root), /迁移文件缺失/);
  await put(root, '0000_init.sql', 'CREATE TABLE a (id integer);');
  await validateMigrationJournal(root);
  const before = await migrationFiles(root);
  await put(root, 'meta/0000_snapshot.json', '{"changed":true}');
  assert.notDeepEqual(await migrationFiles(root), before);
  await put(root, '0001_extra.sql', 'SELECT 1;');
  await assert.rejects(validateMigrationJournal(root), /未登记/);
});

test('颜色检查按 TS/CSS 语法定位，不误报注释、普通文本、URL 锚点或格式变化', async () => {
  const { fixedColorLines, readThemePalettes } =
    await import('../../scripts/checks/lib/style-policy.js');
  assert.deepEqual(
    fixedColorLines(
      'Page.tsx',
      '// text-red-500\nconst message = "#abcdef";\nconst a = <a href="#abcdef">text-red-500</a>;',
    ),
    [],
  );
  assert.deepEqual(
    fixedColorLines(
      'Page.tsx',
      'const a = <div className="text-red-500" />;\nconst b = <div style={{color: "#fff"}} />;',
    ),
    [1, 2],
  );
  assert.deepEqual(fixedColorLines('styles.ts', 'export const badge = "text-red-500";'), [1]);
  assert.deepEqual(
    fixedColorLines(
      'base.css',
      '/* #abc */\na { content: "#abc"; filter: url(#abc); color: var(--ink); }',
    ),
    [],
  );
  assert.deepEqual(fixedColorLines('base.css', 'a {color:#fff}'), [1]);
  const palettes = readThemePalettes('[data-palette="blue"]{--ink:#FFF; color-scheme:dark;}');
  assert.equal(palettes[0].name, 'blue');
  assert.equal(palettes[0].mode, 'dark');
  assert.equal(palettes[0].colors.get('ink'), '#FFFFFF');
});
