import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { blankLineViolations } from '../../scripts/checks/lib/style-policy.js';

test('模块级 import 块、代码块与文档块之间保持一个空行，避免代码粘连', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  function files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory())
        return ['node_modules', 'dist'].includes(entry.name)
          ? []
          : files(join(directory, entry.name));
      return /\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : [];
    });
  }
  const violations = ['apps', 'packages', 'scripts', 'tests'].flatMap((directory) =>
    files(join(root, directory)).flatMap((path) =>
      blankLineViolations(path, readFileSync(path, 'utf8')).map((line) => `${path}:${line}`),
    ),
  );
  assert.deepEqual(violations, [], '以下位置缺少分隔空行');
});
