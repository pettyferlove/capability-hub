export function skillDocument(name = 'sample-skill', body = '使用项目现有的命名与模块边界。') {
  return Buffer.from(
    `---\nname: ${name}\ndescription: 团队工程实践\n---\n\n# 工程实践\n\n${body}\n`,
  );
}
