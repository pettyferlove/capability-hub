import { createServer, type IncomingMessage } from 'node:http';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import type { TestContext } from 'node:test';
import { modelProfileSchema, type ModelProfile } from '@capability-hub/ai';

/** 环回端点实际收到的请求；正文可能是 JSON 或原始字符串，须在断言前区分。 */
export interface StubRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

/** `json` 由端点编码；SSE 使用原始 `body` 和显式 Content-Type，保留帧间空行。 */
export interface StubReply {
  status?: number;
  json?: unknown;
  body?: string | Buffer;
  headers?: Record<string, string>;
  gzip?: boolean;
  /** 不回任何响应，直到客户端断开或服务关闭。 */
  hang?: boolean;
  redirectTo?: string;
}

/** 处理器可在回包前等待测试闸门，使取消或权限变化发生在请求途中。 */
export type StubHandler = (request: StubRequest, index: number) => StubReply | Promise<StubReply>;

interface Usage {
  input: number;
  output: number;
  reasoning?: number;
}

function chatUsage(usage: Usage) {
  return {
    prompt_tokens: usage.input,
    completion_tokens: usage.output,
    total_tokens: usage.input + usage.output,
    ...(usage.reasoning !== undefined && {
      completion_tokens_details: { reasoning_tokens: usage.reasoning },
    }),
  };
}

/** 非流式 Chat Completions 响应；字符串原样作为 `content`，便于构造非法 JSON。 */
export function openAiJson(content: unknown, usage: Usage = { input: 11, output: 7 }) {
  return {
    id: 'chatcmpl-stub',
    object: 'chat.completion',
    created: 1,
    model: 'stub-model',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: typeof content === 'string' ? content : JSON.stringify(content),
        },
        finish_reason: 'stop',
      },
    ],
    usage: chatUsage(usage),
  };
}

/**
 * 流式 Chat Completions 响应：把 `content` 的 JSON 文本按 `size` 个字符切成增量帧，
 * 末帧带结束原因与用量，最后是 `[DONE]`。
 */
export function openAiStream(
  content: unknown,
  {
    size = 12,
    usage = { input: 11, output: 7 },
    finishReason = 'stop',
  }: { size?: number; usage?: Usage; finishReason?: 'stop' | 'length' | 'content_filter' } = {},
): StubReply {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const frame = (delta: object) =>
    `data: ${JSON.stringify({
      id: 'chatcmpl-stub',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'stub-model',
      choices: [{ index: 0, delta, finish_reason: null }],
    })}\n\n`;
  const frames = [frame({ role: 'assistant', content: '' })];
  for (let index = 0; index < text.length; index += size)
    frames.push(frame({ content: text.slice(index, index + size) }));
  frames.push(
    `data: ${JSON.stringify({
      id: 'chatcmpl-stub',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'stub-model',
      choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
      usage: chatUsage(usage),
    })}\n\n`,
    'data: [DONE]\n\n',
  );
  return { headers: { 'content-type': 'text/event-stream' }, body: frames.join('') };
}

/**
 * Anthropic Messages 响应。SDK 按模型能力选择原生 `output_config.format`（回文本）或名为
 * `json` 的强制工具；传入 `request` 时按其是否声明了 `json` 工具选择对应形状。
 */
export function anthropicJson(
  content: unknown,
  options: { usage?: Usage; request?: StubRequest } = {},
) {
  const { usage = { input: 11, output: 7 }, request } = options;
  const body = request?.body;
  const tools =
    body && typeof body === 'object' && 'tools' in body && Array.isArray(body.tools)
      ? (body.tools as { name?: unknown }[])
      : [];
  const useTool = tools.some((tool) => tool.name === 'json');
  return {
    id: 'msg_stub',
    type: 'message',
    role: 'assistant',
    model: 'stub-model',
    content: useTool
      ? [{ type: 'tool_use', id: 'toolu_stub', name: 'json', input: content }]
      : [{ type: 'text', text: typeof content === 'string' ? content : JSON.stringify(content) }],
    stop_reason: useTool ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: usage.input, output_tokens: usage.output },
  };
}

async function readRequest(req: IncomingMessage): Promise<StubRequest> {
  const buffers: Buffer[] = [];
  for await (const chunk of req) buffers.push(Buffer.from(chunk));
  const text = Buffer.concat(buffers).toString('utf8');
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // 非 JSON 请求体原样保留。
  }
  const headers: StubRequest['headers'] = {};
  for (const [name, value] of Object.entries(req.headers)) headers[name.toLowerCase()] = value;
  return { method: req.method ?? '', path: req.url ?? '', headers, body };
}

let credentialSequence = 0;

/**
 * 在 127.0.0.1 随机端口起一个假模型端点，记录全部请求；测试结束自动关闭并清理凭据环境变量。
 * 默认处理器按路径返回合法的空对象结构化结果。
 */
export async function serveModelStub(context: TestContext, handler?: StubHandler) {
  const requests: StubRequest[] = [];
  let current: StubHandler =
    handler ??
    ((request) => ({
      json: request.path.endsWith('/messages') ? anthropicJson({}, { request }) : openAiJson({}),
    }));
  const server = createServer((req, res) => {
    void (async () => {
      const request = await readRequest(req);
      const index = requests.push(request) - 1;
      const reply = await current(request, index);
      if (reply.hang) return;
      if (reply.redirectTo) {
        res.writeHead(reply.status ?? 307, { location: reply.redirectTo, ...reply.headers });
        res.end();
        return;
      }
      let payload: string | Buffer =
        reply.json !== undefined ? JSON.stringify(reply.json) : (reply.body ?? '');
      const headers: Record<string, string> = {
        'content-type': reply.json !== undefined ? 'application/json' : 'text/plain',
        ...reply.headers,
      };
      if (reply.gzip) {
        payload = gzipSync(payload);
        headers['content-encoding'] = 'gzip';
      }
      res.writeHead(reply.status ?? 200, headers);
      res.end(payload);
    })().catch((error: unknown) => {
      res.destroy(error instanceof Error ? error : undefined);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('stub server has no port');
  const origin = `http://127.0.0.1:${address.port}`;
  const credentialRef = `MODEL_STUB_KEY_${process.pid}_${++credentialSequence}`;
  const credential = `stub-secret-${credentialSequence}`;
  process.env[credentialRef] = credential;
  context.after(async () => {
    delete process.env[credentialRef];
    server.closeAllConnections();
    server.close();
    await once(server, 'close').catch(() => undefined);
  });
  return {
    origin,
    requests,
    credential,
    credentialRef,
    setHandler(next: StubHandler) {
      current = next;
    },
    profile(format: 'openai' | 'anthropic', overrides: Record<string, unknown> = {}): ModelProfile {
      return modelProfileSchema.parse({
        id: `stub-${format}`,
        label: `Stub ${format}`,
        format,
        base_url: `${origin}/v1`,
        model: format === 'anthropic' ? 'claude-stub' : 'stub-model',
        credential_ref: credentialRef,
        allow_http: true,
        ...overrides,
      });
    },
  };
}
