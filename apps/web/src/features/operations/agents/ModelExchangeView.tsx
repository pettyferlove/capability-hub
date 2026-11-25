import { useEffect, useMemo, useRef } from 'react';
import {
  aiModelExchangeResponseSchema,
  operationsAgentApi,
  type AiModelExchangeResponse,
} from '@capability-hub/contracts';
import { useQuery } from '../../../shared/api/use-query.js';
import { CopyButton } from '../../../shared/components/CopyButton.js';
import { SkeletonBlock, SkeletonRegion } from '../../../shared/components/Skeleton.js';
import { btnStyles } from '../../../shared/styles/recipes.js';
import { cn } from '../../../shared/styles/cn.js';
import { codeStyles, disclosureStyles } from '../../ai/styles.js';

type ExchangeResponse = NonNullable<AiModelExchangeResponse['response']>;
type Json = Exclude<AiModelExchangeResponse['request']['body'], undefined>;
type JsonObject = { [key: string]: Json };
interface Message {
  role: string;
  text: string;
}

const roleLabels: Record<string, string> = {
  system: '系统',
  developer: '开发者',
  user: '用户',
  assistant: '助手',
  tool: '工具',
};
const preStyles = cn(codeStyles, '[overflow-wrap:anywhere]');
const metaStyles = 'flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-ink';

/** 请求体是任意供应商 JSON，只按协议字段逐项读取，保留契约的 JSON 类型。 */
function isJsonObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pretty(value: Json) {
  return JSON.stringify(value, null, 2);
}

/** 两种协议的内容都可能是字符串或分块数组；只把文本块还原为正文，其余块保留 JSON。 */
function contentText(content: Json | undefined): string {
  if (typeof content === 'string') return content;
  if (content === undefined || content === null) return '';
  if (!Array.isArray(content)) return pretty(content);
  return content
    .map((part) =>
      isJsonObject(part) && part.type === 'text' && typeof part.text === 'string'
        ? part.text
        : pretty(part),
    )
    .join('\n\n');
}

/** OpenAI 的 system 位于 messages 内；Anthropic 的 system 是顶层字段。 */
function requestMessages(body: Json | undefined): Message[] {
  if (!isJsonObject(body)) return [];
  const messages: Message[] = [];
  if (body.system !== undefined) messages.push({ role: 'system', text: contentText(body.system) });
  if (Array.isArray(body.messages))
    for (const message of body.messages) {
      if (!isJsonObject(message)) continue;
      const parts = [contentText(message.content)];
      if (message.tool_calls !== undefined) parts.push(pretty(message.tool_calls));
      messages.push({
        role: typeof message.role === 'string' ? message.role : 'unknown',
        text: parts.filter(Boolean).join('\n\n'),
      });
    }
  return messages;
}

function requestParams(body: Json | undefined) {
  if (!isJsonObject(body)) return [];
  const params: [string, string][] = [];
  const add = (label: string, value: Json | undefined) => {
    if (value === undefined || value === null) return;
    params.push([label, typeof value === 'string' ? value : JSON.stringify(value)]);
  };
  const format = [
    body.response_format,
    body.output_format,
    isJsonObject(body.output_config) ? body.output_config.format : undefined,
  ].find(isJsonObject);
  add('模型', body.model);
  add('输出上限', body.max_completion_tokens ?? body.max_tokens ?? body.max_output_tokens);
  if (format) add('输出格式', typeof format.type === 'string' ? format.type : '已指定');
  if (Array.isArray(body.tools)) add('工具', body.tools.length + ' 个');
  add('工具选择', body.tool_choice);
  add('推理档位', body.reasoning_effort);
  add('推理', body.reasoning);
  add('思考', body.thinking);
  if (typeof body.stream === 'boolean') add('流式', body.stream ? '是' : '否');
  add('温度', body.temperature);
  return params;
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <section aria-label={label} className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption font-medium text-muted-ink">{label}</span>
        <CopyButton text={text} label={'复制' + label} />
      </div>
      <pre className={preStyles}>{text || '（空）'}</pre>
    </section>
  );
}

function Collapsed({ label, detail, text }: { label: string; detail?: string; text: string }) {
  return (
    <details className={disclosureStyles}>
      <summary className="text-caption">{detail ? label + ' · ' + detail : label}</summary>
      <div className="space-y-2 p-3">
        <CopyButton text={text} label={'复制' + label} />
        <pre className={preStyles}>{text}</pre>
      </div>
    </details>
  );
}

function RequestPart({ request }: { request: AiModelExchangeResponse['request'] }) {
  const messages = requestMessages(request.body);
  const params = requestParams(request.body);
  const full = request.body === undefined ? request.text : pretty(request.body);
  return (
    <section aria-label="请求" className="min-w-0 space-y-3">
      <h5 className="font-semibold">请求</h5>
      <p className={metaStyles}>
        <span>{request.bytes} 字节</span>
        {request.truncated && <span className="text-warning">请求已截断</span>}
      </p>
      {!!params.length && (
        <dl className="grid gap-2 rounded-xl bg-page p-3 text-caption sm:grid-cols-2 lg:grid-cols-3">
          {params.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-ink">{label}</dt>
              <dd className="font-mono [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {messages.length ? (
        messages.map((message, index) => (
          <TextBlock
            key={index}
            label={`#${index + 1} ${roleLabels[message.role] ?? message.role}`}
            text={message.text}
          />
        ))
      ) : (
        <p className="text-muted-ink">未能从请求体中识别消息，请查看完整请求。</p>
      )}
      {full !== undefined && (
        <Collapsed label={request.body === undefined ? '请求原文' : '完整请求 JSON'} text={full} />
      )}
    </section>
  );
}

function ResponsePart({ response }: { response: ExchangeResponse | null }) {
  if (!response)
    return (
      <section aria-label="响应" className="space-y-2">
        <h5 className="font-semibold">响应</h5>
        <p className="text-muted-ink">未收到响应</p>
      </section>
    );
  return (
    <section aria-label="响应" className="min-w-0 space-y-3">
      <h5 className="font-semibold">响应</h5>
      <p className={metaStyles}>
        <span>停止原因 {response.finish_reason ?? '未收到'}</span>
        {response.response_id && (
          <span className="font-mono [overflow-wrap:anywhere]">响应 ID {response.response_id}</span>
        )}
        {response.truncated && <span className="text-warning">响应已截断</span>}
      </p>
      {response.text ? (
        <TextBlock label="响应正文" text={response.text} />
      ) : (
        <p className="text-muted-ink">没有返回正文。</p>
      )}
      {response.reasoning && (
        <Collapsed
          label="推理文本"
          detail={response.reasoning.length + ' 个字符'}
          text={response.reasoning}
        />
      )}
      {!!response.tool_calls.length && (
        <section aria-label="工具调用" className="min-w-0 space-y-2">
          <span className="text-caption font-medium text-muted-ink">工具调用</span>
          {response.tool_calls.map((call, index) => (
            <div key={call.id ?? index} className="min-w-0 space-y-1">
              <code className="block font-mono text-caption [overflow-wrap:anywhere]">
                {call.name}
              </code>
              <pre className={preStyles}>{call.arguments}</pre>
            </div>
          ))}
        </section>
      )}
      {response.usage !== undefined && (
        <section aria-label="用量" className="min-w-0 space-y-1.5">
          <span className="text-caption font-medium text-muted-ink">用量</span>
          <pre className={preStyles}>{pretty(response.usage)}</pre>
        </section>
      )}
      {response.error_body !== undefined && (
        <TextBlock label="错误正文" text={response.error_body} />
      )}
      {response.raw !== undefined && <Collapsed label="原始响应" text={response.raw} />}
    </section>
  );
}

/** 往返原文按需读取；只有展开时才请求，换调用即换实例。 */
export function ModelExchangeView({
  id,
  executionId,
  callId,
  reveal,
  onClose,
  onUnavailable,
}: {
  id: string;
  executionId: string;
  callId: string;
  /** 只有主动展开才移动焦点，刷新快照不打断当前操作。 */
  reveal: boolean;
  onClose: () => void;
  onUnavailable: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (reveal) heading.current?.focus();
  }, [reveal]);
  const query = useQuery<unknown>(operationsAgentApi.exchange(executionId, callId));
  useEffect(() => {
    if (query.errorStatus === 401 || query.errorStatus === 403 || query.errorStatus === 404)
      onUnavailable();
  }, [query.errorStatus, onUnavailable]);
  const parsed = useMemo(
    () =>
      query.data === undefined ? undefined : aiModelExchangeResponseSchema.safeParse(query.data),
    [query.data],
  );
  const exchange = parsed?.success && parsed.data.call_id === callId ? parsed.data : undefined;
  const error = query.error || (parsed && !exchange ? '往返原文格式无效' : '');
  return (
    <section
      id={id}
      aria-label="往返原文"
      className="min-w-0 space-y-4 rounded-xl border border-[color:var(--line)] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 ref={heading} tabIndex={-1} className="font-semibold">
            往返原文
          </h4>
          <p className="font-mono text-caption text-muted-ink [overflow-wrap:anywhere]">
            {callId}
            {exchange && ' · 留存于 ' + new Date(exchange.captured_at).toLocaleString()}
          </p>
        </div>
        <button type="button" className={btnStyles} onClick={onClose}>
          收起往返原文
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : !exchange ? (
        <SkeletonRegion label="正在读取往返原文…">
          <div className="grid gap-2">
            <SkeletonBlock width="32%" />
            <SkeletonBlock height={120} shape="rect" />
          </div>
        </SkeletonRegion>
      ) : (
        <>
          {!!exchange.resource_refs.length && (
            <p className="text-caption text-muted-ink [overflow-wrap:anywhere]">
              引用资源：{exchange.resource_refs.join('、')}
            </p>
          )}
          <RequestPart request={exchange.request} />
          <ResponsePart response={exchange.response} />
        </>
      )}
    </section>
  );
}
