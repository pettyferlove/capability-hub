import { z } from 'zod';

/** 两种数据库均能以 JSON 字符串保存的 Unicode 文本。 */
export function isEvaluationText(value: string): boolean {
  return !value.includes('\0') && !/\p{Surrogate}/u.test(value);
}

const text = z.string().refine(isEvaluationText);
const assertionText = text.trim().min(1).max(200);
const assertion = z.union([
  assertionText.transform((label) => ({ text: label, requires_execution: false })),
  z.object({ text: assertionText, requires_execution: z.boolean().default(false) }),
]);
const authorCase = z.object({
  prompt: text.trim().min(1).max(1200),
  expected_output: text.max(600).default(''),
  files: z.array(text.min(1)).max(16).default([]),
  assertions: z.array(z.unknown()).default([]),
});
const suite = z.object({ evals: z.array(z.unknown()) });

function* authorInputs(value: unknown) {
  const parsed = suite.safeParse(value);
  if (!parsed.success) return;
  for (const item of parsed.data.evals) {
    const candidate = authorCase.safeParse(item);
    if (candidate.success) yield candidate.data;
  }
}

/** 结构分只计合格的作者用例，不需要逐条解析纸面断言。 */
export function countEvaluationAuthorCases(value: unknown): number {
  let count = 0;
  for (const _case of authorInputs(value)) count++;
  return count;
}

/** 默认字段已补齐，断言统一携带是否依赖执行的标记。 */
export type EvaluationAuthorCase = Omit<z.infer<typeof authorCase>, 'assertions'> & {
  assertions: z.infer<typeof assertion>[];
};

/** 任务生成按预算逐个读取候选，每条断言独立筛选。 */
export function* parseEvaluationAuthorCases(value: unknown): Generator<EvaluationAuthorCase> {
  for (const author of authorInputs(value)) {
    const assertions = author.assertions.flatMap((item) => {
      const result = assertion.safeParse(item);
      return result.success ? [result.data] : [];
    });
    yield { ...author, assertions };
  }
}
