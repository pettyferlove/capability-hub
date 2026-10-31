/** 只接收文本字段，拒绝文件和重复字段；返回值不得写入日志。 */
export function formFields(form: HTMLFormElement): Record<string, string> {
  const entries: [string, string][] = [];
  const names = new Set<string>();
  for (const [name, value] of new FormData(form)) {
    if (typeof value !== 'string') throw new Error('表单包含不支持的文件字段');
    if (names.has(name)) throw new Error('表单包含重复字段');
    names.add(name);
    entries.push([name, value]);
  }
  return Object.fromEntries(entries);
}
