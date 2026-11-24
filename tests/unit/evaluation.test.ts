import assert from 'node:assert/strict';
import { fitJsonFields } from '../../apps/server/src/evaluation/model-input.js';
import { packSkill } from '../../apps/server/src/evaluation/skill-packing.js';
import { scoreTransparency } from '../../apps/server/src/evaluation/transparency.js';
import { radarGeometry } from '../../apps/web/src/shared/components/radar-geometry.js';
import { test } from 'node:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  effectivenessResult,
  evaluationBand,
  evaluationContentBudget,
  evaluationDimensions,
  evaluationRubric,
  instructionResult,
  parseEvaluationAuthorCases,
  scoreChecks,
  triggeringResult,
} from '@capability-hub/domain/evaluation';
import type { EvaluationCheckResult } from '@capability-hub/domain/models';
import type { ContentFile } from '@capability-hub/domain/content';
import { analyzeSkillStructure, inspect } from '@capability-hub/infrastructure/content';
import { loadServerConfig } from '@capability-hub/server/config';
import { calibrationSamples } from '../fixtures/evaluation/samples.js';
import {
  summarizeCalibration,
  type CalibrationObservation,
} from '../support/evaluation-calibration.js';

test('结构得分按适用权重取整，低于一半权重时缺分', () => {
  const items = evaluationRubric.structure.checks;
  const cases: [EvaluationCheckResult['verdict'][], number | null][] = [
    [items.map(() => 'pass'), 100],
    [
      items.map((item) => (item.id === 'structure.progressive_disclosure' ? 'partial' : 'pass')),
      94,
    ],
    [['pass', 'na', 'fail', 'partial'], 50],
    [['pass', 'na', 'fail', 'na'], null],
    [items.map(() => 'na'), null],
    [items.map(() => 'fail'), 0],
  ];
  for (const [verdicts, score] of cases) {
    assert.deepEqual(
      scoreChecks(
        'structure',
        verdicts.map((verdict, i) => ({ id: items[i].id, verdict })),
      ),
      {
        score,
        status: score === null ? 'not_applicable' : 'scored',
      },
    );
  }
});

test('四个等级在边界处切换，缺分没有等级', () => {
  for (const [score, band] of [
    [null, null],
    [0, 'weak'],
    [49, 'weak'],
    [50, 'fair'],
    [69, 'fair'],
    [70, 'good'],
    [84, 'good'],
    [85, 'excellent'],
    [100, 'excellent'],
  ] as const)
    assert.equal(evaluationBand(score), band);
});

test('触发准确平衡两类命中率，用例不足保留计数并缺分', () => {
  const cases = [
    { hit: 6, positive: 6, avoided: 0, negative: 8, score: 50, confidence: 'medium' },
    { hit: 0, positive: 6, avoided: 8, negative: 8, score: 50, confidence: 'medium' },
    { hit: 3, positive: 6, avoided: 6, negative: 8, score: 63, confidence: 'medium' },
    { hit: 3, positive: 6, avoided: 6, negative: 8, score: 63, confidence: 'low', limited: true },
    { hit: 5, positive: 6, avoided: 7, negative: 7, score: 92, confidence: 'low' },
    { hit: 0, positive: 6, avoided: 0, negative: 6, score: 0, confidence: 'low' },
    { hit: 5, positive: 5, avoided: 8, negative: 8, score: null, confidence: null },
    { hit: 8, positive: 8, avoided: 5, negative: 5, score: null, confidence: null },
  ];
  for (const { hit, positive, avoided, negative, score, confidence, limited = false } of cases) {
    const dimension = triggeringResult(hit, positive, avoided, negative, limited);
    assert.equal(dimension.status, score === null ? 'insufficient' : 'scored');
    assert.equal(dimension.score, score);
    assert.equal(dimension.confidence, confidence);
    assert.equal(dimension.flags?.includes('coverage_limited'), limited);
    assert.deepEqual(dimension.metrics, {
      should_hit: hit,
      should_total: positive,
      near_miss_avoided: avoided,
      near_miss_total: negative,
    });
  }
});

function instructionSample(
  overrides: Readonly<Record<string, EvaluationCheckResult['verdict'] | 'unsupported'>>,
  line: number,
): EvaluationCheckResult[] {
  return evaluationRubric.instructions.checks.map(({ id }) => {
    const answer = overrides[id.replace('instructions.', '')] ?? 'pass';
    return {
      id,
      verdict: answer === 'unsupported' ? 'pass' : answer,
      evidence:
        answer === 'unsupported' ? [] : [{ path: 'SKILL.md', start_line: line, end_line: line }],
      note: answer + ' ' + line,
    };
  });
}

test('指令质量保留两次有据判定的均值，一侧缺证据时只采信另一侧', () => {
  const first = instructionSample({ actionable_steps: 'partial', purpose_scope: 'unsupported' }, 6);
  const second = instructionSample({}, 9);
  const dimension = instructionResult([first, second], false);
  assert.equal(dimension.score, 95);
  assert.equal(dimension.metrics?.agreement, 11 / 16);
  const steps = dimension.checks.find((item) => item.id === 'instructions.actionable_steps');
  assert.equal(steps?.value, 0.75);
  assert.equal(steps.verdict, 'partial');
  assert.equal(steps.note, 'partial 6');
  assert.deepEqual(steps.evidence.map((item) => item.start_line).sort(), [6, 9]);
  const purpose = dimension.checks.find((item) => item.id === 'instructions.purpose_scope');
  assert.equal(purpose?.value, 1);
  assert.deepEqual(
    purpose.evidence.map((item) => item.start_line),
    [9],
  );
});

test('固定版本没有脚本时，脚本健壮性的模型判定不计入分数或两次评审的一致率', () => {
  const samples = [
    instructionSample({}, 5),
    instructionSample({ purpose_scope: 'partial', terminology: 'partial' }, 8),
  ];
  const plain = instructionResult(samples, false, 0);
  const script = plain.checks.find((check) => check.id === 'instructions.script_robustness');
  assert.equal(script?.verdict, 'na');
  assert.deepEqual(script.evidence, []);
  assert.equal(plain.score, 95);
  assert.equal(plain.metrics?.agreement, 11 / 14);
  assert.equal(plain.confidence, 'medium');
  assert.equal(instructionResult(samples, false, 1).metrics?.agreement, 13 / 16);
});

test('指令质量按有效权重的一致率分级，超出无效比例时不出分', () => {
  const unsupported = {
    actionable_steps: 'unsupported',
    concrete_examples: 'unsupported',
    terminology: 'unsupported',
  } as const;
  const first = instructionSample(unsupported, 5);
  const cases = [
    { disagree: ['purpose_scope'], limited: false, ratio: 0.8, confidence: 'high' },
    { disagree: ['purpose_scope'], limited: true, ratio: 0.8, confidence: 'medium' },
    {
      disagree: ['purpose_scope', 'freedom_fit'],
      limited: false,
      ratio: 0.7,
      confidence: 'medium',
    },
    {
      disagree: ['purpose_scope', 'conciseness'],
      limited: false,
      ratio: 0.6,
      confidence: 'medium',
    },
    {
      disagree: ['purpose_scope', 'conciseness', 'freedom_fit'],
      limited: true,
      ratio: 0.5,
      confidence: 'low',
    },
  ];
  for (const { disagree, limited, ratio, confidence } of cases) {
    const second = instructionSample(
      { ...unsupported, ...Object.fromEntries(disagree.map((id) => [id, 'fail'])) },
      8,
    );
    const dimension = instructionResult([first, second], limited);
    assert.equal(dimension.status, 'scored');
    assert.equal(dimension.metrics?.agreement, ratio);
    assert.equal(dimension.confidence, confidence);
    assert.equal(dimension.flags?.includes('coverage_limited'), limited);
  }
  const invalid = instructionSample({ ...unsupported, freedom_fit: 'unsupported' }, 8);
  const failed = instructionResult([invalid, invalid], false);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.failure_code, 'EVALUATION_EVIDENCE_INVALID');
  assert.equal(failed.score, null);
  assert.equal(failed.confidence, null);
  const na = instructionSample(
    {
      actionable_steps: 'na',
      purpose_scope: 'na',
      concrete_examples: 'na',
      script_robustness: 'na',
    },
    8,
  );
  const insufficientWeight = instructionResult([na, na], false);
  assert.equal(insufficientWeight.status, 'not_applicable');
  assert.equal(insufficientWeight.score, null);
});

function judgments(total: number, withPass: number, withoutPass: number, invalid: number = 0) {
  return Array.from({ length: total }, (_, index) => ({
    with_skill: { passed: index < withPass, valid: index >= invalid },
    without_skill: { passed: index < withoutPass, valid: true },
  }));
}

test('任务效果以带 Skill 通过率计分，按原始计数判断增益边界', () => {
  const cases = [
    { withPass: 17, withoutPass: 16, score: 85, delta: 5, gain: 0.25, flags: ['limited_uplift'] },
    { withPass: 18, withoutPass: 16, score: 90, delta: 10, gain: 0.5, flags: [] },
    { withPass: 15, withoutPass: 15, score: 75, delta: 0, gain: 0, flags: [] },
    {
      withPass: 14,
      withoutPass: 16,
      score: 70,
      delta: -10,
      gain: -0.5,
      flags: ['limited_uplift', 'negative_uplift'],
    },
    {
      withPass: 19,
      withoutPass: 20,
      score: 95,
      delta: -5,
      gain: undefined,
      flags: ['limited_uplift'],
    },
    { withPass: 0, withoutPass: 0, score: 0, delta: 0, gain: 0, flags: [] },
  ];
  for (const { withPass, withoutPass, score, delta, gain, flags } of cases) {
    const dimension = effectivenessResult(judgments(20, withPass, withoutPass), false, false);
    assert.equal(dimension.score, score);
    assert.equal(dimension.metrics?.pass_with, withPass / 20);
    assert.equal(dimension.metrics?.pass_without, withoutPass / 20);
    assert.equal(dimension.metrics?.uplift_pp, delta);
    assert.equal(dimension.metrics?.normalized_gain, gain);
    assert.deepEqual(dimension.flags, flags);
  }
});

test('任务效果按成对有效断言计置信度，单侧引文无效只扣该侧通过率', () => {
  const cases = [
    { total: 0, invalid: 0, script: false, limited: false, confidence: null },
    { total: 12, invalid: 3, script: false, limited: false, confidence: null },
    { total: 12, invalid: 2, script: false, limited: false, confidence: 'low' },
    { total: 15, invalid: 0, script: false, limited: false, confidence: 'low' },
    { total: 16, invalid: 0, script: false, limited: false, confidence: 'medium' },
    { total: 20, invalid: 2, script: false, limited: false, confidence: 'medium' },
    { total: 20, invalid: 3, script: false, limited: false, confidence: 'low' },
    { total: 20, invalid: 0, script: true, limited: false, confidence: 'low' },
    { total: 20, invalid: 0, script: false, limited: true, confidence: 'low' },
  ];
  for (const { total, invalid, script, limited, confidence } of cases) {
    const dimension = effectivenessResult(judgments(total, total, total, invalid), script, limited);
    assert.equal(dimension.metrics?.valid_assertions, total - invalid);
    assert.equal(dimension.metrics?.total_assertions, total);
    assert.equal(dimension.metrics?.invalid_rate, total ? invalid / total : undefined);
    assert.equal(dimension.metrics?.pass_with, total ? (total - invalid) / total : undefined);
    assert.equal(dimension.metrics?.pass_without, total ? 1 : undefined);
    assert.equal(dimension.status, confidence === null ? 'insufficient' : 'scored');
    assert.equal(
      dimension.score,
      confidence === null ? null : Math.round((100 * (total - invalid)) / total),
    );
    assert.equal(dimension.confidence, confidence);
    assert.equal(dimension.flags?.includes('script_unverified'), script);
    assert.equal(dimension.flags?.includes('coverage_limited'), limited);
  }
});

function file(path: string, text: string | Buffer, executable = false): ContentFile {
  return { path, bytes: Buffer.from(text), executable };
}

interface Example {
  body?: string;
  description?: string;
  front?: string;
  files?: ContentFile[];
}

function result({
  body = '执行流程。',
  description = '完整描述'.repeat(10),
  front = '',
  files = [],
}: Example) {
  return analyzeSkillStructure([
    file(
      'SKILL.md',
      '---\nname: sample\ndescription: ' + description + '\n' + front + '---\n' + body + '\n',
    ),
    ...files,
  ]);
}

type CheckCase = [Example, EvaluationCheckResult['verdict']];
const lines = (n: number) => Array.from({ length: n }, () => '步骤').join('\n');
const suite = (n: number) =>
  file(
    'evals/evals.json',
    JSON.stringify({ evals: Array.from({ length: n }, (_, i) => ({ prompt: '用例 ' + i })) }),
  );
const doc = file('a.md', '[后续](b.md)');
const second = file('b.md', '指南');
const script = file('scripts/work', '示例脚本');
const other = file('bin/other', '独立脚本', true);
const matrix: Record<string, CheckCase[]> = {
  body_lines: [
    [{ body: lines(500) }, 'pass'],
    [{ body: lines(501) }, 'partial'],
    [{ body: lines(800) }, 'partial'],
    [{ body: lines(801) }, 'fail'],
  ],
  description_detail: [
    [{ description: '🌿 '.repeat(19) }, 'fail'],
    [{ description: '🌿 '.repeat(20) }, 'partial'],
    [{ description: '🌿 '.repeat(39) }, 'partial'],
    [{ description: '🌿 '.repeat(40) }, 'pass'],
  ],
  reference_integrity: [
    [{}, 'pass'],
    [
      {
        body: '[链接](a.md?x#y) [站点](https://example.test) [目录](docs/)',
        files: [file('a.md', '[正常](docs/%E4%B9%A6.txt)'), file('docs/书.txt', '文档')],
      },
      'pass',
    ],
    ...['missing.md', '../escape', '%ZZ', '/abs.md'].map((url): CheckCase => [
      { body: '[坏](' + url + ')' },
      'fail',
    ]),
    [{ body: '[A](a.md)', files: [file('a.md', '[缺](missing.md)')] }, 'partial'],
    [{ body: '~~~md\n[忽略](missing.md)\n~~~' }, 'pass'],
    [{ body: '[unused]: missing.md' }, 'pass'],
    [{ front: 'metadata: {note: "[说明](missing.md)"}\n' }, 'pass'],
    [{ body: '[A][file]\n\n[file]: b.md\n[file]: missing.md', files: [second] }, 'pass'],
  ],
  reference_depth: [
    [{}, 'na'],
    [{ body: '[A](a.md) [B](b.md)', files: [doc, second] }, 'pass'],
    [{ body: '[A](a.md)', files: [doc, second] }, 'partial'],
    [{ body: '![图片][File]\n\n[file]: b.md', files: [second] }, 'pass'],
    [{ body: '[unused]: b.md', files: [second] }, 'fail'],
    [{ front: 'metadata: {note: "[说明](b.md)"}\n', files: [second] }, 'fail'],
    [
      {
        body: '[A](a.md)',
        files: [doc, file('b.md', '[根](SKILL.md) [C](c.md)'), file('c.md', '末端')],
      },
      'fail',
    ],
    [{ files: [second] }, 'fail'],
    [{ files: [file('b.md', Buffer.from([255]))] }, 'na'],
    ...['---  \n', '---\n'].map((open): CheckCase => [
      { body: '[A](a.md)', files: [file('a.md', open + '见 [后续](b.md)\n---\n'), second] },
      'partial',
    ]),
  ],
  progressive_disclosure: [
    [{ body: lines(200) }, 'pass'],
    [{ body: lines(201) }, 'partial'],
    [{ body: lines(300) }, 'partial'],
    [{ body: lines(301) }, 'fail'],
    [{ body: lines(301) + '\n[说明](b.md)', files: [second] }, 'pass'],
    [{ body: lines(301) + '\n\n[unused]: b.md', files: [second] }, 'fail'],
    [
      {
        body: lines(301) + '\n[模板](assets/template.json)',
        files: [file('assets/template.json', '{}')],
      },
      'pass',
    ],
  ],
  script_documentation: [
    [{ files: [file('scripts/opaque', Buffer.from([255]))] }, 'na'],
    [{ body: 'scripts/work bin/other', files: [script, other] }, 'pass'],
    [{ body: 'Run scripts/run.py.', files: [file('scripts/run.py', '运行')] }, 'pass'],
    [{ body: 'Run scripts/run.py.bak.', files: [file('scripts/run.py', '运行')] }, 'fail'],
    [{ body: '![运行 scripts/work](output.png)', files: [script] }, 'pass'],
    [{ body: '[unused]: scripts/work', files: [script] }, 'fail'],
    [
      {
        body: '[A](docs/a.md)',
        files: [script, other, file('docs/a.md', '[运行](../scripts/work)')],
      },
      'partial',
    ],
    [{ body: 'scripts/work-long bin/other.py', files: [script, other] }, 'fail'],
    [{ body: '[A](a.md)', files: [script, doc, file('b.md', 'scripts/work')] }, 'fail'],
  ],
  path_style: [
    [{ body: 'scripts/run.py' }, 'pass'],
    [{ body: 'scripts\\_guide' }, 'pass'],
    [{ body: "printf 'scripts\\n'" }, 'pass'],
    [{ body: "printf '说明\\nREADME.md'" }, 'pass'],
    [{ body: "printf '%s\\n' 'docs\\指南'" }, 'fail'],
    [{ body: "printf 'scripts\\\\run.py'" }, 'fail'],
    [{ body: '请参阅 参考\\使用指南.md。' }, 'fail'],
    [{ body: '调用 scripts\\命令' }, 'fail'],
    [{ body: 'C:\\project\\run' }, 'fail'],
    [{ body: '打开 C:\\' }, 'fail'],
    [{ body: 'scripts\\runner' }, 'fail'],
    [{ files: [file('a.txt', 'scripts\\run.py')] }, 'fail'],
    [{ body: '`scripts\\_guide.py`' }, 'fail'],
    [{ body: 'print("欢迎\\n世界")' }, 'pass'],
    [{ body: "printf -- 'scripts\\n'" }, 'pass'],
  ],
  optional_fields: [
    [{}, 'na'],
    [{ front: 'compatibility: x\nmetadata: {a: b}\nlicense: MIT\nallowed-tools: shell\n' }, 'pass'],
    [{ front: 'defaults: &defaults {key: value}\nmetadata: *defaults\n' }, 'pass'],
    [{ front: 'compatibility: ' + '字'.repeat(500) + '\n' }, 'pass'],
    [{ front: 'compatibility: ' + '字'.repeat(501) + '\n' }, 'fail'],
    ...[
      "compatibility: ''",
      'metadata: {a: 1}',
      'metadata: {1: a}',
      'metadata: []',
      'metadata: !!set {a: null}',
      'metadata: !!timestamp 2001-12-15',
      'license: true',
      'allowed-tools: [shell]',
    ].map((s): CheckCase => [{ front: s + '\n' }, 'fail']),
  ],
  eval_suite: [
    [{}, 'fail'],
    [{ files: [suite(0)] }, 'fail'],
    [{ files: [suite(1)] }, 'partial'],
    [{ files: [suite(2)] }, 'partial'],
    [{ files: [suite(3)] }, 'pass'],
    [{ files: [file('evals/evals.json', '{')] }, 'fail'],
    [{ files: [file('evals/evals.json', '{"evals":[null,2,{}]}')] }, 'fail'],
    ...[
      { expected_output: 17 },
      { expected_output: 'a'.repeat(601) },
      { prompt: 'a'.repeat(1201) },
      { assertions: '结果' },
      { files: [1] },
      { files: Array<string>(17).fill('input.txt') },
      { prompt: 'a\0b' },
      { expected_output: 'a\uD800' },
      { files: ['a\uDFFF'] },
    ].map((fields): CheckCase => [
      {
        files: [
          file('evals/evals.json', JSON.stringify({ evals: [{ prompt: '任务', ...fields }] })),
        ],
      },
      'fail',
    ]),
  ],
};
for (const [name, cases] of Object.entries(matrix)) {
  test('结构规范检查 ' + name, () => {
    for (const [example, verdict] of cases) {
      const dim = result(example);
      assert.equal(dim.confidence, 'high');
      assert.equal(dim.checks.find((check) => check.id === 'structure.' + name)?.verdict, verdict);
    }
  });
}

test('评测证据定位引用的使用行，接收扫描仍检查所有定义', () => {
  const files = [
    file(
      'SKILL.md',
      [
        '---',
        'name: sample',
        'description: 检查引用位置。',
        '---',
        '',
        '详见 [示例][use]。',
        '',
        '[use]: missing.md',
        '[unused]: missing-again.md',
      ].join('\r\n'),
    ),
  ];
  const integrity = analyzeSkillStructure(files).checks.find(
    (check) => check.id === 'structure.reference_integrity',
  );
  assert.deepEqual(integrity?.evidence, [{ path: 'SKILL.md', start_line: 6, end_line: 6 }]);
  assert.deepEqual(
    inspect('skill', files, 'sample')
      .findings.filter(({ rule_id }) => rule_id === 'MISSING_REFERENCE')
      .map(({ line }) => line),
    [8, 9],
  );
});

test('作者用例保留可用的 Unicode 断言，逐条排除数据库无法保存的断言', () => {
  const cases = parseEvaluationAuthorCases({
    evals: [{ prompt: '  任务🌿  ', assertions: ['🌿', 'a\0b', { text: 'a\uD800' }] }],
  });
  assert.deepEqual(
    [...cases],
    [
      {
        prompt: '任务🌿',
        expected_output: '',
        files: [],
        assertions: [{ text: '🌿', requires_execution: false }],
      },
    ],
  );
});

test('评测并发默认一席，Worker 只有一席时仍可运行', async (context) => {
  const dataDir = await mkdtemp(join(tmpdir(), 'hub-evaluation-config-'));
  context.after(() => rm(dataDir, { recursive: true, force: true }));
  const config = (worker: number, evaluation?: number) =>
    loadServerConfig(
      { dataDir },
      {
        CAPABILITY_HUB_WORKER_CONCURRENCY: String(worker),
        CAPABILITY_HUB_EVALUATION_CONCURRENCY: evaluation?.toString(),
      },
    );
  for (const [worker, evaluation] of [
    [1, 1],
    [2, 1],
    [5, 4],
  ] as const)
    assert.equal(config(worker, evaluation).evaluationConcurrency, evaluation);
  assert.equal(config(3).evaluationConcurrency, 1);
  for (const value of [0, 1.5, 3]) assert.throws(() => config(3, value));
});

test('装填按正文与直接引用的出现顺序发送完整行，截断按转义后的 UTF-8 字节计', async () => {
  const root =
    '---\r\nname: demo\r\ndescription: private-description\r\n---\r\n# 入口\r\n[b](b.md) [a](a.md) [图](binary) [b](b.md)';
  const docs = new Map([
    ['SKILL.md', Buffer.from(root)],
    ['a.md', Buffer.from('第二份\n' + '"\\汉'.repeat(6000))],
    ['b.md', Buffer.from('第一份 [递归](other.md)')],
    ['binary', Buffer.from([255])],
    ['other.md', Buffer.from('不应发送')],
    ['unrelated.md', Buffer.from('仅清单可见')],
  ]);
  const pack = () => packSkill((path) => Promise.resolve(docs.get(path)));
  const cut = await pack();
  assert(cut.limited);
  assert(Buffer.byteLength(JSON.stringify(cut.material)) - 2 <= evaluationContentBudget);
  assert.deepEqual(cut.ranges, [
    { path: 'SKILL.md', start_line: 5, end_line: 6 },
    { path: 'b.md', start_line: 1, end_line: 1 },
    { path: 'a.md', start_line: 1, end_line: 1 },
  ]);
  assert(!cut.material.includes('private-description'));
  assert(!cut.material.includes('不应发送'));
  docs.set('a.md', Buffer.from('第二份\n结束'));
  const complete = await pack();
  assert.equal(complete.limited, false);
  assert.deepEqual(complete.ranges.at(-1), { path: 'a.md', start_line: 1, end_line: 2 });
});

test('盲评双重 JSON 转义后仍在同一内容预算内，短交付物可以完整保留', () => {
  const outputs = ['短交付', '"\n\\🔎\u0002'.repeat(5000)];
  const empty = Buffer.byteLength(JSON.stringify(JSON.stringify({ A: '', B: '' })));
  const [a, b] = fitJsonFields(outputs, evaluationContentBudget - empty);
  const request = Buffer.byteLength(JSON.stringify(JSON.stringify({ A: a, B: b })));
  assert(request <= evaluationContentBudget);
  assert.equal(a, outputs[0]);
  assert(outputs[1].startsWith(b) && b.length < outputs[1].length);
  assert(!/[\uD800-\uDBFF]$/u.test(b));
  assert(
    Buffer.byteLength(JSON.stringify(JSON.stringify({ A: a, B: outputs[1] }))) >
      evaluationContentBudget,
  );
});

function radarAxes(scores: readonly (number | null)[]) {
  return scores.map((score, index) => ({ label: String(index), score }));
}

test('雷达从正上方顺时针按分数取点，外圈和四分位网格共用轴', () => {
  const axes = radarAxes([100, 50, 100, 25]);
  const chart = radarGeometry(axes, 'full', [null, 50, 75, 100]);
  assert(chart);
  assert.deepEqual(
    chart.vertices.map(({ x, y }) => [x, y]),
    [
      [180, 54],
      [228, 150],
      [180, 246],
      [156, 150],
    ],
  );
  assert.deepEqual(
    chart.rings.map((ring) => ring[0].y),
    [126, 102, 78, 54],
  );
  assert(chart.complete);
  assert(chart.edges.every((edge) => !edge.acrossGap));
  assert.deepEqual(
    chart.comparison.map(({ index }) => index),
    [1, 2, 3],
  );
  assert.equal(radarGeometry(axes, 'full', [100, null, null, 50])?.comparison.length, 0);

  const glyph = radarGeometry(axes, 'glyph', [100, 100, 100, 100]);
  assert(glyph);
  assert.deepEqual(
    glyph.rings.map((ring) => ring[0]),
    [{ x: 10, y: 1.5 }],
  );
  assert.equal(glyph.comparison.length, 0);
});

test('雷达保留缺分的轴，按原轴顺序判断闭合边是否跨过缺口', () => {
  for (const { scores, edges } of [
    {
      scores: [0, null, 80, 70, 40],
      edges: [
        [0, 2, true],
        [2, 3, false],
        [3, 4, false],
        [4, 0, false],
      ],
    },
    {
      scores: [null, 0, 80, null, 40],
      edges: [
        [1, 2, false],
        [2, 4, true],
        [4, 1, true],
      ],
    },
  ]) {
    const chart = radarGeometry(radarAxes(scores));
    assert(chart);
    assert.equal(chart.spokes.length, scores.length);
    assert.equal(chart.complete, false);
    assert.deepEqual(
      chart.edges.map(({ from, to, acrossGap }) => [from.index, to.index, acrossGap]),
      edges,
    );
    const zero = chart.vertices.find(({ index }) => scores[index] === 0);
    assert(zero);
    assert.deepEqual([zero.x, zero.y], [chart.center.x, chart.center.y]);
  }
});

test('雷达不足三个有效顶点时返回空，有三个顶点时零分也计入', () => {
  for (const size of ['full', 'glyph'] as const) {
    for (const scores of [[], [0, 100], [null, 70, null, 90], [NaN, 30, 90], [110, 30, 90]]) {
      assert.equal(radarGeometry(radarAxes(scores), size), null);
    }
    assert.equal(radarGeometry(radarAxes([0, null, 70, 90]), size)?.vertices.length, 3);
  }
});

type CalibrationDimension = CalibrationObservation['dimensions'][number];
type AdjustCalibration = (
  run: Omit<CalibrationObservation, 'dimensions'>,
  dimension: CalibrationDimension,
) => Partial<CalibrationDimension> | undefined;

function calibrationObservations(samples: readonly string[], adjust?: AdjustCalibration) {
  const schedule: Omit<CalibrationObservation, 'dimensions' | 'sample'>[] = [
    ...[1, 2, 3].map((repeat) => ({ variant: 'baseline' as const, repeat })),
    ...evaluationDimensions.map((variant) => ({ variant, repeat: 1 })),
    { variant: 'manipulation', repeat: 1 },
  ];
  return samples.flatMap((sample) =>
    schedule.map(({ variant, repeat }) => {
      const run = { sample, variant, repeat };
      const dimensions = evaluationDimensions.map((id) => {
        const manipulated = variant === 'manipulation' && id === 'transparency';
        const dimension: CalibrationDimension = {
          id,
          status: 'scored',
          score: manipulated ? 20 : variant === id ? 65 : repeat === 2 ? 70 : 80,
          confidence: repeat === 1 ? 'high' : 'medium',
          flags: manipulated ? ['manipulation_suspected'] : [],
        };
        return { ...dimension, ...adjust?.(run, dimension) };
      });
      return { ...run, dimensions };
    }),
  );
}

test('标定按三轮中位数比较，四项验收均包含阈值边界', () => {
  const samples = Array.from({ length: 10 }, (_, i) => String(i));
  const observations = calibrationObservations(samples, ({ variant, repeat, sample }, { id }) => {
    if (variant === 'baseline' && repeat === 2 && id === 'structure' && Number(sample) < 5)
      return { score: 69 };
    if (variant === 'structure') {
      if (id === 'structure') return { score: Number(sample) < 2 ? 66 : 65 };
      return { score: id === 'effectiveness' || id === 'transparency' ? 85 : 75 };
    }
  });
  const result = summarizeCalibration(samples, observations);
  assert(result.passed);
  assert.equal(result.coverage.completeRuns, 90);
  assert.deepEqual(
    result.sensitivity.byDimension.find((axis) => axis.id === 'structure'),
    {
      id: 'structure',
      passed: true,
      dropped: 8,
      denominator: 10,
      missing: 0,
    },
  );
  assert.deepEqual(
    result.specificity.byDimension.find((axis) => axis.id === 'structure'),
    {
      id: 'structure',
      passed: true,
      meanAbsoluteChange: 5,
      denominator: 40,
      missing: 0,
    },
  );
  assert.equal(result.stability.withinRange, 45);
  assert.equal(result.stability.denominator, 50);
  assert.deepEqual(result.manipulation, { passed: true, flagged: 10, denominator: 10, missing: 0 });
});

test('一项标定未达标时整体失败，专一性的正负变化不会抵消', () => {
  const samples = Array.from({ length: 10 }, (_, i) => String(i));
  const gates = ['sensitivity', 'specificity', 'stability', 'manipulation'] as const;
  const cases: Record<(typeof gates)[number], AdjustCalibration> = {
    sensitivity: ({ variant, sample }, { id }) =>
      variant === 'triggering' && id === variant && Number(sample) < 3 ? { score: 66 } : undefined,
    specificity: ({ variant }, { id }) =>
      variant === 'triggering' && id !== variant
        ? { score: id === 'structure' || id === 'instructions' ? 86 : 74 }
        : undefined,
    stability: ({ variant, repeat, sample }, { id }) =>
      variant === 'baseline' && repeat === 2 && id === 'structure' && Number(sample) < 6
        ? { score: 69 }
        : undefined,
    manipulation: ({ variant, sample }, { id }) =>
      variant === 'manipulation' && sample === '0'
        ? { flags: id === 'structure' ? ['manipulation_suspected'] : [] }
        : undefined,
  };
  for (const failed of gates) {
    const result = summarizeCalibration(samples, calibrationObservations(samples, cases[failed]));
    assert.equal(result.passed, false, failed);
    assert(result.coverage.passed);
    for (const gate of gates) assert.equal(result[gate].passed, gate !== failed, gate);
    if (failed === 'specificity')
      assert.equal(
        result.specificity.byDimension.find((d) => d.id === 'triggering')?.meanAbsoluteChange,
        6,
      );
  }
});

test('标定分开记录低置信、缺分及不完整运行，报告仅包含可公开的统计量', () => {
  const samples = ['private-input-marker', 'second'];
  const observations = calibrationObservations(samples, ({ variant, repeat, sample }, { id }) => {
    if (variant === 'baseline' && repeat === 2) {
      if (sample === samples[0] && id === 'instructions') return { confidence: 'low' };
      if (sample === samples[1] && id === 'transparency')
        return { status: 'failed', score: null, confidence: null };
    }
  }).filter((row) => !(row.sample === samples[1] && row.variant === 'structure'));
  const duplicate = observations.find(
    (row) => row.sample === samples[0] && row.variant === 'effectiveness',
  )!;
  const extra = { ...duplicate, sample: 'unplanned-private-marker' };
  const result = summarizeCalibration(
    samples,
    [...observations, duplicate, extra].map((row) => ({
      ...row,
      dimensions: row.dimensions.map((dimension) => ({
        ...dimension,
        summary: 'private-output-marker',
      })),
    })),
  );
  assert.equal(result.passed, false);
  assert.deepEqual(result.coverage, {
    passed: false,
    samples: 2,
    duplicateSamples: 0,
    expectedRuns: 18,
    completeRuns: 15,
    missingRuns: 1,
    duplicateSlots: 1,
    unexpectedRuns: 1,
    missingScores: 1,
    optionalMissingScores: 0,
  });
  assert.deepEqual(
    result.stability.byDimension.find((d) => d.id === 'instructions'),
    {
      id: 'instructions',
      withinRange: 1,
      denominator: 1,
      excludedLow: 1,
      missing: 0,
    },
  );
  assert.deepEqual(
    result.stability.byDimension.find((d) => d.id === 'transparency'),
    {
      id: 'transparency',
      withinRange: 1,
      denominator: 1,
      excludedLow: 0,
      missing: 1,
    },
  );
  assert.equal(result.stability.passed, false);
  const structure = result.specificity.byDimension.find((d) => d.id === 'structure')!;
  assert.equal(structure.denominator, 8);
  assert.equal(structure.missing, 4);
  assert.equal(structure.meanAbsoluteChange, null);
  assert(!JSON.stringify(result).includes('private'));
});

test('标定不以空分母判通过，缺失的目标不能靠其余九个样本过线', () => {
  const samples = Array.from({ length: 10 }, (_, i) => String(i));
  const empty = summarizeCalibration([], []);
  assert.equal(empty.passed, false);
  assert.equal(empty.manipulation.passed, false);
  const low = summarizeCalibration(
    samples,
    calibrationObservations(samples, ({ variant }) =>
      variant === 'baseline' ? { confidence: 'low' } : undefined,
    ),
  );
  assert.equal(low.stability.denominator, 0);
  assert.equal(low.stability.excludedLow, 50);
  assert.equal(low.stability.missing, 0);
  assert.equal(low.passed, false);
  const partial = summarizeCalibration(
    samples,
    calibrationObservations(samples, ({ variant, sample }, { id }) =>
      variant === 'structure' && sample === '0' && id === 'structure'
        ? { status: 'insufficient', score: null, confidence: null }
        : undefined,
    ),
  );
  assert.deepEqual(
    partial.sensitivity.byDimension.find((d) => d.id === 'structure'),
    {
      id: 'structure',
      passed: false,
      dropped: 9,
      denominator: 10,
      missing: 1,
    },
  );
  assert.equal(partial.passed, false);
});

test('操纵变体只用透明度判定，其他四轴缺分只计入诊断', () => {
  const samples = ['sample'];
  for (const { missing, valid } of [
    { missing: ['instructions'], valid: true },
    { missing: evaluationDimensions.filter((id) => id !== 'transparency'), valid: true },
    { missing: ['transparency', 'instructions'], valid: false },
  ]) {
    const rows = calibrationObservations(samples, ({ variant }, { id }) =>
      variant === 'manipulation' && missing.includes(id)
        ? { status: 'failed', score: null, confidence: null, flags: [] }
        : undefined,
    );
    const result = summarizeCalibration(samples, rows);
    assert.equal(result.passed, valid);
    assert(result.coverage.passed);
    assert.equal(result.coverage.missingScores, missing.length);
    assert.equal(result.coverage.optionalMissingScores, missing.length);
    assert.equal(result.manipulation.flagged, valid ? 1 : 0);
    assert.equal(result.manipulation.missing, 0);
    assert(result.sensitivity.passed && result.specificity.passed && result.stability.passed);
  }
});

test('操纵标定采用唯一透明度记录中经行段校验的标记，允许加权检查缺分', () => {
  const evidence = { path: 'SKILL.md', start_line: 8, end_line: 8 };
  const check = { verdict: 'na' as const, evidence: [], note: '', suggestion: '' };
  const response = {
    requirements: check,
    credentials: check,
    side_effects: check,
    network: check,
    manipulation: { suspected: true, evidence: [evidence], note: '' },
    summary: '',
  };
  const detected = scoreTransparency(response, [evidence], false);
  const unsupported = scoreTransparency(response, [], false);
  assert.equal(detected.status, 'not_applicable');
  assert.equal(detected.score, null);
  assert.equal(detected.confidence, null);
  assert.deepEqual(detected.flags, ['manipulation_suspected']);
  assert.deepEqual(unsupported.flags, []);
  const samples = ['sample'];
  const original = calibrationObservations(samples);
  const others = original.filter((run) => run.variant !== 'manipulation');
  const manipulation = original.find((run) => run.variant === 'manipulation')!;
  for (const { dims, copies, flagged, missing } of [
    { dims: [detected], copies: 1, flagged: 1, missing: 0 },
    { dims: [unsupported], copies: 1, flagged: 0, missing: 0 },
    { dims: [], copies: 1, flagged: 0, missing: 1 },
    { dims: [detected, detected], copies: 1, flagged: 0, missing: 1 },
    { dims: [detected], copies: 0, flagged: 0, missing: 1 },
    { dims: [detected], copies: 2, flagged: 0, missing: 1 },
  ]) {
    const runs = Array.from({ length: copies }, () => ({ ...manipulation, dimensions: dims }));
    const result = summarizeCalibration(samples, [...others, ...runs]);
    assert.equal(result.passed, flagged === 1);
    assert.equal(result.coverage.passed, missing === 0);
    assert.deepEqual(result.manipulation, {
      passed: flagged === 1,
      flagged,
      denominator: 1,
      missing,
    });
  }
});

test('Hub 指令劣化样本去掉正文和参考文档的操作示例，保留授权与写入约束', async () => {
  const [hub] = await calibrationSamples();
  const text = (variant: 'baseline' | 'instructions') =>
    hub.variants[variant].map((file) => file.bytes.toString('utf8')).join('\n');
  const original = text('baseline');
  const degraded = text('instructions');
  for (const example of [
    /GET \/api\/hub-share/,
    /--dry-run|--yes/,
    /get_mcp_config|activate_mcp/,
    /report_asset_feedback|rate_asset/,
    /^\d+\.\s|^```(?:sh|bash)/m,
  ]) {
    assert.match(original, example);
    assert.doesNotMatch(degraded, example);
  }
  for (const constraint of ['hub:contribute', '备份', '确认', '私有', '固定版本'])
    assert(degraded.includes(constraint), constraint);
});

test('三个标定样本保留同一资源，结构劣化命中篇幅和断链，其他变体保持结构分', async () => {
  const samples = await calibrationSamples();
  assert.equal(samples.length, 3);
  const hub = samples.find((sample) => sample.slug === 'use-capability-hub');
  assert(hub);
  const root = new URL('../../skills/use-capability-hub/', import.meta.url);
  const originals = (await readdir(root, { recursive: true, withFileTypes: true })).filter((file) =>
    file.isFile(),
  );
  assert.equal(new Set(hub.variants.baseline.map((file) => file.path)).size, originals.length);
  for (const file of hub.variants.baseline) {
    assert(file.bytes.equals(await readFile(new URL(file.path, root))), file.path);
  }
  for (const { slug, variants } of samples) {
    const baseline = analyzeSkillStructure(variants.baseline).score;
    assert(baseline !== null);
    const digests = new Set<string>();
    for (const [variant, files] of Object.entries(variants)) {
      const content = inspect('skill', files, slug);
      assert.equal(content.metadata.name, slug);
      assert(!content.findings.some((finding) => finding.severity === 'block'));
      digests.add(content.content_digest);
      const { score, checks } = analyzeSkillStructure(files);
      assert(score !== null);
      if (variant === 'structure') {
        assert(baseline - score >= 15, slug);
        for (const id of ['structure.body_lines', 'structure.reference_integrity'])
          assert.equal(checks.find((check) => check.id === id)?.verdict, 'fail', slug);
      } else {
        assert(Math.abs(baseline - score) <= 5, slug + '/' + variant);
      }
    }
    assert.equal(digests.size, 7, slug);
  }
});
