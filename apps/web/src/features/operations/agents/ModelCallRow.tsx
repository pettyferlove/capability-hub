import type { AiExecutionDiagnosticsResponse } from '@capability-hub/contracts';
import { stepLabels } from '../../ai/presentation.js';

type Call = AiExecutionDiagnosticsResponse['model_calls'][number];
type Transport = Call['diagnostics']['transport'];

const callStatus = {
  pending: '待结算',
  succeeded: '已成功',
  failed: '失败',
  unknown: '用量待核实',
};
const stopLabels = {
  stop: '正常停止',
  length: '达到长度限制',
  tool_call: '请求调用工具',
  content_filter: '内容过滤',
  context_limit: '达到上下文上限',
  other: '其他停止原因',
};

function transportSummary(data: Transport) {
  if (!data) return '请求配置';
  if (data.request_timed_out) {
    if (data.headers_ms === undefined) return '等待响应头时超时';
    if (data.terminal_received) return '收到终止帧后超时';
    if (data.finish_reason) return '模型停止后等待终止帧时超时';
    return data.first_output_ms === undefined ? '等待首个模型输出时超时' : '收到模型输出后超时';
  }
  if (data.http_status && data.http_status >= 400) return 'HTTP ' + data.http_status;
  if (!data.terminal_received) return '未收到终止帧';
  return data.finish_reason ? stopLabels[data.finish_reason] : '传输明细';
}

function ms(value: number | undefined) {
  return value === undefined ? '—' : value + ' ms';
}

/** 输入和输出用量独立上报，预留时的零值不能作为已知用量。 */
export function ModelCallRow({ call, locate }: { call: Call; locate: (seq: number) => void }) {
  const { diagnostics } = call;
  const { step, transport } = diagnostics;
  return (
    <tr>
      <td>
        {call.profile}
        <small className="block font-mono">{call.id}</small>
        <time
          className="block text-caption text-muted-ink"
          dateTime={call.started_at}
          title={call.started_at}
        >
          {new Date(call.started_at).toLocaleTimeString()}
        </time>
      </td>
      <td>
        调度 {call.attempt}
        {step && (
          <button
            type="button"
            className="block text-brand underline"
            onClick={() => locate(step.start_seq)}
          >
            {stepLabels[step.id] ?? step.id} · #{step.start_seq}
          </button>
        )}
      </td>
      <td>{callStatus[call.status]}</td>
      <td>
        {call.status === 'pending' || (call.status === 'unknown' && !call.duration_ms)
          ? '—'
          : ms(call.duration_ms)}
      </td>
      <td>
        {transport?.input_tokens_reported ? call.input_tokens : '—'} /{' '}
        {transport?.output_tokens_reported ? call.output_tokens : '—'}
      </td>
      <td>
        {call.error_code}
        <details>
          <summary className="cursor-pointer text-brand">{transportSummary(transport)}</summary>
          <div className="space-y-1 py-2 text-caption text-muted-ink">
            <p>
              {diagnostics.agent_id} · {diagnostics.format} · {diagnostics.model}
            </p>
            <p>
              单次时限 {ms(diagnostics.request_timeout_ms)} · 输出上限{' '}
              {diagnostics.max_output_tokens} token
              {diagnostics.reasoning_effort === 'none'
                ? ' · 请求关闭思考'
                : diagnostics.reasoning_effort && ` · 请求思考强度 ${diagnostics.reasoning_effort}`}
            </p>
            {transport && (
              <>
                <p>
                  HTTP {transport.http_status ?? '—'} · 响应头 {ms(transport.headers_ms)}
                </p>
                <p>
                  首个输出 {ms(transport.first_output_ms)} · 最后输出 {ms(transport.last_output_ms)}
                </p>
                <p>
                  接收 {transport.received_bytes} 字节 · 正文 {transport.text_chars} 个 UTF-16 码元
                </p>
                <p>
                  停止原因{' '}
                  {transport.finish_reason ? stopLabels[transport.finish_reason] : '未收到'} ·
                  终止帧{transport.terminal_received ? '已收到' : '未收到'}
                </p>
              </>
            )}
          </div>
        </details>
      </td>
    </tr>
  );
}
