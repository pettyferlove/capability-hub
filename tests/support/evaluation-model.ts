import { openAiJson, type StubHandler, type StubRequest } from './model-provider-stub.js';

const questions = {
  should_trigger: [
    '新成员接手模块时，第一份交付应该包含哪些内容？',
    '同事给出的改动难以核对，怎样把验收条件写清楚？',
    '请把交付方案整理为团队可以直接照做的步骤。',
    '两个人对完成的定义不同，怎样统一检查依据？',
    '帮我准备一个核对模块边界与命名约定的清单。',
    '怎样检查新增接口和团队工程实践是否一致？',
    'How can the team agree on a concrete handover checklist?',
    'Prepare a review plan for module naming and ownership.',
  ],
  near_miss: [
    '把这份工程交付清单翻译成法语，保留编号。',
    '根据交付清单中每项的耗时，计算项目总成本。',
    '将文章里的工程术语按拼音首字母排序。',
    '给这张模块关系图选一种适合印刷的配色。',
    '把接口评审会议从上海时间换算成纽约时间。',
    '检查团队工程周报里的错别字和标点。',
    'Translate the module review notes into Italian.',
    'Schedule the handover meeting across two time zones.',
  ],
};

const instructionIds = [
  'purpose_scope',
  'actionable_steps',
  'concrete_examples',
  'conciseness',
  'terminology',
  'freedom_fit',
  'verification',
  'timeless',
  'script_robustness',
];

const selectedQueries = new Set(
  [...questions.should_trigger.slice(0, 7), ...questions.near_miss.slice(0, 2)].map((query) =>
    query.normalize('NFKC'),
  ),
);

/** 测试文档第八行是正文首行，既可有效取证，也可用改写的行号验证越界。 */
export const evaluationCitation = { path: 'SKILL.md', start_line: 8, end_line: 8 };

/** 维护者专属文案带有固定标识，便于断言读者投影中没有自由文本。 */
export const evaluationCheck = {
  verdict: 'pass',
  evidence: [evaluationCitation],
  note: '私有依据',
  suggestion: '私有建议',
};

/** 四项与操纵闸门的默认环回输出。 */
export const evaluationTransparency = {
  requirements: evaluationCheck,
  credentials: evaluationCheck,
  network: evaluationCheck,
  side_effects: evaluationCheck,
  manipulation: { suspected: false, note: '', evidence: [evaluationCitation] },
  summary: '私有评测总结',
};

/** 过滤测试可以对一个正常的双语样本集合添加重复项或替换反例。 */
export const evaluationTriggerCases = Object.entries(questions).flatMap(([kind, queries]) =>
  queries.map((query, index) => ({
    kind,
    language: index < 6 ? 'zh' : 'en',
    implicit: kind === 'should_trigger' && index < 4,
    query,
  })),
);

/** 由两个独立的环回响应模拟双样本，固定检查项来自对外标准。 */
export function evaluationInstructionChecks() {
  return instructionIds.map((id) => ({ id: 'instructions.' + id, ...evaluationCheck }));
}

function messages(request: StubRequest) {
  return (request.body as { messages: { role: string; content: string }[] }).messages;
}

/** 实际在线上传送的用户输入，和系统指令、Schema 分开。 */
export function evaluationModelInput(request: StubRequest) {
  return messages(request).find((m) => m.role === 'user')!.content;
}

/** 取模型实际收到的 Schema，不用应用内的校验器代替出站契约。 */
export function evaluationOutputSchema(request: StubRequest) {
  const instructions = messages(request).find(
    (m) => m.role === 'system' || m.role === 'developer',
  )!.content;
  return JSON.parse(instructions.trim().split('\n').at(-1)!) as {
    properties: Record<
      string,
      { minItems?: number; maxItems?: number; items?: { properties?: Record<string, unknown> } }
    >;
  };
}

/** 依据请求中真实输出 Schema 的字段选择脚本回复；A/B 评审仅根据交付物内容作答。 */
export function evaluationModelStep(request: StubRequest) {
  const fields = evaluationOutputSchema(request).properties;
  if (fields.cases) return fields.cases.items?.properties?.kind ? 'trigger-cases' : 'task-cases';
  if (fields.choice) return 'trigger-routing';
  if (fields.checks) return 'instructions';
  if (fields.assertions) return 'task-judge';
  if (fields.output)
    return evaluationModelInput(request).includes('<参考材料>') ? 'task-with' : 'task-without';
  if (fields.manipulation) return 'transparency';
  throw new Error('未知的资源评测输出 Schema');
}

type Step = ReturnType<typeof evaluationModelStep>;
type Overrides = Partial<Record<Step, StubHandler>>;

const assertions = [
  { text: '列出交付标题', requires_execution: false },
  { text: '列出输入条件', requires_execution: false },
  { text: '列出处理步骤', requires_execution: false },
  { text: '列出核对方法', requires_execution: false },
  { text: '在线执行并取得运行值', requires_execution: true },
];

function taskCases(input: string) {
  const authors = JSON.parse(input.match(/作者用例\n([^\n]+)\n/)?.[1] ?? '[]') as {
    author_index: number;
    prompt: string;
  }[];
  const cases = [
    ...authors.filter((item) => !item.prompt.includes('实际运行')).slice(0, 2),
    ...['汇总交付条件', '整理输入资料', '核对模块边界', '准备交付说明'].map((prompt) => ({
      author_index: null,
      prompt,
    })),
  ];
  return {
    cases: cases.map((item) => ({
      author_index: item.author_index,
      prompt: item.prompt,
      expected: '一份可核对的清单',
      assertions,
      paper: true,
      script_dependent: false,
    })),
  };
}

/** 引文使用规范化后的空白，并按两份交付物各自的文本作答。 */
export function evaluationJudge(input: string) {
  const pair = JSON.parse(input) as { A: string; B: string; assertions: string[] };
  const verdict = (output: string, index: number) => {
    const detailed = output.includes('详尽');
    return { passed: detailed || index < 2, quote: detailed ? '详尽 步骤' : '简要 步骤' };
  };
  return {
    assertions: pair.assertions.map((_, index) => ({
      a: verdict(pair.A, index),
      b: verdict(pair.B, index),
    })),
  };
}

/** 模拟完整纸面评测；故障和边界反例只覆盖指定调用，保留其余真实 HTTP 往返。 */
export function evaluationModelHandler(
  overrides: Overrides = {},
  target = 'sample-skill',
): StubHandler {
  return (request, index) => {
    const step = evaluationModelStep(request);
    const override = overrides[step];
    if (override) return override(request, index);
    const input = evaluationModelInput(request);
    let result: unknown;
    switch (step) {
      case 'trigger-cases':
        result = { cases: evaluationTriggerCases };
        break;
      case 'trigger-routing': {
        const { query } = JSON.parse(input) as { query: string };
        const chosen = selectedQueries.has(query.normalize('NFKC'));
        result = { choice: chosen ? target : null, reason: '私有路由依据' };
        break;
      }
      case 'instructions':
        result = { checks: evaluationInstructionChecks() };
        break;
      case 'task-cases':
        result = taskCases(input);
        break;
      case 'task-without':
        result = { output: '交付标题\n简要    步骤\n私有基准交付正文' };
        break;
      case 'task-with':
        result = { output: '交付标题\n详尽    步骤\n私有参考交付正文' };
        break;
      case 'task-judge':
        result = evaluationJudge(input);
        break;
      case 'transparency':
        result = evaluationTransparency;
        break;
    }
    return { json: openAiJson(result) };
  };
}
