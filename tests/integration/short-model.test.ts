import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import type { ModelProfile } from '@capability-hub/ai';
import { isModelSampleFailure } from '../../packages/ai/src/execution/inline.js';
import {
  callShortModel,
  ShortModelError,
  type ShortModelCall,
  type ShortModelFailureReason,
} from '../../packages/ai/src/integrations/short-model.js';
import { ModelExchangeCapture } from '../../packages/ai/src/integrations/model-exchange.js';
import {
  anthropicJson,
  openAiJson,
  openAiStream,
  serveModelStub,
  type StubReply,
} from '../support/model-provider-stub.js';
import { deferred } from '../support/store.js';
import { fixture as providerFixture } from '../support/ai-provider.js';

const schema = z.object({ answer: z.string() });
const credentials = { resolve: async (ref: string) => process.env[ref] ?? '' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function call(
  profile: ModelProfile,
  overrides: Partial<ShortModelCall<typeof schema>> = {},
): ShortModelCall<typeof schema> {
  return {
    profile,
    credentials,
    operation: 'catalog-discovery/turn',
    instructions: 'Answer briefly.',
    input: 'Which skill reviews code?',
    schema,
    ...overrides,
  };
}

function recordCalls() {
  const starts: unknown[] = [];
  const finishes: unknown[] = [];
  const observer: NonNullable<ShortModelCall<typeof schema>['observer']> = {
    async start(diagnostics) {
      starts.push(diagnostics);
      return {
        executionId: 'recorded-execution',
        async finish(result) {
          finishes.push(result);
        },
      };
    },
  };
  return { observer, starts, finishes };
}

async function rejectsWith(promise: Promise<unknown>, reason: ShortModelFailureReason) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ShortModelError);
    assert.equal(error.reason, reason);
    return true;
  });
}

test('OpenAI 短调用只发一次请求并携带凭据与配置请求头', async (t) => {
  const stub = await serveModelStub(t, () => ({ json: openAiJson({ answer: 'ok' }) }));
  const profile = stub.profile('openai', {
    request_headers: {
      'X-Static': 'fixed',
      'X-Correlation': { from: 'execution_id', prefix: 'hub-' },
    },
  });

  const first = await callShortModel(call(profile));
  assert.deepEqual(first.value, { answer: 'ok' });
  assert.deepEqual(first.usage, { input_tokens: 11, output_tokens: 7 });
  assert.equal(stub.requests.length, 1);
  await callShortModel(call(profile));

  assert.equal(stub.requests.length, 2);
  const [one, two] = stub.requests;
  assert.equal(one?.method, 'POST');
  assert.equal(one?.path, '/v1/chat/completions');
  assert.equal(one?.headers.authorization, `Bearer ${stub.credential}`);
  assert.equal(one?.headers['x-static'], 'fixed');
  const correlation = [one?.headers['x-correlation'], two?.headers['x-correlation']];
  for (const value of correlation) {
    assert.equal(typeof value, 'string');
    assert.match(String(value).replace(/^hub-/, ''), uuid);
    assert.ok(String(value).startsWith('hub-'));
  }
  assert.notEqual(correlation[0], correlation[1]);
  for (const name of ['cookie', 'x-csrf-token', 'idempotency-key'])
    assert.equal(one?.headers[name], undefined);
});

test('仅支持 JSON 对象模式的端点能看到字段契约；完整 JSON 围栏不影响严格校验', async (t) => {
  const text = '```json\n{"answer":"已找到"}\n```';
  const stub = await serveModelStub(t, ({ body }) =>
    (body as { stream?: boolean }).stream ? openAiStream(text) : { json: openAiJson(text) },
  );
  for (const stream of [false, true]) {
    const result = await callShortModel(
      call(stub.profile('openai'), stream ? { onPartial: () => undefined } : {}),
    );
    assert.deepEqual(result.value, { answer: '已找到' });
    const wire = stub.requests.at(-1)?.body as {
      messages: { role: string; content: string }[];
      response_format: { type: string };
    };
    assert.equal(wire.response_format.type, 'json_object');
    const instruction = wire.messages.find((message) => message.role === 'system')!.content;
    const contract = JSON.parse(instruction.slice(instruction.indexOf('{'))) as {
      required: string[];
      properties: { answer: { type: string } };
    };
    assert.deepEqual(contract.required, ['answer']);
    assert.equal(contract.properties.answer.type, 'string');
  }
  assert.equal(stub.requests.length, 2);
});

test('输出耗尽时优先报告截断和用量，不把残缺对象误报为字段错误或发起纠正请求', async (t) => {
  const usage = { input: 72, output: 128, reasoning: 120 };
  const text = '{"answer":"未完成';
  const stub = await serveModelStub(t, ({ body }) => {
    if ((body as { stream?: boolean }).stream)
      return openAiStream(text, { usage, finishReason: 'length' });
    const json = openAiJson(text, usage);
    json.choices[0].finish_reason = 'length';
    return { json };
  });
  for (const stream of [false, true]) {
    const ledger = recordCalls();
    await assert.rejects(
      callShortModel(
        call(stub.profile('openai', { max_output_tokens: 128 }), {
          observer: ledger.observer,
          ...(stream && { onPartial: () => undefined }),
        }),
      ),
      (error: unknown) => {
        assert(error instanceof ShortModelError);
        assert.equal(error.reason, 'invalid_output');
        assert.deepEqual(error.output, {
          issue: 'truncated',
          limit: 128,
          used: 128,
          reasoning: 120,
        });
        return true;
      },
    );
    assert.equal(ledger.finishes.length, 1);
    assert.partialDeepStrictEqual(ledger.finishes[0], {
      transport: { terminal_received: true, finish_reason: 'length' },
      inputTokens: 72,
      outputTokens: 128,
      complete: true,
      errorCode: null,
    });
  }
  assert.equal(stub.requests.length, 2);
});

test('Anthropic 短调用只发一次 messages 请求并使用 x-api-key', async (t) => {
  const stub = await serveModelStub(t, (request) => {
    const message = anthropicJson({ answer: 'ok' }, { request });
    return {
      json: {
        ...message,
        usage: { ...message.usage, cache_creation_input_tokens: 19, cache_read_input_tokens: 37 },
      },
    };
  });

  const ledger = recordCalls();
  const result = await callShortModel(
    call(stub.profile('anthropic'), { observer: ledger.observer }),
  );

  assert.deepEqual(result.value, { answer: 'ok' });
  assert.partialDeepStrictEqual(ledger.finishes, [
    { complete: true, inputTokens: 67, outputTokens: 7 },
  ]);
  assert.equal(stub.requests.length, 1);
  assert.equal(stub.requests[0]?.method, 'POST');
  assert.equal(stub.requests[0]?.path, '/v1/messages');
  assert.equal(stub.requests[0]?.headers['x-api-key'], stub.credential);
});

test('Messages 只报告缓存与输出时，账本不把缺报的基础输入当作零', async (t) => {
  const stub = await serveModelStub(t, (request) => ({
    json: {
      ...anthropicJson({ answer: 'ok' }, { request }),
      usage: { cache_read_input_tokens: 37, output_tokens: 7 },
    },
  }));
  const ledger = recordCalls();
  await assert.rejects(
    callShortModel(call(stub.profile('anthropic'), { observer: ledger.observer })),
    ShortModelError,
  );
  assert.partialDeepStrictEqual(ledger.finishes, [
    {
      inputTokens: null,
      outputTokens: 7,
      transport: { input_tokens_reported: false, output_tokens_reported: true },
    },
  ]);
});

const replyFailures: { name: string; reply: StubReply; reason: ShortModelFailureReason }[] = [
  { name: '结构不符', reply: { json: openAiJson({ wrong: 1 }) }, reason: 'invalid_output' },
  {
    name: 'HTTP 429',
    reply: { status: 429, json: { error: 'slow down' } },
    reason: 'rate_limited',
  },
  {
    name: '解压后超限',
    reply: { json: openAiJson({ answer: 'a'.repeat(600_000) }), gzip: true },
    reason: 'output_too_large',
  },
];

for (const { name, reply, reason } of replyFailures) {
  test(`${name}时失败为 ${reason} 且不重试`, async (t) => {
    const stub = await serveModelStub(t, () => reply);

    const ledger = recordCalls();
    await rejectsWith(
      callShortModel(call(stub.profile('openai'), { observer: ledger.observer })),
      reason,
    );
    const complete = reason === 'invalid_output';
    assert.equal(ledger.finishes.length, 1);
    assert.partialDeepStrictEqual(ledger.finishes[0], {
      complete,
      inputTokens: complete ? 11 : null,
      outputTokens: complete ? 7 : null,
      errorCode: complete
        ? null
        : reason === 'output_too_large'
          ? 'AI_OUTPUT_INVALID'
          : 'AI_PROVIDER_FAILED',
    });

    assert.equal(stub.requests.length, 1);
  });
}

test('HTTP 200 的错误信封、错误页和损坏的协议消息不计为模型样本', async (t) => {
  const stub = await serveModelStub(t);
  const chat = openAiJson({ answer: 'ok' });
  const badChoice = { ...chat.choices[0], message: { role: 'assistant', content: 37 } };
  const chunk = { choices: [{ index: 0, delta: { content: 37 }, finish_reason: 'stop' }] };
  const replies: [ModelProfile['format'], StubReply, stream?: boolean][] = [
    ['openai', { json: { error: { type: 'server_error', code: '500' } } }],
    ['anthropic', { json: { type: 'error', error: { type: 'overloaded_error' } } }],
    ['openai', { headers: { 'content-type': 'text/html' }, body: '<html>Bad Gateway</html>' }],
    ['openai', { headers: { 'content-type': 'application/json' }, body: '{"choices":[' }],
    ['openai', { json: { ...chat, choices: [badChoice] } }],
    ['anthropic', { json: { ...anthropicJson({}), content: [{ type: 'text', text: 37 }] } }],
    [
      'openai',
      {
        headers: { 'content-type': 'text/event-stream' },
        body: `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`,
      },
      true,
    ],
  ];
  for (const [format, reply, stream = false] of replies) {
    stub.setHandler(() => reply);
    const ledger = recordCalls();
    await assert.rejects(
      callShortModel(
        call(stub.profile(format), {
          observer: ledger.observer,
          ...(stream && { onPartial: () => assert.fail('损坏的帧不能产生模型输出') }),
        }),
      ),
      (error: unknown) => {
        assert(error instanceof ShortModelError);
        assert.equal(error.reason, 'provider');
        assert.equal(error.code, 'AI_PROVIDER_FAILED');
        assert.equal(isModelSampleFailure(error), false);
        return true;
      },
    );
    assert.partialDeepStrictEqual(ledger.finishes, [
      {
        complete: false,
        errorCode: 'AI_PROVIDER_FAILED',
        transport: { http_status: 200, terminal_received: stream },
      },
    ]);
    const [result] = ledger.finishes;
    assert(result && typeof result === 'object' && !('outputCheck' in result));
  }
});

test('流式短调用逐步回调部分结果，最终结果仍整体校验并只释放一次', async (t) => {
  const stub = await serveModelStub(t, () => {
    const reply = openAiStream({ answer: 'a long enough answer' }, { size: 4 });
    return { ...reply, body: String(reply.body).trimEnd() };
  });
  const partials: unknown[] = [];
  let released = 0;

  const result = await callShortModel(
    call(stub.profile('openai'), {
      reserve: () => undefined,
      release: () => void released++,
      onPartial: (partial) => partials.push(partial),
    }),
  );

  assert.deepEqual(result.value, { answer: 'a long enough answer' });
  assert.deepEqual(result.usage, { input_tokens: 11, output_tokens: 7 });
  assert.ok(partials.length > 1);
  assert.deepEqual(partials.at(-1), { answer: 'a long enough answer' });
  assert.equal(released, 1);
  assert.equal(stub.requests.length, 1);
  assert.equal((stub.requests[0]?.body as { stream?: boolean }).stream, true);
});

test('Anthropic 的 message_stop 后直接 EOF 仍交付完整用量与结果', async (t) => {
  const ledger = recordCalls();
  const answer = '可以检查接口契约';
  const stub = await serveModelStub(t, (request) => {
    const message = anthropicJson({ answer }, { request });
    const tool = message.content[0].type === 'tool_use';
    const events = [
      {
        type: 'message_start',
        message: {
          ...message,
          content: [],
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 1, cache_read_input_tokens: 37 },
        },
      },
      {
        type: 'content_block_start',
        index: 0,
        content_block: tool
          ? { type: 'tool_use', id: 'toolu_stub', name: 'json', input: {} }
          : { type: 'text', text: '' },
      },
      ...['{"answer":"可以', '检查接口契约"}'].map((text) => ({
        type: 'content_block_delta',
        index: 0,
        delta: tool
          ? { type: 'input_json_delta', partial_json: text }
          : { type: 'text_delta', text },
      })),
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: message.stop_reason },
        usage: { output_tokens: 7, cache_creation_input_tokens: 19 },
      },
      { type: 'message_stop' },
    ];
    return {
      headers: { 'content-type': 'text/event-stream' },
      body: events
        .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}`)
        .join('\n\n'),
    };
  });
  const partials: unknown[] = [];
  const result = await callShortModel(
    call(stub.profile('anthropic'), {
      observer: ledger.observer,
      onPartial: (partial) => partials.push(partial),
    }),
  );
  assert.deepEqual(result.value, { answer });
  assert.deepEqual(partials.at(-1), { answer });
  assert.partialDeepStrictEqual(ledger.finishes, [
    { complete: true, inputTokens: 56, outputTokens: 7, transport: { terminal_received: true } },
  ]);
  assert.equal(stub.requests.length, 1);
});

test('流式响应超过响应上限时中断为 output_too_large 并只释放一次', async (t) => {
  const stub = await serveModelStub(t, () =>
    openAiStream({ answer: 'a'.repeat(600_000) }, { size: 4096 }),
  );
  let released = 0;
  const ledger = recordCalls();

  await rejectsWith(
    callShortModel(
      call(stub.profile('openai'), {
        reserve: () => undefined,
        observer: ledger.observer,
        release: () => void released++,
        onPartial: () => undefined,
      }),
    ),
    'output_too_large',
  );
  assert.partialDeepStrictEqual(ledger.finishes, [
    {
      errorCode: 'AI_OUTPUT_INVALID',
      outputCheck: { status: 'rejected', reason: 'response_too_large' },
    },
  ]);

  assert.equal(released, 1);
  assert.equal(stub.requests.length, 1);
});

test('请求体超限时不预留也不发送', async (t) => {
  const stub = await serveModelStub(t);
  const ledger = recordCalls();
  let reserved = 0;

  await rejectsWith(
    callShortModel(
      call(stub.profile('openai'), {
        input: 'x'.repeat(40_000),
        reserve: () => void reserved++,
        observer: ledger.observer,
      }),
    ),
    'input_too_large',
  );

  assert.equal(reserved, 0);
  assert.deepEqual(ledger.starts, []);
  assert.equal(stub.requests.length, 0);
});

test('预留失败时原样抛出且不发送', async (t) => {
  const stub = await serveModelStub(t);
  const failure = new Error('quota exhausted');
  const ledger = recordCalls();

  await assert.rejects(
    callShortModel(
      call(stub.profile('openai'), {
        observer: ledger.observer,
        reserve: () => {
          throw failure;
        },
      }),
    ),
    (error: unknown) => error === failure,
  );

  assert.deepEqual(ledger.starts, []);
  assert.equal(stub.requests.length, 0);
});

test('账本预留失败时释放宿主名额，不触达端点', async (t) => {
  const stub = await serveModelStub(t);
  const failure = new Error('admission denied');
  let slots = 0;
  await assert.rejects(
    callShortModel(
      call(stub.profile('openai'), {
        reserve: () => void slots++,
        release: () => void slots--,
        observer: {
          async start() {
            assert.equal(slots, 1);
            throw failure;
          },
        },
      }),
    ),
    (error: unknown) => error === failure,
  );
  assert.equal(slots, 0);
  assert.equal(stub.requests.length, 0);
});

test('重定向不被跟随', async (t) => {
  const target = await serveModelStub(t);
  const stub = await serveModelStub(t, () => ({
    redirectTo: `${target.origin}/v1/chat/completions`,
  }));

  await rejectsWith(callShortModel(call(stub.profile('openai'))), 'provider');

  assert.equal(stub.requests.length, 1);
  assert.equal(target.requests.length, 0);
});

test('端点挂起时按时限失败并只释放一次', async (t) => {
  const stub = await serveModelStub(t, () => ({ hang: true }));
  const ledger = recordCalls();
  let released = 0;

  await rejectsWith(
    callShortModel(
      call(stub.profile('openai'), {
        observer: ledger.observer,
        limits: { timeoutMs: 1000 },
        reserve: () => undefined,
        release: () => void released++,
      }),
    ),
    'timeout',
  );

  assert.equal(released, 1);
  assert.partialDeepStrictEqual(ledger.finishes, [
    {
      complete: false,
      errorCode: 'AI_PROVIDER_FAILED',
      inputTokens: null,
      outputTokens: null,
      transport: { request_timed_out: true },
    },
  ]);
  assert.equal(stub.requests.length, 1);
});

test('调用方取消时失败为 cancelled', async (t) => {
  const arrived = deferred();
  const stub = await serveModelStub(t, () => {
    arrived.resolve();
    return { hang: true };
  });
  const controller = new AbortController();
  const ledger = recordCalls();
  const pending = callShortModel(
    call(stub.profile('openai'), { signal: controller.signal, observer: ledger.observer }),
  );
  await arrived.promise;

  controller.abort();

  await rejectsWith(pending, 'cancelled');
  assert.partialDeepStrictEqual(ledger.finishes, [
    { complete: false, errorCode: 'AI_CANCELLED', inputTokens: null, outputTokens: null },
  ]);
});

test('宿主窗口到期按超时结算，不误记为用户取消', async (t) => {
  const stub = await serveModelStub(t, () => ({ hang: true }));
  const ledger = recordCalls();
  const signal = AbortSignal.any([new AbortController().signal, AbortSignal.timeout(1000)]);
  await rejectsWith(
    callShortModel(call(stub.profile('openai'), { signal, observer: ledger.observer })),
    'timeout',
  );
  assert.equal(ledger.finishes.length, 1);
  assert.partialDeepStrictEqual(ledger.finishes[0], {
    complete: false,
    errorCode: 'AI_DEADLINE_EXCEEDED',
    transport: { request_timed_out: false },
  });
});

test('请求头引用已预留的执行，未报告的用量不采信 SDK 补零', async (t) => {
  const stub = await serveModelStub(t, () => ({
    json: { ...openAiJson({ answer: 'private answer' }), usage: { prompt_tokens: 0 } },
  }));
  const profile = stub.profile('openai', {
    request_headers: { 'x-trace': { from: 'execution_id', prefix: 'trace-' } },
  });
  const ledger = recordCalls();
  const result = await callShortModel(call(profile, { observer: ledger.observer }));
  assert.equal(stub.requests[0]?.headers['x-trace'], 'trace-recorded-execution');
  assert.deepEqual(result.usage, { input_tokens: 0, output_tokens: null });
  assert.equal(ledger.starts.length, 1);
  assert.equal(ledger.finishes.length, 1);
  assert.partialDeepStrictEqual(ledger.finishes[0], {
    complete: true,
    errorCode: null,
    inputTokens: 0,
    outputTokens: null,
    transport: { input_tokens_reported: true, output_tokens_reported: false },
  });
  assert.doesNotMatch(JSON.stringify(ledger), /private answer|Which skill|trace-recorded|x-trace/);
});

test('截断事件流不因已有用量或停止原因而结算为完整', async (t) => {
  for (const format of ['openai', 'anthropic'] as const) {
    const stub = await serveModelStub(t, (request) => {
      if (format === 'openai') {
        const reply = openAiStream({ answer: 'ok' }, { usage: { input: 0, output: 0 } });
        return { ...reply, body: String(reply.body).replace('data: [DONE]\n\n', '') };
      }
      const message = anthropicJson({ answer: 'ok' }, { request, usage: { input: 0, output: 0 } });
      return {
        headers: { 'content-type': 'text/event-stream' },
        body: `data: ${JSON.stringify({ type: 'message_start', message: { ...message, content: [], stop_reason: null } })}\n\n`,
      };
    });
    const ledger = recordCalls();
    await rejectsWith(
      callShortModel(
        call(stub.profile(format), {
          observer: ledger.observer,
          onPartial: () => undefined,
        }),
      ),
      'provider',
    );
    assert.equal(ledger.finishes.length, 1);
    assert.partialDeepStrictEqual(ledger.finishes[0], {
      inputTokens: 0,
      outputTokens: format === 'openai' ? 0 : null,
      complete: false,
      errorCode: 'AI_STREAM_INCOMPLETE',
      transport: { terminal_received: false },
    });
    assert.equal(stub.requests.length, 1);
  }
});

test('往返采集按协议还原正文与推理，端点错误正文只进入原文且凭据不入记录', async (t) => {
  const envelope = { id: 'chatcmpl-stub', created: 1, model: 'stub-model' };
  const chunk = (delta: object, finish: string | null = null, totals?: object) =>
    `data: ${JSON.stringify({
      ...envelope,
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...(totals && { usage: totals }),
    })}\n\n`;
  const usage = { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 };
  const replies: StubReply[] = [
    {
      json: {
        ...envelope,
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: [
                { type: 'thinking', thinking: [{ type: 'text', text: 'reasoning' }] },
                { type: 'text', text: '{"answer":' },
                { type: 'text', text: '"ok"}' },
              ],
              reasoning_content: 'private-',
            },
            finish_reason: 'stop',
          },
        ],
        usage,
      },
    },
    {
      headers: { 'content-type': 'text/event-stream' },
      body: [
        chunk({ role: 'assistant', reasoning_content: 'private-' }),
        chunk({
          content: [
            { type: 'thinking', thinking: [{ type: 'text', text: 'reasoning' }] },
            { type: 'text', text: '{"answer":' },
            { type: 'text', text: '"ok"}' },
          ],
        }),
        chunk({}, 'stop', usage),
        'data: [DONE]\n\n',
      ].join(''),
    },
    { status: 400, json: { error: { code: 'bad_request', message: 'private-upstream-text' } } },
  ];
  const stub = await serveModelStub(t, (_request, index) => replies[index]);
  const profile = stub.profile('openai');
  const captures = [0, 1, 2].map(() => new ModelExchangeCapture('openai'));
  for (const [index, capture] of captures.slice(0, 2).entries()) {
    const success = recordCalls();
    const result = await callShortModel(
      call(profile, {
        capture,
        observer: success.observer,
        ...(index === 1 && { onPartial: () => undefined }),
      }),
    );
    assert.deepEqual(result.value, { answer: 'ok' });
    assert.partialDeepStrictEqual(success.finishes, [
      { complete: true, transport: { text_chars: '{"answer":"ok"}'.length } },
    ]);
    assert(!Object.hasOwn(success.finishes[0] as object, 'outputCheck'));
  }
  const ledger = recordCalls();
  await rejectsWith(
    callShortModel(call(profile, { capture: captures[2], observer: ledger.observer })),
    'provider',
  );
  const [json, stream, failed] = captures.map((capture) => capture.payload(['version-1']));
  for (const exchange of [json, stream]) {
    assert.equal(exchange.response?.text, '{"answer":"ok"}');
    assert.equal(exchange.response?.reasoning, 'private-reasoning');
    assert.equal(exchange.response?.finish_reason, 'stop');
    assert.match(JSON.stringify(exchange.request.body), /Which skill reviews code\?/);
  }
  assert.deepEqual(json.resource_refs, ['version-1']);
  assert.match(failed.response?.error_body ?? '', /private-upstream-text/);
  assert.partialDeepStrictEqual(ledger.finishes[0], {
    transport: { http_status: 400, upstream_error_code: 'bad_request' },
  });
  assert(!JSON.stringify(ledger.finishes).includes('private-'));
  assert(!JSON.stringify(captures.map((capture) => capture.payload([]))).includes(stub.credential));
});

test('请求与分帧回答的已知凭据只在原文副本里脱敏，SDK 仍交付完整答案', async (t) => {
  const stub = await serveModelStub(t);
  stub.setHandler(() => openAiStream({ answer: stub.credential }, { size: 2 }));
  const capture = new ModelExchangeCapture('openai');
  const result = await callShortModel(
    call(stub.profile('openai'), {
      input: `synthetic input ${stub.credential}`,
      capture,
      onPartial: () => undefined,
    }),
  );
  assert.equal(result.value.answer, stub.credential);
  assert(JSON.stringify(stub.requests[0].body).includes(stub.credential));
  const exchange = capture.payload([]);
  assert.equal(exchange.response?.text, '{"answer":"*"}');
  assert(!JSON.stringify(exchange).includes(stub.credential));
});

test('HTTP 限流不被延迟错误正文触发的请求时限覆盖', async (t) => {
  const upstream = await providerFixture(
    'openai',
    {
      status: 429,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-gated' },
      body: 'late',
    },
    'before-output',
  );
  t.after(upstream.close);
  const stub = await serveModelStub(t);
  const profile = { ...stub.profile('openai'), base_url: upstream.url };
  for (const retain of [true, false]) {
    const ledger = recordCalls();
    const capture = retain ? new ModelExchangeCapture('openai') : undefined;
    await rejectsWith(
      callShortModel(
        call(profile, { capture, limits: { timeoutMs: 300 }, observer: ledger.observer }),
      ),
      'rate_limited',
    );
    assert.partialDeepStrictEqual(ledger.finishes, [
      {
        errorCode: 'AI_PROVIDER_FAILED',
        transport: { http_status: 429, upstream_request_id: 'req-gated', request_timed_out: false },
      },
    ]);
    if (capture) assert.equal(capture.payload([]).response?.truncated, true);
  }
});

test('HTTP 限流区分缺失、合法和不可用的 Retry-After，不将非法值当作零等待', async (t) => {
  const now = Date.UTC(2026, 0, 1);
  t.mock.timers.enable({ apis: ['Date'], now });
  const stub = await serveModelStub(t);
  const cases: [string | undefined, number | undefined][] = [
    [undefined, undefined],
    ['0', 0],
    ['8', 8_000],
    [new Date(now - 1_000).toUTCString(), 0],
    [new Date(now + 8_000).toUTCString(), 8_000],
    [new Date(now + 9_000).toUTCString(), 9_000],
    ['Thursday, 01-Jan-26 00:00:03 GMT', 3_000],
    ['Saturday, 01-Jan-50 00:00:00 GMT', Date.UTC(2050, 0, 1) - now],
    ['Friday, 02-Jan-76 00:00:00 GMT', 0],
    ['Thu Jan  1 00:00:04 2026', 4_000],
    ['60, 60', Infinity],
    [`${new Date(now).toUTCString()}, 1`, Infinity],
    ['', Infinity],
    ['10.5', Infinity],
    ['-5', Infinity],
    ['60s', Infinity],
    ['bogus', Infinity],
    ['2026-01-01T00:00:03Z', Infinity],
    ['Thu, 31 Feb 2026 00:00:00 GMT', Infinity],
    ['9'.repeat(400), Infinity],
  ];
  for (const [value, delay] of cases) {
    stub.setHandler(() => ({
      status: 429,
      headers: value === undefined ? undefined : { 'retry-after': value },
    }));
    await assert.rejects(callShortModel(call(stub.profile('openai'))), (error: unknown) => {
      assert(error instanceof ShortModelError);
      assert.equal(error.reason, 'rate_limited');
      assert.equal(error.details?.retryAfterMs, delay, value);
      return true;
    });
  }
});

test('短调用错误事件只保留脱敏的 UTF-8 前缀，不采信上游附带的用量', async (t) => {
  const stub = await serveModelStub(t);
  const error = {
    error: {
      code: stub.credential,
      message: `${stub.credential}\nAuthorization: Bearer synthetic-header-value\n${'错'.repeat(4000)}`,
      headers: { custom: 'synthetic-envelope-extension' },
    },
    request_id: stub.credential,
    usage: { prompt_tokens: 1, completion_tokens: 2 },
  };
  stub.setHandler(() => ({
    headers: { 'content-type': 'text/event-stream' },
    body: `data: ${JSON.stringify(error)}\n\n`,
  }));
  const capture = new ModelExchangeCapture('openai');
  const ledger = recordCalls();
  await rejectsWith(
    callShortModel(
      call(stub.profile('openai'), {
        capture,
        onPartial: () => undefined,
        observer: ledger.observer,
      }),
    ),
    'provider',
  );
  const reply = capture.payload([]).response;
  assert(reply && typeof reply.error_body === 'string');
  assert(reply.error_body.includes('错'));
  assert(Buffer.byteLength(reply.error_body) <= 8192);
  assert.equal(reply.truncated, true);
  assert.partialDeepStrictEqual(ledger.finishes, [
    { complete: false, inputTokens: null, outputTokens: null, errorCode: 'AI_PROVIDER_FAILED' },
  ]);
  const evidence = JSON.stringify([reply, ledger.finishes]);
  for (const secret of [stub.credential, 'synthetic-header-value', 'synthetic-envelope-extension'])
    assert(!evidence.includes(secret));
});

test('非流式超限与中途读取失败保留整字符前缀，不确认前缀中的用量', async (t) => {
  const stub = await serveModelStub(t);
  const start = `{"usage":{"prompt_tokens":3},"message":"${stub.credential}`;
  const prefix = start + '证据';
  const bytes = Buffer.from(prefix + '字');
  for (const oversized of [true, false]) {
    const capture = new ModelExchangeCapture('openai');
    const ledger = recordCalls();
    const fetch = t.mock.method(
      globalThis,
      'fetch',
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes.subarray(0, bytes.length - 1));
            },
            pull(controller) {
              if (oversized) controller.close();
              else controller.error(new Error('synthetic disconnect'));
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        ),
    );
    try {
      await rejectsWith(
        callShortModel(
          call(stub.profile('openai'), {
            capture,
            observer: ledger.observer,
            limits: { maxResponseBytes: oversized ? bytes.length - 2 : bytes.length },
          }),
        ),
        oversized ? 'output_too_large' : 'provider',
      );
    } finally {
      fetch.mock.restore();
    }
    assert.partialDeepStrictEqual(capture.payload([]).response, {
      raw: prefix.replace(stub.credential, '*'),
      truncated: true,
    });
    assert.partialDeepStrictEqual(ledger.finishes, [
      { complete: false, inputTokens: null, outputTokens: null },
    ]);
  }
});

test('无 index 的工具增量按 ID 分开，跨过工具上限后不再拼接后续片段', () => {
  const capture = new ModelExchangeCapture('openai');
  const tool = (id: string, args: string) =>
    capture.frame({
      choices: [{ delta: { tool_calls: [{ id, function: { name: id, arguments: args } }] } }],
    });
  tool('first', 'a');
  tool('second', 'b');
  tool('first', 'c');
  tool('second', 'd'.repeat(262139));
  tool('second', '字');
  tool('first', '!');
  const response = capture.payload([]).response;
  assert(response?.truncated);
  assert.deepEqual(
    response.tool_calls.map((item) => [item.id, item.arguments.length]),
    [
      ['first', 2],
      ['second', 262140],
    ],
  );
  assert.equal(response.tool_calls[0].arguments, 'ac');
});
