import { AiError } from '@capability-hub/ai';
import type { EvaluationStageResult } from '@capability-hub/application';
import { sha256 } from '@capability-hub/domain/canonical';
import {
  effectivenessResult,
  evaluationContentBudget,
  evaluationThresholds,
  parseEvaluationAuthorCases,
  type EvaluationAuthorCase,
} from '@capability-hub/domain/evaluation';
import { contentText } from '@capability-hub/domain/files';
import type { ResourceEvaluationRecord } from '@capability-hub/domain/models';
import { safePath } from '@capability-hub/domain/paths';
import {
  taskCasesInstructions,
  taskCasesSchema,
  taskJudgeInstructions,
  taskJudgeSchema,
  taskRunInstructions,
  taskRunSchema,
} from '@capability-hub/hub-agents';
import { boundedJson } from '@capability-hub/infrastructure/content';
import type { z } from 'zod';
import {
  fitJsonFields,
  fitLines,
  fitText,
  jsonFieldBytes,
  wireTextBytes,
  type EvaluationCall,
} from './model-input.js';
import { redactedLine, redactedLines } from './skill-packing.js';

type Task = NonNullable<ResourceEvaluationRecord['cases']>['tasks'][number];
type Read = (path: string, maxBytes?: number) => Promise<Buffer | undefined>;
const limits = evaluationThresholds.effectiveness;
const suitePath = 'evals/evals.json';

async function attachments(
  files: string[],
  read: Read,
  secretLines: ReadonlySet<string>,
  materialFiles: ReadonlySet<string>,
  invalidFiles?: Set<string>,
) {
  if (
    files.some(
      (path) =>
        materialFiles.has(path) ||
        path === suitePath ||
        redactedLines(path)[0] === redactedLine ||
        invalidFiles?.has(path),
    )
  )
    return null;
  const parts: string[] = [];
  let bytes = 0;
  let limited = false;
  for (const path of files) {
    try {
      safePath(path);
    } catch {
      return null;
    }
    const raw = await read(path, limits.maxAuthorInputBytes - bytes);
    if (raw && raw.length > limits.maxAuthorInputBytes) invalidFiles?.add(path);
    if (!raw || (bytes += raw.length) > limits.maxAuthorInputBytes) return null;
    const text = contentText(raw);
    if (text === null) {
      invalidFiles?.add(path);
      return null;
    }
    const visible = redactedLines(text, path, secretLines);
    const masked = visible.includes(redactedLine);
    limited ||= masked;
    parts.push('[' + path + ']\n' + (masked ? visible.join('\n') : text));
  }
  return { text: parts.join('\n'), limited };
}

async function authorCandidates(
  read: Read,
  budget: number,
  secretLines: ReadonlySet<string>,
  materialFiles: ReadonlySet<string>,
) {
  const authors: EvaluationAuthorCase[] = [];
  const descriptions: string[] = [];
  const raw = await read(suitePath);
  const suiteText = raw && contentText(raw);
  const maskedSuite =
    !!suiteText && redactedLines(suiteText, suitePath, secretLines).includes(redactedLine);
  const bytes = maskedSuite ? undefined : raw;
  let candidates: Iterable<EvaluationAuthorCase>;
  try {
    candidates = bytes ? parseEvaluationAuthorCases(boundedJson(bytes)) : [];
  } catch {
    candidates = [];
  }
  let limited = maskedSuite;
  let available = budget - wireTextBytes('[]');
  // 同一包内不可读的文件只检查一次；仅因前一附件占用预算而放不下的文件仍可用于其他用例。
  const invalidFiles = new Set<string>();
  for (const author of candidates) {
    const candidate = {
      author_index: authors.length,
      prompt: author.prompt,
      expected: author.expected_output,
      assertions: author.assertions,
      files: author.files,
      input_excerpt: '',
    };
    const cost = wireTextBytes(JSON.stringify(candidate)) + Number(authors.length > 0);
    if (cost > available) {
      limited = true;
      continue;
    }
    if (
      redactedLines(
        [author.prompt, author.expected_output, ...author.assertions.map((item) => item.text)].join(
          '\n',
        ),
      ).includes(redactedLine)
    ) {
      limited = true;
      continue;
    }
    const input = await attachments(author.files, read, secretLines, materialFiles, invalidFiles);
    if (!input) continue;
    candidate.input_excerpt = fitText(
      input.text,
      Math.min(available - cost, Math.floor(budget / 4)),
      jsonFieldBytes,
    );
    limited ||= input.limited || candidate.input_excerpt !== input.text;
    available -= cost + jsonFieldBytes(candidate.input_excerpt);
    authors.push(author);
    descriptions.push(JSON.stringify(candidate));
  }
  return { authors, brief: '[' + descriptions.join(',') + ']', limited };
}

function paperAssertions(
  generated: z.infer<typeof taskCasesSchema>['cases'][number]['assertions'],
  author?: EvaluationAuthorCase,
) {
  const all = [...(author?.assertions ?? []), ...generated];
  const excluded = new Set(
    all.filter((item) => item.requires_execution).map((item) => item.text.trim()),
  );
  return [...new Set(all.map((item) => item.text.trim()))]
    .filter((text) => text && !excluded.has(text))
    .slice(0, limits.maxAssertionsPerCase);
}

/** 作者候选先核对包内文件，再由模型判断是否可纸面完成；取前两例的限制在判断之后生效。 */
export async function generateTasks(
  call: EvaluationCall,
  row: ResourceEvaluationRecord,
  read: Read,
  material: string,
  limited = false,
  secretLines: ReadonlySet<string> = new Set(),
  materialFiles: ReadonlySet<string> = new Set(['SKILL.md']),
): Promise<EvaluationStageResult> {
  const title = '<材料>\n作者用例\n';
  const heading = '\nSkill\n';
  const end = '</材料>';
  const budget = evaluationContentBudget - wireTextBytes(title + heading + end);
  const authorBudget = Math.max(Math.floor(budget / 2), budget - wireTextBytes(material));
  const {
    authors,
    brief,
    limited: authorLimited,
  } = await authorCandidates(read, authorBudget, secretLines, materialFiles);
  const sent = fitLines(material, budget - wireTextBytes(brief));
  const coverageLimited = limited || authorLimited || sent !== material;
  const result = await call(
    'task-cases',
    taskCasesInstructions,
    title + brief + heading + sent + end,
    taskCasesSchema,
  );
  const tasks: Task[] = [];
  const prompts = new Set<string>();
  const used = new Set<number>();
  const candidates = [...result.cases].sort(
    (a, b) => (a.author_index ?? Infinity) - (b.author_index ?? Infinity),
  );
  for (const candidate of candidates) {
    if (!candidate.paper) continue;
    const author = candidate.author_index === null ? undefined : authors[candidate.author_index];
    if (
      candidate.author_index !== null &&
      (!author || used.has(candidate.author_index) || used.size >= limits.maxAuthorCases)
    )
      continue;
    const assertions = paperAssertions(candidate.assertions, author);
    const prompt = author?.prompt ?? candidate.prompt.trim();
    if (assertions.length < limits.minAssertionsPerCase || !prompt || prompts.has(prompt)) continue;
    if (candidate.author_index !== null) used.add(candidate.author_index);
    prompts.add(prompt);
    tasks.push({
      id: 't' + (tasks.length + 1),
      origin: author ? 'author' : 'generated',
      prompt,
      expected: author?.expected_output || candidate.expected,
      assertions,
      ...(author?.files.length ? { files: author.files } : {}),
      script_dependent: candidate.script_dependent,
    });
    if (tasks.length === limits.cases) break;
  }
  return {
    cases: { trigger: row.cases?.trigger ?? [], tasks },
    coverageLimited,
    ...(tasks.length !== limits.cases && {
      dimension: effectivenessResult([], false, coverageLimited),
    }),
  };
}

function withinQuoteLimit(quote: string) {
  if (quote.length <= limits.maxQuoteChars) return true;
  if (quote.length > limits.maxQuoteChars * 2) return false;
  let length = 0;
  for (const _ of quote) if (++length > limits.maxQuoteChars) return false;
  return true;
}

function normalizeEvidence(text: string) {
  return text.trim().replace(/\s+/gu, ' ');
}

function confirmed(judgment: { passed: boolean; quote: string }, normalizedOutput: string) {
  const quote = withinQuoteLimit(judgment.quote) ? normalizeEvidence(judgment.quote) : '';
  const valid = quote.length > 0 && normalizedOutput.includes(quote);
  return { passed: valid && judgment.passed, valid, quote: valid ? judgment.quote : '' };
}

/** 盲评只看到同一任务的输入、断言与两份交付物。验证引文时使用盲评实际看到的文本。 */
export async function runTask(
  call: EvaluationCall,
  row: ResourceEvaluationRecord,
  index: number,
  read: Read,
  material: string,
  limited: boolean,
  secretLines: ReadonlySet<string>,
  materialFiles: ReadonlySet<string>,
): Promise<EvaluationStageResult> {
  const tasks = row.cases?.tasks ?? [];
  const task = tasks[index];
  if (tasks.length !== limits.cases || !task) return { skipped: true };
  const files = await attachments(task.files ?? [], read, secretLines, materialFiles);
  if (!files) throw new AiError('AI_NOT_FOUND', '作者用例输入文件不再可读');

  const prompt = '用户任务\n' + task.prompt + '\n';
  const reference = '\n<参考材料>\n';
  const end = '\n</参考材料>';
  const budget = evaluationContentBudget - wireTextBytes(prompt + reference + end);
  const fileBudget = Math.max(Math.floor(budget / 2), budget - wireTextBytes(material));
  const inputFiles = fitText(files.text, fileBudget);
  const packed = fitLines(material, budget - wireTextBytes(inputFiles));
  const common = prompt + inputFiles;
  const without = await call('task-without', taskRunInstructions, common, taskRunSchema);
  const withSkill = await call(
    'task-with',
    taskRunInstructions,
    common + reference + packed + end,
    taskRunSchema,
  );

  const swap = Number.parseInt(sha256(row.id + '|' + task.id).slice(0, 2), 16) % 2 === 0;
  const pair = {
    prompt: task.prompt,
    expected: task.expected,
    assertions: task.assertions,
    input_files: '',
    A: '',
    B: '',
  };
  const judgeBudget = evaluationContentBudget - wireTextBytes(JSON.stringify(pair));
  const outputBytes = jsonFieldBytes(without.output) + jsonFieldBytes(withSkill.output);
  pair.input_files = fitText(
    inputFiles,
    Math.max(Math.floor(judgeBudget / 3), judgeBudget - outputBytes),
    jsonFieldBytes,
  );
  const outputs = fitJsonFields(
    [without.output, withSkill.output],
    judgeBudget - jsonFieldBytes(pair.input_files),
  );
  [pair.A, pair.B] = swap ? [outputs[1], outputs[0]] : outputs;
  const judged = await call(
    'task-judge',
    taskJudgeInstructions,
    JSON.stringify(pair),
    taskJudgeSchema(task.assertions.length),
  );
  const normalizedWithout = normalizeEvidence(outputs[0]);
  const normalizedWith = normalizeEvidence(outputs[1]);
  const assertions = judged.assertions.map((item) => ({
    with_skill: confirmed(swap ? item.a : item.b, normalizedWith),
    without_skill: confirmed(swap ? item.b : item.a, normalizedWithout),
  }));
  const coverageLimited =
    limited ||
    files.limited ||
    inputFiles !== files.text ||
    pair.input_files !== inputFiles ||
    packed !== material ||
    outputs[0] !== without.output ||
    outputs[1] !== withSkill.output;
  return { assertions, coverageLimited };
}
