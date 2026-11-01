import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { deferred } from './store.js';
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid fixture request');
  return value as Record<string, unknown>;
}

/** fixture 服务要模拟的协议；两者在鉴权头与响应形状上都不同。 */
export type Format = 'openai' | 'anthropic';

/** 响应模式：`tools` 先回一次工具调用再回文本，其余分别对应纯文本、JSON、限流与截断。 */
export type Mode = 'tools' | 'text' | 'json' | 'rate-limit' | 'truncated';

/**
 * 起一个本地假模型服务并返回其地址与观测句柄。`gated` 为真时首个 delta 会挂起直到
 * `release()`，用于测流式取消与超时；`script` 用固定回合覆盖默认行为。
 * 服务监听随机端口，返回的 `close()` 必须调用，否则测试进程不会退出。
 */
export async function fixture(
  format: Format,
  mode: Mode = 'tools',
  gated = false,
  script?: {
    turns: { name: string; input: Record<string, unknown>; text?: string }[];
    text: string;
    json: string;
  },
) {
  const requests: { path: string; body: Record<string, unknown>; authenticated: boolean }[] = [];
  const firstDelta = deferred();
  const release = deferred();
  const disconnected = deferred();
  if (!gated) release.resolve();
  let completed = false;
  const server = createServer((req, res) => {
    void (async () => {
      const buffers: Buffer[] = [];
      for await (const chunk of req) buffers.push(Buffer.from(chunk));
      const body = record(JSON.parse(Buffer.concat(buffers).toString()));
      requests.push({
        path: req.url ?? '',
        body,
        authenticated:
          format === 'openai'
            ? req.headers.authorization === 'Bearer ai-fixture-key'
            : req.headers['x-api-key'] === 'ai-fixture-key' && !!req.headers['anthropic-version'],
      });
      res.on('close', () => disconnected.resolve());
      if (mode === 'rate-limit') {
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            type: 'error',
            error: { type: 'rate_limit_error', message: 'AI rate limited' },
          }),
        );
        return;
      }
      const planned = script?.turns[requests.length - 1];
      const toolTurn = script ? !!planned : mode === 'tools' && requests.length === 1;
      const text = script
        ? requests.length > script.turns.length + 1
          ? script.json
          : script.text
        : mode === 'json'
          ? '{"verdict":"ok","count":7}'
          : 'AI 流式输出 42';
      if (!body.stream) {
        res.writeHead(200, { 'content-type': 'application/json' });
        const tools = Array.isArray(body.tools) ? body.tools : [];
        const tool = tools[0] ? record(tools[0]) : undefined;
        res.end(
          JSON.stringify(
            format === 'openai'
              ? {
                  id: 'chatcmpl-ai',
                  object: 'chat.completion',
                  created: 1800000000,
                  model: 'fixture-model',
                  choices: [
                    {
                      index: 0,
                      message: { role: 'assistant', content: text },
                      finish_reason: 'stop',
                    },
                  ],
                  usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
                }
              : {
                  id: 'msg-ai',
                  type: 'message',
                  role: 'assistant',
                  model: 'fixture-model',
                  content: tool
                    ? [
                        {
                          type: 'tool_use',
                          id: 'toolu-json',
                          name: tool.name,
                          input: JSON.parse(text),
                        },
                      ]
                    : [{ type: 'text', text }],
                  stop_reason: tool ? 'tool_use' : 'end_turn',
                  stop_sequence: null,
                  usage: { input_tokens: 10, output_tokens: 8 },
                },
          ),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      res.flushHeaders();
      if (format === 'openai') {
        const chunk = (delta: unknown, finish_reason: string | null = null) =>
          data(res, {
            id: 'chatcmpl-ai',
            object: 'chat.completion.chunk',
            created: 1800000000,
            model: 'fixture-model',
            choices: [{ index: 0, delta, finish_reason }],
          });
        chunk({ role: 'assistant', content: '' });
        if (toolTurn) {
          if (planned?.text) chunk({ content: planned.text });
          chunk({
            tool_calls: [
              {
                index: 0,
                id: 'call-ai',
                type: 'function',
                function: {
                  name: planned?.name ?? 'inspect_text',
                  arguments: planned ? JSON.stringify(planned.input) : '{"text":',
                },
              },
            ],
          });
          if (!planned) chunk({ tool_calls: [{ index: 0, function: { arguments: '"hello"}' } }] });
          chunk({}, 'tool_calls');
        } else {
          chunk({ content: text.slice(0, 3) });
          firstDelta.resolve();
          await release.promise;
          if (mode === 'truncated') {
            res.end();
            return;
          }
          chunk({ content: text.slice(3) });
          chunk({}, 'stop');
        }
        data(res, {
          id: 'chatcmpl-ai',
          object: 'chat.completion.chunk',
          created: 1800000000,
          model: 'fixture-model',
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
        });
        res.end('data: [DONE]\n\n');
      } else {
        event(res, 'message_start', {
          message: {
            id: 'msg-ai',
            type: 'message',
            role: 'assistant',
            model: 'fixture-model',
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 10, output_tokens: 0 },
          },
        });
        if (toolTurn) {
          if (planned?.text) {
            event(res, 'content_block_start', {
              index: 0,
              content_block: { type: 'text', text: '' },
            });
            event(res, 'content_block_delta', {
              index: 0,
              delta: { type: 'text_delta', text: planned.text },
            });
            event(res, 'content_block_stop', { index: 0 });
          }
          event(res, 'content_block_start', {
            index: planned?.text ? 1 : 0,
            content_block: {
              type: 'tool_use',
              id: 'toolu-ai',
              name: planned?.name ?? 'inspect_text',
              input: {},
            },
          });
          event(res, 'content_block_delta', {
            index: planned?.text ? 1 : 0,
            delta: {
              type: 'input_json_delta',
              partial_json: planned ? JSON.stringify(planned.input) : '{"text":',
            },
          });
          if (!planned)
            event(res, 'content_block_delta', {
              index: 0,
              delta: { type: 'input_json_delta', partial_json: '"hello"}' },
            });
        } else {
          event(res, 'content_block_start', {
            index: 0,
            content_block: { type: 'text', text: '' },
          });
          event(res, 'content_block_delta', {
            index: 0,
            delta: { type: 'text_delta', text: text.slice(0, 3) },
          });
          firstDelta.resolve();
          await release.promise;
          if (mode === 'truncated') {
            res.end();
            return;
          }
          event(res, 'content_block_delta', {
            index: 0,
            delta: { type: 'text_delta', text: text.slice(3) },
          });
        }
        event(res, 'content_block_stop', { index: toolTurn && planned?.text ? 1 : 0 });
        event(res, 'message_delta', {
          delta: { stop_reason: toolTurn ? 'tool_use' : 'end_turn', stop_sequence: null },
          usage: { output_tokens: 8 },
        });
        event(res, 'message_stop', {});
        res.end();
      }
      if (!toolTurn) completed = true;
    })().catch(() => res.destroy());
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing port');
  return {
    url: `http://127.0.0.1:${address.port}/custom/v1`,
    requests,
    firstDelta,
    release,
    disconnected,
    get completed() {
      return completed;
    },
    close: async () => {
      release.resolve();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
function data(res: ServerResponse, value: unknown) {
  res.write(`data: ${JSON.stringify(value)}\n\n`);
}
function event(res: ServerResponse, type: string, value: Record<string, unknown>) {
  res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
}
