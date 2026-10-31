import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { localReference, markdownReferences } from '@capability-hub/infrastructure/content';

export function checkDocumentation(root: string) {
  const files = ['README.md', 'AGENTS.md', ...globSync('documents/**/*.md', { cwd: root })];
  const failures: string[] = [];
  for (const file of files) {
    if (!existsSync(resolve(root, file))) {
      failures.push(`${file}: 文档入口不存在`);
      continue;
    }
    for (const reference of markdownReferences(readFileSync(resolve(root, file), 'utf8'))) {
      const location = `${file}:${reference.line}`;
      let target: string | null;
      try {
        target = localReference(reference.url);
      } catch {
        failures.push(`${location}: 无效链接编码`);
        continue;
      }
      if (target === null || target === '') continue;
      const absolute = resolve(root, dirname(file), target);
      const fromRoot = relative(root, absolute);
      if (
        isAbsolute(target) ||
        target.includes('\\') ||
        fromRoot === '..' ||
        fromRoot.startsWith('../')
      )
        failures.push(`${location}: 文档链接超出仓库范围 ${reference.url}`);
      else if (!existsSync(absolute)) failures.push(`${location}: 无效文档链接 ${reference.url}`);
    }
  }
  return { files: files.length, failures };
}
