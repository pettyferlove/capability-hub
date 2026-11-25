import type {
  AiCallFailureReason,
  AiExecutionDiagnosticsResponse,
} from '@capability-hub/contracts';

/** 诊断快照中的单次模型调用。 */
export type ModelCall = AiExecutionDiagnosticsResponse['model_calls'][number];

/** 调用的输出结论。 */
export type OutputCheck = NonNullable<ModelCall['output_check']>;

/** 输出结论中的单个字段问题。 */
export type OutputIssue = NonNullable<OutputCheck['issues']>[number];

/** 每类失败原因的名称与优先排查方向。 */
export const callFailures: Record<AiCallFailureReason, { label: string; hint: string }> = {
  request_timeout: {
    label: '单次请求超时',
    hint: '调高该模型档案的 request_timeout_ms，或降低该步骤的推理档位。',
  },
  cancelled: { label: '执行已取消', hint: '查看执行事件，核对取消时间。' },
  execution_timeout: {
    label: '执行窗口已到期',
    hint: '核对整次执行的时限和各步骤耗时，而非单次请求时限。',
  },
  network: { label: '网络连接失败', hint: '检查模型端点、代理和网络；底层错误码见传输明细。' },
  http_error: { label: '端点返回错误状态', hint: '查看 HTTP 状态、上游错误码与错误正文。' },
  rate_limited: { label: '端点限流', hint: '降低并发或调整额度后重试。' },
  stream_incomplete: { label: '响应流提前结束', hint: '检查端点或代理是否提前断开连接。' },
  empty_output: { label: '没有返回正文', hint: '查看推理文本，确认模型是否只输出了推理。' },
  invalid_json: {
    label: '输出不是合法 JSON',
    hint: '对照原文的解析断点，调整提示词中的输出格式要求。',
  },
  schema_mismatch: { label: '字段不合 Schema', hint: '对照字段路径与规则，对齐提示词与 Schema。' },
  output_limit: {
    label: '输出额度用尽',
    hint: '调高 max_output_tokens，或降低推理档位、要求更紧凑的输出。',
  },
  content_filter: { label: '内容过滤', hint: '检查材料或提示词是否触发服务端过滤。' },
  response_too_large: { label: '响应超过大小上限', hint: '要求更紧凑的输出。' },
  host_rejected: { label: '业务规则拒绝', hint: '把该规则写进 Schema 或提示词，让模型看得到。' },
};

const transportReasons: Partial<Record<AiCallFailureReason, true>> = {
  request_timeout: true,
  cancelled: true,
  execution_timeout: true,
  network: true,
  http_error: true,
  rate_limited: true,
  stream_incomplete: true,
};

/** 传输层原因在传输明细旁展示，输出层原因随输出结论展示。 */
export function isTransportFailure(reason: AiCallFailureReason) {
  return !!transportReasons[reason];
}

/** 原因缺失时退回调用推导出的失败原因。 */
export function rejectionLabel(check: OutputCheck, fallback?: AiCallFailureReason) {
  const reason = check.reason ?? fallback;
  return reason ? callFailures[reason].label : '未分类';
}

/** `$` 表示根对象。 */
export function issuePath(path: string) {
  return path === '$' ? '根对象' : path;
}

function bound(text: string, { limit, actual }: OutputIssue) {
  return (
    (limit === undefined ? text : `${text} ${limit}`) +
    (actual === undefined ? '' : `（实际 ${actual}）`)
  );
}

/** 把 Schema 规则码转换为可读说明，未知规则码原样显示。 */
export function issueRule(issue: OutputIssue) {
  switch (issue.code) {
    case 'missing':
      return '缺少字段';
    case 'invalid_type':
      return issue.expected ? `类型不符（期望 ${issue.expected}）` : '类型不符';
    case 'too_big':
      return bound('超过上限', issue);
    case 'too_small':
      return bound('低于下限', issue);
    case 'unrecognized_keys':
      return issue.actual === undefined ? '多出未声明字段' : `多出 ${issue.actual} 个未声明字段`;
    case 'invalid_value':
      return issue.options?.length
        ? `取值不在允许范围（${issue.options.join('/')}）`
        : '取值不在允许范围';
    case 'invalid_union':
      return '不符合任一允许形态';
    case 'custom':
      return '自定义校验未通过';
    default:
      return issue.code;
  }
}

/** 宿主规则的期望值与实际值。 */
export function factsText(facts: OutputCheck['facts']) {
  return Object.entries(facts ?? {})
    .map(([key, value]) => key + '=' + String(value))
    .join(' · ');
}

/** 只有终态明确指向的调用才可用来解释终止原因。 */
export function failingCall(report: AiExecutionDiagnosticsResponse) {
  const callId = report.execution.error?.call_id;
  return callId ? report.model_calls.find((call) => call.id === callId) : undefined;
}
