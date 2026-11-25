import type { EvaluationCheckResult, EvaluationDimensionResult } from './models/evaluation.js';

export {
  countEvaluationAuthorCases,
  isEvaluationText,
  parseEvaluationAuthorCases,
  type EvaluationAuthorCase,
} from './evaluation-input.js';

/** 权重、阈值或方法变化时使用新版本，使旧结果只与同标准比较。 */
export const evaluationRubricVersion = '2026-11-25.1';

/** 调度准入按已启用的阶段合计调用数；每个阶段单独持有作业租约。 */
export const evaluationStageRequests = {
  static: 0,
  'trigger-cases': 1,
  'trigger-routing': 16,
  instructions: 2,
  'task-cases': 1,
  'task-run-1': 3,
  'task-run-2': 3,
  'task-run-3': 3,
  'task-run-4': 3,
  transparency: 1,
} as const;

/** 为共享短调用的指令、声明和输出 Schema 保留空间。 */
export const evaluationContentBudget = 20 * 1024;

/** 固定维度顺序也用于缺少分数时的读取投影。 */
export const evaluationDimensions = [
  'structure',
  'triggering',
  'instructions',
  'effectiveness',
  'transparency',
] as const;

/** 结构维度在接收时评测，其他维度保留各自的待评状态。 */
export type EvaluationDimensionId = (typeof evaluationDimensions)[number];

interface RubricCheck {
  id: string;
  label: string;
  weight: number;
  criterion: string;
}

const check = (id: string, label: string, weight: number, criterion: string): RubricCheck => ({
  id,
  label,
  weight,
  criterion,
});

/** 展示标签与权重由平台标准提供，零权重项仅作为闸门。 */
export const evaluationRubric = {
  structure: {
    label: '结构规范',
    checks: [
      check('structure.body_lines', '正文篇幅', 3, '按正文行数判定'),
      check('structure.description_detail', '描述信息量', 1, '按去空白后的字符数判定'),
      check(
        'structure.reference_integrity',
        '引用完整',
        3,
        '全部有效为满足，仅支撑文档有问题为部分满足',
      ),
      check(
        'structure.reference_depth',
        '引用层级',
        2,
        '全部直接引用为满足，最远两跳为部分满足，无支撑文档不适用',
      ),
      check('structure.progressive_disclosure', '渐进披露', 2, '正文简短或拆出被引用的支撑文件'),
      check(
        'structure.script_documentation',
        '脚本说明',
        2,
        '入口或直接引用文档按路径提及脚本，无脚本不适用',
      ),
      check('structure.path_style', '路径写法', 1, '文本中没有 Windows 风格路径'),
      check(
        'structure.optional_fields',
        '可选字段',
        1,
        '兼容性为限长字符串，元数据为字符串映射，许可和工具为字符串，均缺省时不适用',
      ),
      check('structure.eval_suite', '自带用例', 1, '按可解析的用例数量判定'),
    ],
  },
  triggering: {
    label: '触发准确',
    checks: [
      check('triggering.should_hit', '应触发命中', 1, '应触发问句选中目标的比例'),
      check('triggering.near_miss_avoided', '近似请求避开', 1, '近似问句未选中目标的比例'),
    ],
  },
  instructions: {
    label: '指令质量',
    checks: [
      check('instructions.purpose_scope', '目标与范围', 2, '说明目标、适用和不适用的情况'),
      check('instructions.actionable_steps', '步骤可执行', 3, '多步任务有顺序步骤或检查清单'),
      check('instructions.concrete_examples', '具体示例', 2, '提供具体输入、输出或模板'),
      check('instructions.conciseness', '精炼', 2, '省略常识、重复和套话'),
      check('instructions.terminology', '术语一致', 1, '同一概念使用同一名称'),
      check(
        'instructions.freedom_fit',
        '自由度匹配',
        1,
        '易错操作给出确切指令，开放任务保留判断空间',
      ),
      check('instructions.verification', '校验与反馈环', 2, '关键操作有校验，无关键操作不适用'),
      check('instructions.timeless', '时效稳健', 1, '标明已过时的日期或版本断言'),
      check(
        'instructions.script_robustness',
        '脚本健壮',
        2,
        '脚本处理错误并说明依赖，无脚本不适用',
      ),
    ],
  },
  effectiveness: {
    label: '任务效果',
    checks: [
      check(
        'effectiveness.pass_with',
        '带 Skill 断言通过率',
        1,
        '带 Skill 完成任务的有效断言通过率',
      ),
    ],
  },
  transparency: {
    label: '边界透明',
    checks: [
      check('transparency.requirements', '环境与依赖', 2, '说明工具、包、运行时与网络依赖'),
      check(
        'transparency.credentials',
        '凭据与认证',
        3,
        '说明凭据配置方式，与声明一致且无疑似凭据',
      ),
      check('transparency.side_effects', '副作用', 3, '说明写入与系统改动，不可逆操作要求确认'),
      check('transparency.network', '外部访问', 2, '说明外部地址与用途'),
      check('transparency.no_manipulation', '操纵性指令', 0, '出现操纵性指令时限制维度得分'),
    ],
  },
} satisfies Record<EvaluationDimensionId, { label: string; checks: RubricCheck[] }>;

/** 公开指标名只从标准选取，避免借动态键泄露包内文字。 */
export const publicEvaluationMetrics: ReadonlySet<string> = new Set([
  'body_lines',
  'description_chars',
  'support_documents',
  'scripts',
  'documented_scripts',
  'eval_cases',
  'should_hit',
  'should_total',
  'near_miss_avoided',
  'near_miss_total',
  'pass_with',
  'pass_without',
  'uplift_pp',
  'normalized_gain',
  'valid_assertions',
  'total_assertions',
  'invalid_rate',
  'agreement',
]);

/** 边界值属于标准版本，分析器与分级共用这份定义。 */
export const evaluationThresholds = {
  minApplicableRatio: 0.5,
  bands: { excellent: 85, good: 70, fair: 50 },
  structure: {
    bodyLines: { pass: 500, partial: 800 },
    descriptionChars: { pass: 40, partial: 20 },
    progressiveLines: { pass: 200, partial: 300 },
    documentedScripts: { pass: 1, partial: 0.5 },
    compatibilityChars: { min: 1, max: 500 },
    evalCases: { pass: 3, partial: 1 },
  },
  triggering: {
    casesPerKind: 8,
    chinesePerKind: 6,
    englishPerKind: 2,
    minImplicit: 4,
    minPerKind: 6,
    mediumConfidenceCases: 14,
    minChars: 8,
    maxChars: 300,
  },
  instructions: {
    samples: 2,
    maxInvalidWeightRatio: 0.4,
    highAgreement: 0.8,
    mediumAgreement: 0.6,
  },
  effectiveness: {
    cases: 4,
    maxAuthorCases: 2,
    maxAuthorInputBytes: 8192,
    minAssertionsPerCase: 3,
    maxAssertionsPerCase: 5,
    maxQuoteChars: 320,
    minAssertions: 10,
    mediumAssertions: 16,
    maxInvalidRatio: 0.1,
    highBaseline: 0.8,
    limitedUplift: 0.05,
    negativeUplift: -0.1,
  },
  transparency: { manipulationCap: 20 },
} as const;

/** 不适用返回空值，聚合时剔除其权重。 */
export function checkScore(verdict: EvaluationCheckResult['verdict']) {
  return { pass: 1, partial: 0.5, fail: 0, na: null }[verdict];
}

/** 输入为已经取整的维度分，缺分保留为空。 */
export function evaluationBand(score: number | null) {
  if (score === null) return null;
  const { excellent, good, fair } = evaluationThresholds.bands;
  if (score >= excellent) return 'excellent';
  if (score >= good) return 'good';
  if (score >= fair) return 'fair';
  return 'weak';
}

/** 按标准项累计权重，每项只计一次；恰好一半适用仍可评分。 */
export function scoreChecks(
  id: EvaluationDimensionId,
  checks: readonly Pick<EvaluationCheckResult, 'id' | 'verdict'>[],
): Pick<EvaluationDimensionResult, 'status' | 'score'> {
  const verdicts = new Map(checks.map((item) => [item.id, item.verdict]));
  let applicable = 0;
  let weighted = 0;
  let total = 0;
  for (const item of evaluationRubric[id].checks) {
    total += item.weight;
    const value = checkScore(verdicts.get(item.id) ?? 'na');
    if (value === null) continue;
    applicable += item.weight;
    weighted += item.weight * value;
  }
  return applicable < total * evaluationThresholds.minApplicableRatio
    ? { status: 'not_applicable', score: null }
    : { status: 'scored', score: Math.round((100 * weighted) / applicable) };
}

/** 新记录为每一维保留位置，待评维度不占用零分。 */
export function pendingDimensions(): EvaluationDimensionResult[] {
  return evaluationDimensions.map((id) => ({
    id,
    status: 'pending',
    score: null,
    confidence: null,
    checks: [],
  }));
}

function measuredCheck(id: string, value: number): EvaluationCheckResult {
  const verdict = value === 1 ? 'pass' : value === 0 ? 'fail' : 'partial';
  return { id, value, verdict, evidence: [] };
}

/** 应触发与近似请求分别归一化，某类过滤后的数量不会改变其权重。 */
export function triggeringResult(
  hit: number,
  positive: number,
  avoided: number,
  negative: number,
  limited = false,
): EvaluationDimensionResult {
  const limits = evaluationThresholds.triggering;
  const metrics = {
    should_hit: hit,
    should_total: positive,
    near_miss_avoided: avoided,
    near_miss_total: negative,
  };
  const flags = limited ? ['coverage_limited' as const] : [];
  if (Math.min(positive, negative) < limits.minPerKind)
    return {
      id: 'triggering',
      status: 'insufficient',
      score: null,
      confidence: null,
      checks: [],
      metrics,
      flags,
    };

  return {
    id: 'triggering',
    status: 'scored',
    score: Math.round((50 * (hit * negative + avoided * positive)) / (positive * negative)),
    confidence: positive + negative >= limits.mediumConfidenceCases && !limited ? 'medium' : 'low',
    checks: [
      measuredCheck('triggering.should_hit', hit / positive),
      measuredCheck('triggering.near_miss_avoided', avoided / negative),
    ],
    metrics,
    flags,
  };
}

function averageInstructionCheck(
  id: string,
  supported: EvaluationCheckResult[],
): EvaluationCheckResult {
  const values = supported
    .map((item) => checkScore(item.verdict))
    .filter((value) => value !== null);
  const value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
  // 建议采用有据的最弱判定，优先保留支撑这条建议的引用。
  const representative = supported.reduce((weakest, item) =>
    (checkScore(item.verdict) ?? 2) < (checkScore(weakest.verdict) ?? 2) ? item : weakest,
  );
  const ordered = [representative, ...supported.filter((item) => item !== representative)];
  const evidence = new Map(
    ordered.flatMap((item) => item.evidence).map((line) => [JSON.stringify(line), line]),
  );
  return {
    ...representative,
    ...(value === null ? { id, verdict: 'na' as const } : measuredCheck(id, value)),
    evidence: [...evidence.values()].slice(0, 3),
  };
}

/** 两次均无依据的项剔除；只有一次有效时可计分，但无法为两次判定的一致性提供证据。 */
export function instructionResult(
  samples: readonly (readonly EvaluationCheckResult[])[],
  limited: boolean,
  bundledScripts?: number,
): EvaluationDimensionResult {
  let totalWeight = 0;
  let invalidWeight = 0;
  let validWeight = 0;
  let applicableWeight = 0;
  let agreedWeight = 0;
  let points = 0;
  const checks: EvaluationCheckResult[] = [];
  for (const { id, weight } of evaluationRubric.instructions.checks) {
    totalWeight += weight;
    if (id === 'instructions.script_robustness' && bundledScripts === 0) {
      checks.push({ id, verdict: 'na', evidence: [], note: '固定版本的文件清单中没有脚本。' });
      continue;
    }
    const supported = samples
      .map((sample) => sample.find((item) => item.id === id && item.evidence.length > 0))
      .filter((item) => item !== undefined);
    if (!supported.length) {
      invalidWeight += weight;
      checks.push({ id, verdict: 'na', evidence: [] });
      continue;
    }
    validWeight += weight;
    if (
      supported.length === evaluationThresholds.instructions.samples &&
      supported[0].verdict === supported[1].verdict
    )
      agreedWeight += weight;
    const result = averageInstructionCheck(id, supported);
    checks.push(result);
    if (result.value !== undefined) {
      applicableWeight += weight;
      points += weight * result.value;
    }
  }

  const limits = evaluationThresholds.instructions;
  const agreement = validWeight ? agreedWeight / validWeight : undefined;
  const base = {
    id: 'instructions' as const,
    checks,
    flags: limited ? ['coverage_limited' as const] : [],
    ...(agreement !== undefined && { metrics: { agreement } }),
  };
  if (invalidWeight > totalWeight * limits.maxInvalidWeightRatio)
    return {
      ...base,
      status: 'failed',
      score: null,
      confidence: null,
      failure_code: 'EVALUATION_EVIDENCE_INVALID',
    };
  if (applicableWeight < totalWeight * evaluationThresholds.minApplicableRatio)
    return { ...base, status: 'not_applicable', score: null, confidence: null };
  let confidence: EvaluationDimensionResult['confidence'] = 'low';
  if (agreedWeight >= validWeight * limits.highAgreement && !limited) confidence = 'high';
  else if (agreedWeight >= validWeight * limits.mediumAgreement) confidence = 'medium';
  return {
    ...base,
    status: 'scored',
    score: Math.round((100 * points) / applicableWeight),
    confidence,
  };
}

interface AssertionJudgment {
  passed: boolean;
  valid: boolean;
}

/** 每侧无有效引文的判定计为未通过；一对断言须两侧都有有效引文才计入置信度样本。 */
export function effectivenessResult(
  pairs: readonly { with_skill: AssertionJudgment; without_skill: AssertionJudgment }[],
  script: boolean,
  limited: boolean,
): EvaluationDimensionResult {
  const total = pairs.length;
  const flags: NonNullable<EvaluationDimensionResult['flags']> = [];
  if (script) flags.push('script_unverified');
  if (limited) flags.push('coverage_limited');
  if (!total)
    return {
      id: 'effectiveness',
      status: 'insufficient',
      score: null,
      confidence: null,
      checks: [],
      metrics: { total_assertions: 0, valid_assertions: 0 },
      flags,
    };

  const valid = pairs.filter((pair) => pair.with_skill.valid && pair.without_skill.valid).length;
  const withPass = pairs.filter((pair) => pair.with_skill.valid && pair.with_skill.passed).length;
  const withoutPass = pairs.filter(
    (pair) => pair.without_skill.valid && pair.without_skill.passed,
  ).length;
  const withRate = withPass / total;
  const withoutRate = withoutPass / total;
  // 先求通过数之差，避免相减两个近似小数导致阈值等号失效。
  const gain = withPass - withoutPass;
  const delta = gain / total;
  const invalidRate = (total - valid) / total;
  const limits = evaluationThresholds.effectiveness;
  if (withoutRate >= limits.highBaseline && delta <= limits.limitedUplift)
    flags.push('limited_uplift');
  if (delta <= limits.negativeUplift) flags.push('negative_uplift');
  const base = {
    id: 'effectiveness' as const,
    flags,
    checks: [measuredCheck('effectiveness.pass_with', withRate)],
    metrics: {
      valid_assertions: valid,
      total_assertions: total,
      invalid_rate: invalidRate,
      pass_with: withRate,
      pass_without: withoutRate,
      uplift_pp: (100 * gain) / total,
      ...(withoutPass < total && { normalized_gain: gain / (total - withoutPass) }),
    },
  };
  if (valid < limits.minAssertions)
    return { ...base, status: 'insufficient', score: null, confidence: null };
  const medium =
    valid >= limits.mediumAssertions &&
    invalidRate <= limits.maxInvalidRatio &&
    !script &&
    !limited;
  return {
    ...base,
    status: 'scored',
    score: Math.round((100 * withPass) / total),
    confidence: medium ? 'medium' : 'low',
  };
}
