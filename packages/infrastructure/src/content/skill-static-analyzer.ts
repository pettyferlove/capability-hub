import type { ContentFile } from '@capability-hub/domain/content';
import { fail } from '@capability-hub/domain/errors';
import {
  countEvaluationAuthorCases,
  evaluationThresholds,
  scoreChecks,
} from '@capability-hub/domain/evaluation';
import { contentText } from '@capability-hub/domain/files';
import type {
  EvaluationCheckResult,
  EvaluationDimensionResult,
  EvaluationEvidence,
} from '@capability-hub/domain/models';
import { posix } from 'node:path';
import { isAlias, isMap, isScalar, parseDocument } from 'yaml';
import { markdownUsage, resolveMarkdownReference } from './markdown-references.js';
import { boundedJson } from './json.js';

const entry = 'SKILL.md';
const limits = evaluationThresholds.structure;
type Verdict = EvaluationCheckResult['verdict'];

function location(path: string, line = 1): EvaluationEvidence {
  return { path, start_line: line, end_line: line };
}

function check(
  id: string,
  verdict: Verdict,
  note: string,
  evidence: EvaluationEvidence[],
  suggestion?: string,
): EvaluationCheckResult {
  return {
    id: 'structure.' + id,
    verdict,
    note,
    evidence: evidence.slice(0, 3),
    ...(suggestion && (verdict === 'fail' || verdict === 'partial') ? { suggestion } : {}),
  };
}

function atLeast(value: number, threshold: { pass: number; partial: number }): Verdict {
  if (value >= threshold.pass) return 'pass';
  return value >= threshold.partial ? 'partial' : 'fail';
}

function atMost(value: number, threshold: { pass: number; partial: number }): Verdict {
  if (value <= threshold.pass) return 'pass';
  return value <= threshold.partial ? 'partial' : 'fail';
}

function optionalFields(
  front: Record<string, unknown>,
  doc: ReturnType<typeof parseDocument>,
): Verdict {
  if (
    !['compatibility', 'metadata', 'license', 'allowed-tools'].some((key) =>
      Object.hasOwn(front, key),
    )
  )
    return 'na';
  const { compatibility, metadata } = front;
  if (compatibility !== undefined) {
    if (typeof compatibility !== 'string') return 'fail';
    const length = [...compatibility].length;
    if (length < limits.compatibilityChars.min || length > limits.compatibilityChars.max)
      return 'fail';
  }
  if (metadata !== undefined) {
    const resolve = (node: unknown) => (isAlias(node) ? node.resolve(doc) : node);
    const isStringScalar = (node: unknown) => {
      const scalar = resolve(node);
      return isScalar(scalar) && typeof scalar.value === 'string';
    };
    const mapping = resolve(doc.get('metadata', true));
    if (
      !isMap(mapping) ||
      (mapping.tag && mapping.tag !== 'tag:yaml.org,2002:map') ||
      !mapping.items.every(({ key, value }) => isStringScalar(key) && isStringScalar(value))
    )
      return 'fail';
  }
  return ['license', 'allowed-tools'].some((key) => key in front && typeof front[key] !== 'string')
    ? 'fail'
    : 'pass';
}

function caseCount(text: string | undefined) {
  if (!text) return 0;
  try {
    return countEvaluationAuthorCases(boundedJson(text));
  } catch {
    return 0;
  }
}

function references(texts: Map<string, string>, paths: Set<string>) {
  const targets = new Set(paths);
  for (const path of paths) {
    for (let end = path.indexOf('/'); end !== -1; end = path.indexOf('/', end + 1))
      targets.add(path.slice(0, end));
  }
  const edges = new Map<string, Set<string>>();
  const mentions = new Map<string, string>();
  const broken: EvaluationEvidence[] = [];
  for (const [path, text] of texts) {
    if (!/\.(?:md|markdown)$/i.test(path)) continue;
    const linked = new Set<string>();
    edges.set(path, linked);
    const usage = markdownUsage(text);
    mentions.set(path, usage.text);
    for (const ref of usage.references) {
      const resolved = resolveMarkdownReference(path, ref.url);
      if ('rule' in resolved || (resolved.target && !targets.has(resolved.target))) {
        if (broken.length < 3 || (path === entry && broken[0].path !== entry)) {
          if (path === entry) broken.unshift(location(path, ref.line));
          else broken.push(location(path, ref.line));
        }
      } else if (resolved.target && paths.has(resolved.target)) linked.add(resolved.target);
    }
  }
  const depth = new Map([[entry, 0]]);
  const queue = [entry];
  for (const path of queue) {
    for (const target of edges.get(path) ?? []) {
      if (depth.has(target)) continue;
      depth.set(target, depth.get(path)! + 1);
      queue.push(target);
    }
  }
  return { broken, depth, edges, mentions };
}

function pathMentioned(text: string, path: string) {
  const escaped = path.replace(/[.*+?^$(){|}[\]\\]/g, '\\$&');
  return new RegExp(
    '(?<![\\w./-])(?:\\./)?' + escaped + '(?![\\w/-]|\\.+[\\p{L}\\p{N}_/-])',
    'u',
  ).test(text);
}

/** `code` 为 false 时按 Markdown 正文处理：反斜线转义 ASCII 标点不构成路径分隔。 */
function hasWindowsPath(line: string, code: boolean) {
  if (!line.includes('\\')) return false;
  const literal = code
    ? line
    : line
        .split(/(`+[^`]*`+)/)
        .map((part, index) => (index % 2 ? part : part.replace(/\\([!-/:-@[\]^_`{-~])/g, '$1')))
        .join('');
  // printf 的格式参数会解释反斜线转义，后续实参仍可能是文件路径。
  const source = literal
    .replace(
      /\bprintf(?:[ \t]+--)?[ \t]*(?:\([ \t]*)?(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g,
      (format) =>
        format.replace(/\\(?:[abefnrtv\\]|[0-7]{1,3}|x[\da-fA-F]{1,2})/g, (escape) =>
          escape === '\\\\' ? '\\' : ' ',
        ),
    )
    // 单个转义字母紧接汉字（如 `欢迎\n世界`）是字符串转义，不是路径分段。
    .replace(/\\[abefnrtv0](?=\p{Script=Han})/gu, ' ');
  if (/(?:\b[a-z]:\\|\\\\[\p{L}\p{N}_.-]+\\[\p{L}\p{N}_.-]+)/iu.test(source)) return true;
  const relative = /(?<![\p{L}\p{N}_.-])[\p{L}\p{N}_.-]+(?:\\+[\p{L}\p{N}_][\p{L}\p{N}_.-]*)+/gu;
  for (const match of source.matchAll(relative)) {
    const parts = match[0].split(/\\+/);
    const last = parts.at(-1)!;
    if (
      /^(?:scripts|references|assets|evals|docs)$/i.test(parts[0]) ||
      parts.length > 2 ||
      /\.[\p{L}\p{N}_-]+/u.test(last) ||
      /\p{Script=Han}/u.test(match[0])
    )
      return true;
  }
  return false;
}

/** 二进制文件只参与清单路径与执行标记判断，文本引用不离开包内路径空间。 */
export function analyzeSkillStructure(files: ContentFile[]): EvaluationDimensionResult {
  const texts = new Map<string, string>();
  for (const file of files) {
    const text = contentText(file.bytes);
    if (text !== null) texts.set(file.path, text);
  }
  const root = texts.get(entry)?.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  if (!root) fail(422, 'EVALUATION_ENTRY_INVALID', '固定版本的入口或 frontmatter 无效');
  const doc = parseDocument(root[1], { uniqueKeys: true });
  const front: unknown = doc.toJS({ maxAliasCount: 20 });
  if (
    doc.errors.length ||
    !front ||
    typeof front !== 'object' ||
    !('description' in front) ||
    typeof front.description !== 'string'
  )
    fail(422, 'EVALUATION_ENTRY_INVALID', '固定版本的描述无效');
  const lines = root[2].replace(/(?:\r\n?|\n)$/, '').split(/\r\n?|\n/).length;
  const bodyStart = root[1].split(/\r\n?|\n/).length + 3;
  const description = [...front.description.replace(/\s/gu, '')].length;
  const { depth, broken, edges, mentions } = references(
    texts,
    new Set(files.map((file) => file.path)),
  );
  const scripts = files.filter(
    (file) => file.executable || (file.path.startsWith('scripts/') && texts.has(file.path)),
  );
  const supporting = [...texts.keys()].filter(
    (path) =>
      path !== entry &&
      !path.startsWith('scripts/') &&
      (/\.(?:md|markdown|txt|rst|adoc)$/i.test(path) || path.startsWith('references/')),
  );
  const farthest = Math.max(0, ...supporting.map((path) => depth.get(path) ?? Infinity));
  const docs = [entry, ...supporting.filter((path) => depth.get(path) === 1)];
  const missing = scripts.filter(
    ({ path }) =>
      !docs.some((docPath) => {
        const text = mentions.get(docPath) ?? texts.get(docPath)!;
        return (
          edges.get(docPath)?.has(path) ||
          pathMentioned(text, path) ||
          pathMentioned(text, posix.relative(posix.dirname(docPath), path))
        );
      }),
  );
  const windowsPaths: EvaluationEvidence[] = [];
  for (const [path, text] of texts) {
    if (!text.includes('\\')) continue;
    const markdown = /\.(?:md|markdown)$/i.test(path);
    let fence: string | undefined;
    const line = text.split(/\r\n?|\n/).findIndex((value) => {
      const marker = markdown ? /^ {0,3}(`{3,}|~{3,})/.exec(value)?.[1] : undefined;
      if (marker && (!fence || (marker[0] === fence[0] && marker.length >= fence.length))) {
        fence = fence ? undefined : marker;
        return false;
      }
      return hasWindowsPath(value, !markdown || !!fence);
    });
    if (line !== -1) windowsPaths.push(location(path, line + 1));
    if (windowsPaths.length === 3) break;
  }
  const suite = 'evals/evals.json';
  const examples = caseCount(texts.get(suite));
  const directSupport = [...(edges.get(entry) ?? [])].some(
    (path) => path !== entry && texts.has(path),
  );
  const checks = [
    check(
      'body_lines',
      atMost(lines, limits.bodyLines),
      '正文共 ' + lines + ' 行。',
      [location(entry, bodyStart)],
      '将较长的参考资料拆分到独立文档。',
    ),
    check(
      'description_detail',
      atLeast(description, limits.descriptionChars),
      '描述去空白后有 ' + description + ' 个字符。',
      [location(entry)],
      '在描述中补充用途与使用情境。',
    ),
    check(
      'reference_integrity',
      broken.some((e) => e.path === entry) ? 'fail' : broken.length ? 'partial' : 'pass',
      broken.length ? '存在无法解析的包内引用。' : '包内引用均可解析。',
      broken,
      '修正引用的编码、路径或缺少的文件。',
    ),
    check(
      'reference_depth',
      !supporting.length ? 'na' : farthest <= 1 ? 'pass' : farthest === 2 ? 'partial' : 'fail',
      !supporting.length
        ? '没有支撑文档。'
        : Number.isFinite(farthest)
          ? '最远支撑文档需要 ' + farthest + ' 跳。'
          : '有支撑文档无法从入口到达。',
      supporting
        .filter((path) => (depth.get(path) ?? Infinity) === farthest)
        .slice(0, 3)
        .map((path) => location(path)),
      '在入口中直接链接支撑文档。',
    ),
    check(
      'progressive_disclosure',
      directSupport ? 'pass' : atMost(lines, limits.progressiveLines),
      directSupport ? '入口直接引用了支撑文件。' : '正文共 ' + lines + ' 行，未引用支撑文件。',
      [location(entry, bodyStart)],
      '将详细资料拆分并从入口直接引用。',
    ),
    check(
      'script_documentation',
      scripts.length
        ? atLeast((scripts.length - missing.length) / scripts.length, limits.documentedScripts)
        : 'na',
      '已说明 ' + (scripts.length - missing.length) + '/' + scripts.length + ' 个脚本。',
      missing.slice(0, 3).map((file) => location(file.path)),
      '在入口或其直接引用文档中写明脚本路径。',
    ),
    check(
      'path_style',
      windowsPaths.length ? 'fail' : 'pass',
      windowsPaths.length ? '存在 Windows 风格路径。' : '路径写法符合要求。',
      windowsPaths,
      '在包内路径中使用正斜线。',
    ),
    check(
      'optional_fields',
      optionalFields(front, doc),
      '按 frontmatter 中提供的可选字段检查类型与长度。',
      [location(entry)],
      '核对可选字段的数据类型与兼容性说明长度。',
    ),
    check(
      'eval_suite',
      atLeast(examples, limits.evalCases),
      '可解析的评测用例有 ' + examples + ' 个。',
      texts.has(suite) ? [location(suite)] : [],
      '在 evals/evals.json 中提供至少 3 个含任务提示的用例。',
    ),
  ];
  return {
    id: 'structure',
    ...scoreChecks('structure', checks),
    confidence: 'high',
    checks,
    metrics: {
      body_lines: lines,
      description_chars: description,
      support_documents: supporting.length,
      scripts: scripts.length,
      documented_scripts: scripts.length - missing.length,
      eval_cases: examples,
    },
  };
}
