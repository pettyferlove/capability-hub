const generatedGitVersionPattern =
  /^git\.([a-f0-9]{40}|[a-f0-9]{64})\.s([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.r([1-9]\d*)$/;

/** 自动 Git 标签只按完整生成格式识别，用户版本号不参与缩写。 */
export function isGeneratedGitVersion(value: string) {
  return generatedGitVersionPattern.test(value);
}

/** 缩写仅用于展示；选择版本时保留来源片段，提交仍使用完整标识。 */
export function shortVersion(value: string, includeSource = false) {
  const match = generatedGitVersionPattern.exec(value);
  if (!match) return value;
  return `Git ${match[1].slice(0, 8)}${includeSource ? ` · s${match[2].slice(0, 8)}` : ''} · r${match[3]}`;
}
