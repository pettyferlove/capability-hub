import { btnStyles } from '../../../shared/styles/recipes.js';
import { cn } from '../../../shared/styles/cn.js';
import { stepLabels } from '../../ai/presentation.js';
import { callFailures, isTransportFailure, type ModelCall } from './call-failure.js';
import { OutputRejection } from './OutputRejection.js';

type Transport = ModelCall['diagnostics']['transport'];

const callStatus = {
  pending: '待结算',
  succeeded: '已完成',
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
    if (data.terminal_received) return '收到完整响应后超时';
    if (data.finish_reason) return '模型停止后等待响应结束时超时';
    return data.first_output_ms === undefined ? '等待首个模型输出时超时' : '收到模型输出后超时';
  }
  if (data.http_status && data.http_status >= 400) return 'HTTP ' + data.http_status;
  return data.terminal_received && data.finish_reason ? stopLabels[data.finish_reason] : '传输明细';
}

function ms(value: number | undefined) {
  return value === undefined ? '—' : value + ' ms';
}

const exchangeNotes = {
  withheld: '无法确认相关资源的读权，已隐藏原文。',
  none: '未留存原文（首页对话、未开启留存或已过留存期）。',
};

/** 输入和输出用量独立上报，预留时的零值不能作为已知用量。 */
export function ModelCallRow({
  call,
  rowId,
  locate,
  exchange,
}: {
  call: ModelCall;
  /** 终止卡片据此滚动并聚焦到失败调用。 */
  rowId: string;
  locate: (seq: number) => void;
  exchange: {
    open: boolean;
    controls: string;
    disabled: boolean;
    toggle: (trigger: HTMLButtonElement) => void;
  };
}) {
  const { diagnostics, output_check: check, failure_reason: reason } = call;
  const { step, transport } = diagnostics;
  const transportFailure = reason && isTransportFailure(reason) ? callFailures[reason] : undefined;
  return (
    <tr
      id={rowId}
      tabIndex={-1}
      className="focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand"
    >
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
        {diagnostics.recovery_reason && (
          <small className="block">
            追加请求 · {callFailures[diagnostics.recovery_reason].label}
          </small>
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
        {!check ? (
          '—'
        ) : check.status === 'accepted' ? (
          '输出已采纳'
        ) : (
          <OutputRejection check={check} reason={reason} />
        )}
      </td>
      <td>
        {transportFailure && (
          <strong className="block font-medium text-danger">{transportFailure.label}</strong>
        )}
        {call.error_code}
        <details>
          <summary className="cursor-pointer text-brand">{transportSummary(transport)}</summary>
          <div className="space-y-1 py-2 text-caption text-muted-ink">
            {transportFailure && <p className="text-ink">{transportFailure.hint}</p>}
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
                {transport.upstream_error_code && (
                  <p className="min-w-48 break-all">上游错误码 {transport.upstream_error_code}</p>
                )}
                {transport.upstream_request_id && (
                  <p className="min-w-48 break-all">上游请求 ID {transport.upstream_request_id}</p>
                )}
                {transport.network_error && (
                  <p className="min-w-48 break-all">底层错误 {transport.network_error}</p>
                )}
                <p>
                  首个输出 {ms(transport.first_output_ms)} · 最后输出 {ms(transport.last_output_ms)}
                </p>
                <p>
                  {transport.request_bytes !== undefined &&
                    `请求 ${transport.request_bytes} 字节 · `}
                  接收 {transport.received_bytes} 字节 · 正文 {transport.text_chars} 个 UTF-16 码元
                  {transport.reasoning_tokens !== undefined &&
                    ` · 推理 ${transport.reasoning_tokens} token`}
                </p>
                <p>
                  停止原因{' '}
                  {transport.finish_reason ? stopLabels[transport.finish_reason] : '未收到'} ·
                  响应结束{transport.terminal_received ? '已确认' : '未确认'}
                </p>
              </>
            )}
          </div>
        </details>
        {call.exchange === 'available' ? (
          <button
            type="button"
            disabled={exchange.disabled}
            aria-expanded={exchange.open}
            aria-controls={exchange.open ? exchange.controls : undefined}
            className={cn(btnStyles, 'mt-1')}
            onClick={(event) => exchange.toggle(event.currentTarget)}
          >
            查看往返原文
          </button>
        ) : (
          <p className="text-caption text-muted-ink">{exchangeNotes[call.exchange]}</p>
        )}
      </td>
    </tr>
  );
}
