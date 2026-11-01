/** 生成带合法 frontmatter 的 SKILL.md 字节，默认正文覆盖"使用项目现有约定"这一提示。 */
export function skillDocument(name = 'sample-skill', body = '使用项目现有的命名与模块边界。') {
  return Buffer.from(
    `---\nname: ${name}\ndescription: 团队工程实践\n---\n\n# 工程实践\n\n${body}\n`,
  );
}
