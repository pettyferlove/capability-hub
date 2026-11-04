import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hubClientSkillName } from '@capability-hub/contracts';
import type { ContentFile } from '@capability-hub/domain/content';

/** 从仓库原件读取预期交付文件，不使用服务端打包结果作为测试基线。 */
export async function hubClientSkillFiles(): Promise<ContentFile[]> {
  const root = fileURLToPath(new URL(`../../skills/${hubClientSkillName}/`, import.meta.url));
  const files: ContentFile[] = [];
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.push({
      path: relative(root, path).split(sep).join('/'),
      bytes: await readFile(path),
      executable: false,
    });
  }
  return files;
}

/** 生成带合法 frontmatter 的 SKILL.md 字节，默认正文覆盖"使用项目现有约定"这一提示。 */
export function skillDocument(name = 'sample-skill', body = '使用项目现有的命名与模块边界。') {
  return Buffer.from(
    `---\nname: ${name}\ndescription: 团队工程实践\n---\n\n# 工程实践\n\n${body}\n`,
  );
}
