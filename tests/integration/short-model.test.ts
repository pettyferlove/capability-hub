import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import type { ModelProfile } from '@capability-hub/ai';
import {
  callShortModel,
  ShortModelError,
  type ShortModelCall,
  type ShortModelFailureReason,
} from '../../packages/ai/src/integrations/short-model.js';
import {
  anthropicJson,
  openAiJson,
  openAiStream,
  serveModelStub,
  type StubReply,
} from '../support/model-provider-stub.js';
import { deferred } from '../support/store.js';

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

  await rejectsWith(
    callShortModel(
      call(stub.profile('openai'), {
        reserve: () => undefined,
        release: () => void released++,
        onPartial: () => undefined,
      }),
    ),
    'output_too_large',
  );

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
    errorCode: 'AI_PROVIDER_FAILED',
    transport: { request_timed_out: true },
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
