import { resolve } from 'node:path';
import { checkDocumentation } from './lib/documentation.ts';

const result = checkDocumentation(resolve(import.meta.dirname, '../..'));
if (result.failures.length) {
  process.stderr.write(result.failures.join('\n') + '\n');
  process.exitCode = 1;
} else process.stdout.write(`文档链接检查通过：${result.files} 个入口与章节。\n`);
