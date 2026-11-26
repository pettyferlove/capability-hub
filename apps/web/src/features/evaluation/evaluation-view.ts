import type {
  EvaluationResponse,
  EvaluationSummaryResponse,
  ManagementEvaluationsResponse,
} from '@capability-hub/contracts';

/** 雷达与清单共用固定轴序；早期结果缺失的轴保留空值。 */
export type Evaluation = NonNullable<EvaluationResponse['evaluation']>;

/** 维护结果沿用公开字段，并携带已按读者范围裁剪的逐项证据。 */
export type EvaluationDetail = ManagementEvaluationsResponse['items'][number];

type Dimension = Evaluation['dimensions'][number];
type DetailedCheck = EvaluationDetail['dimensions'][number]['checks'][number];

const axisNames = {
  structure: '结构规范',
  triggering: '触发准确',
  instructions: '指令质量',
  effectiveness: '任务效果',
  transparency: '边界透明',
} as const;
const axisOrder = Object.keys(axisNames) as (keyof typeof axisNames)[];

/** 服务端返回的等级、置信度和状态直接映射为可读词汇。 */
export const labels = {
  excellent: '优秀',
  good: '良好',
  fair: '待改进',
  weak: '薄弱',
  high: '高置信度',
  medium: '中置信度',
  low: '低置信度',
  pass: '满足',
  partial: '部分满足',
  fail: '未满足',
  na: '不适用',
  pending: '未评估',
  failed: '失败',
  insufficient: '样本不足',
  not_applicable: '不适用',
  coverage_limited: '材料覆盖受限',
  script_unverified: '含脚本未执行',
  manipulation_suspected: '疑似操纵评测',
  limited_uplift: '增益有限',
  negative_uplift: '负增益',
} as const;

/** 按协议枚举补全五维，分数与分级保留服务端结果。 */
export function evaluationDimensions(data: Evaluation): Dimension[] {
  return axisOrder.map(
    (id) =>
      data.dimensions.find((dimension) => dimension.id === id) ?? {
        id,
        label: axisNames[id],
        status: 'pending',
        score: null,
        band: null,
        confidence: null,
        checks: [],
      },
  );
}

/** 卡片与详情共用五个轴位，只统计实际出分的维度。 */
export function evaluationCoverage(data: EvaluationSummaryResponse | Evaluation) {
  let count = 0;
  const axes = axisOrder.map((id) => {
    const dimension = data.dimensions.find((d) => d.id === id);
    const status = dimension && 'status' in dimension ? dimension.status : undefined;
    const score = !status || status === 'scored' ? (dimension?.score ?? null) : null;
    if (score !== null) count++;
    return {
      id,
      label: dimension && 'label' in dimension ? dimension.label : axisNames[id],
      score,
      band: dimension?.band ?? null,
      confidence: dimension?.confidence ?? null,
      statusLabel: status && status !== 'scored' ? labels[status] : score === null ? '未评估' : '',
    };
  });
  return { axes, count };
}

/** 仅详情展示最低项；并列时采用固定轴序。 */
export function evaluationReadings(data: Evaluation) {
  const { axes, count } = evaluationCoverage(data);
  let lowest: (typeof axes)[number] | undefined;
  for (const axis of axes) {
    if (axis.score === null) continue;
    if (axis.score < (lowest?.score ?? Infinity)) lowest = axis;
  }
  const headline = lowest
    ? `${count > 1 ? `${count} 项评测 · 最低 ` : ''}${lowest.label} ${lowest.score} 分`
    : '';
  return { axes, count, lowest, headline };
}

/** 低置信度的纸面判断展示读数，但不作为警示。 */
export function warningBand({ band, confidence }: Pick<Dimension, 'band' | 'confidence'>) {
  return (confidence === 'medium' || confidence === 'high') && (band === 'fair' || band === 'weak')
    ? band
    : null;
}

/** 每个维度只摘出最能解释该次测量的实际计数或判断。 */
export function dimensionBrief(dimension: Dimension) {
  const { metrics, checks } = dimension;
  if (dimension.status !== 'scored') return '';
  if (
    dimension.id === 'triggering' &&
    metrics?.should_total !== undefined &&
    metrics.should_hit !== undefined &&
    metrics.near_miss_total !== undefined &&
    metrics.near_miss_avoided !== undefined
  )
    return (
      '应触发命中 ' +
      metrics.should_hit +
      '/' +
      metrics.should_total +
      ' · 近似请求避开 ' +
      metrics.near_miss_avoided +
      '/' +
      metrics.near_miss_total
    );
  if (dimension.id === 'effectiveness' && metrics?.uplift_pp !== undefined) {
    const change = Number(metrics.uplift_pp.toFixed(1));
    return '较无 Skill ' + (change > 0 ? '+' : '') + change + ' pp';
  }
  if (dimension.id === 'instructions') {
    const gap =
      checks.find((check) => check.verdict === 'fail') ??
      checks.find((check) => check.verdict === 'partial');
    if (gap) return labels[gap.verdict] + ' · ' + gap.label;
  }
  if (!checks.length) return '';
  return [
    checks.length + ' 项检查',
    ...(['pass', 'partial', 'fail', 'na'] as const).flatMap((verdict) => {
      const count = checks.filter((check) => check.verdict === verdict).length;
      return count ? [count + ' 项' + labels[verdict]] : [];
    }),
  ].join(' · ');
}

/** 排序使用服务端给出的权重和双样本均值，旧条目没有均值时取其固定判定。 */
export function suggestions(data: EvaluationDetail) {
  const points: Record<DetailedCheck['verdict'], number> = {
    pass: 1,
    partial: 0.5,
    fail: 0,
    na: 1,
  };
  return data.dimensions
    .flatMap((dimension) =>
      dimension.checks.flatMap((check) =>
        check.suggestion?.trim()
          ? [
              {
                check,
                dimension: dimension.label,
                gain: (check.weight ?? 0) * (1 - (check.value ?? points[check.verdict])),
              },
            ]
          : [],
      ),
    )
    .sort((a, b) => b.gain - a.gain);
}

/** 作业 ID 只作为错误诊断的依据，阶段进度使用业务名称。 */
export function stageLabel(id: string) {
  const stages: Record<string, string> = {
    static: '结构规范',
    'trigger-cases': '触发用例',
    'trigger-routing': '触发路由',
    instructions: '指令质量',
    'task-cases': '纸面用例',
    transparency: '边界透明',
  };
  return stages[id] ?? (/^task-run-[1-4]$/.test(id) ? '纸面任务 ' + id.slice(-1) : id);
}

/** 保留错误码，维护者可将同一次失败与执行记录对应。 */
export function failureLabel(code?: string) {
  const reasons: Record<string, string> = {
    AI_PROVIDER_FAILED: '模型提供方未能完成请求',
    AI_OUTPUT_INVALID: '模型输出未通过校验',
    AI_TIMEOUT: '模型请求超时',
    AI_TIMED_OUT: '模型请求超时',
    EVALUATION_UNAVAILABLE: '版本已不可评测',
    EVALUATOR_CHANGED: '评测标准或评测器已变更',
    EVALUATION_EVIDENCE_INVALID: '有效证据不足',
    BLOB_MISSING: '固定版本的文件不可读取',
    AI_FORBIDDEN: '材料的读取权限已变化',
    AI_NOT_FOUND: '评测所需的输入材料不可用',
    AI_CONFIGURATION: '评测模型配置不可用',
  };
  return code ? (reasons[code] ?? '阶段未能完成') + '（' + code + '）' : '阶段未能完成';
}
