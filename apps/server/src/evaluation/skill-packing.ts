import { evaluationContentBudget } from '@capability-hub/domain/evaluation';
import { contentText } from '@capability-hub/domain/files';
import { fail } from '@capability-hub/domain/errors';
import type { Finding } from '@capability-hub/domain/content';
import type { EvaluationEvidence } from '@capability-hub/domain/models';
import { secretFindings } from '@capability-hub/infrastructure/content/secret-detection';
import {
  markdownReferences,
  resolveMarkdownReference,
} from '@capability-hub/infrastructure/content';
import { wireTextBytes } from './model-input.js';

const entry = 'SKILL.md';

/** 替换整行后仍保留原文件行号，覆盖受限时也能定位评测证据。 */
export const redactedLine = '［疑似凭据，原文已省略］';

/** 历史扫描的凭据和私钥命中均参与模型出站脱敏。 */
export function credentialFinding(finding: Finding) {
  return finding.rule_id.includes('SECRET') || finding.rule_id === 'PRIVATE_KEY';
}

/** 已知扫描命中和当前格式规则共同屏蔽原文。PEM 结束标记缺失时整段余文都不可发送。 */
export function redactedLines(text: string, path?: string, known?: ReadonlySet<string>) {
  const lines = text.split(/\r\n?|\n/);
  const sensitive = new Set<number>();
  let privateKey: string | undefined;
  for (const finding of secretFindings(text)) sensitive.add(finding.line);
  return lines.map((line, index) => {
    let masked = !!privateKey || sensitive.has(index + 1) || known?.has(path + ':' + (index + 1));
    for (const [, boundary, label] of line.matchAll(
      /-----(BEGIN|END) ([A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?)-----/g,
    )) {
      masked = true;
      if (boundary === 'BEGIN') privateKey = label;
      else if (privateKey === label) privateKey = undefined;
    }
    return masked ? redactedLine : line;
  });
}

/** 预算按短调用传输时的 JSON 字符串计量；只送完整行，超长行不能成为引用依据。 */
export async function packSkill(
  read: (path: string) => Promise<Buffer | undefined>,
  secretLines: ReadonlySet<string> = new Set(),
  includeCompatibility = true,
) {
  const raw = await read(entry);
  const root = raw && contentText(raw);
  const front = root?.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!front || !root) fail(422, 'EVALUATION_ENTRY_INVALID', '固定版本缺少可读的 Skill 正文');
  const body = root.slice(front[0].length);
  const rootLines = redactedLines(root, entry, secretLines);
  const materialFiles = new Set([entry]);
  for (const { url } of markdownReferences(root, 'used')) {
    const ref = resolveMarkdownReference(entry, url);
    if ('target' in ref && ref.target) materialFiles.add(ref.target);
  }
  const ranges: EvaluationEvidence[] = [];
  const chunks: string[] = [];
  let remaining = evaluationContentBudget;
  let limited = false;
  let masked = false;
  function append(path: string, text: string, start: number, lines: string[]) {
    if (!text) return;
    const header = '\n[' + path + ']\n';
    let prefix = header;
    let line = start;
    for (const value of text.replace(/(?:\r\n?|\n)$/, '').split(/\r\n?|\n/)) {
      const visible = lines[line - 1];
      masked ||= value !== visible;
      const part = prefix + line + ' | ' + visible + '\n';
      const size = wireTextBytes(part);
      if (size > remaining) {
        limited = true;
        break;
      }
      chunks.push(part);
      remaining -= size;
      line++;
      prefix = '';
    }
    if (line > start) ranges.push({ path, start_line: start, end_line: line - 1 });
  }
  append(entry, body, front[1].split(/\r\n?|\n/).length + 3, rootLines);
  if (!limited) {
    for (const path of materialFiles) {
      if (path === entry) continue;
      if (redactedLines(path)[0] === redactedLine) {
        masked = true;
        continue;
      }
      const bytes = await read(path);
      const text = bytes && contentText(bytes);
      if (text) append(path, text, 1, redactedLines(text, path, secretLines));
      if (limited) break;
    }
  }
  // compatibility 也是作者可用的依赖说明，保留原文行号，不发送其他 frontmatter 字段。
  if (!limited && includeCompatibility) {
    const fields = front[1].split(/\r\n?|\n/);
    const start = fields.findIndex((line) => /^compatibility\s*:/.test(line));
    if (start >= 0) {
      let end = start + 1;
      while (end < fields.length && /^[ \t]/.test(fields[end])) end++;
      append(entry, fields.slice(start, end).join('\n'), start + 2, rootLines);
    }
  }
  return { material: chunks.join(''), ranges, limited: limited || masked, materialFiles };
}
