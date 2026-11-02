import assert from 'node:assert/strict';
import { acceptedSuggestion } from '../../apps/web/src/features/ai/publication-suggestion.js';
import { executionResponse } from '../../apps/server/src/http/routes/ai-views.js';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { AgentEvidenceService } from '@capability-hub/application';
import { AiError } from '@capability-hub/ai';
import {
  aiExecutionLedgerResponseSchema,
  aiExecutionListResponseSchema,
  assetFeedbackRequestSchema,
} from '@capability-hub/contracts';
import {
  createTestHub,
  publishSkill,
  receiveSkill,
  submitPublication,
  testPassword,
  type TestHub,
} from '../support/application.js';
import { fixture } from '../support/ai-provider.js';
import { frameworkConfig } from '../support/ai-framework.js';
import { signIn } from '../support/http.js';
import { archive } from '@capability-hub/infrastructure/content';
import { skillDocument } from '../support/content.js';
import {
  buildMcpDocument,
  emptyMcpEntry,
} from '../../apps/web/src/features/publishing/mcp-entry.js';

const publicationSuggestion = {
  category: 'general',
  scenario_ids: [],
  keywords: ['异常输入', '数据校验'],
  purpose: '供维护者检查异常输入。',
};
const assessment = {
  publication_suggestion: publicationSuggestion,
  summary: '入口文档需要明确异常输入行为。',
  risk: 'medium',
  findings: [
    {
      title: '补充异常输入说明',
      severity: 'warning',
      explanation: '文档尚未明确约定。',
      recommendation: '增加边界情况说明。',
      evidence: [{ path: 'SKILL.md', start_line: 1, end_line: 3 }],
    },
  ],
  limitations: ['未执行资源脚本。'],
  suggested_resolution: '核实异常输入处理并补充说明。',
};
const script = {
  turns: [
    { name: 'resource_overview', input: {} },
    { name: 'list_files', input: { offset: 0, limit: 50 } },
    { name: 'read_file', input: { path: 'SKILL.md', start_line: 1, lines: 120 } },
    { name: 'scan_findings', input: {} },
    { name: 'compare_release', input: {} },
  ],
  text: '已检查 SKILL.md 第 1–3 行，建议补充异常输入说明；未执行脚本。',
  json: JSON.stringify(assessment),
};
const feedbackJson = JSON.stringify(
  Object.fromEntries(
    Object.entries(assessment).filter(([key]) => key !== 'publication_suggestion'),
  ),
);
async function run(f: TestHub) {
  const job = await f.hub.jobs.claim('business-test', ['ai_execution']);
  assert(job);
  await f.hub.ai.runtime.process(
    {
      execution_id: job.aggregate_id,
      dispatch_id: job.id,
      owner: job.lease_owner!,
      epoch: job.lease_epoch,
      attempt: job.attempt,
    },
    new AbortController().signal,
  );
  return f.hub.ai.runtime.get(job.aggregate_id);
}

async function grantMaintainer(f: TestHub, principalId: string, teamId = f.teamId) {
  const role = await f.store.find('roles', 'key', 'maintainer');
  assert(role);
  return f.hub.administration.grantRole(f.admin, {
    principal_id: principalId,
    role_id: role.id,
    scope_type: 'team',
    scope_id: teamId,
  });
}

test('AI 只能在查询词表后起草未登记的场景，人工采纳只回填草稿', async (t) => {
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const definition = { name: '代码评审', description: '审查提交的功能和测试。' };
  const fields = {
    ...publicationSuggestion,
    category: 'scenario',
    proposed_scenarios: [definition],
    scenario_reason: '词表中缺少代码评审任务。',
  };
  for (const { lookup, exists, valid } of [
    { lookup: false, exists: false, valid: false },
    { lookup: true, exists: true, valid: false },
    { lookup: true, exists: false, valid: true },
  ]) {
    const provider = await fixture('openai', 'tools', false, {
      ...script,
      turns: lookup
        ? [...script.turns, { name: 'publication_scenarios', input: { query: '未命中' } }]
        : script.turns,
      json: JSON.stringify({ ...assessment, publication_suggestion: fields }),
    });
    t.after(provider.close);
    const f = await createTestHub(t, { ai: frameworkConfig(provider.url) });
    if (exists) await f.hub.administration.createScenario(f.admin, definition);
    await receiveSkill(f);
    const execution = await run(f);
    if (!valid) {
      assert.equal(execution.status, 'failed');
      assert.equal(execution.payload.error?.code, 'AI_OUTPUT_INVALID');
      continue;
    }
    assert.equal(execution.status, 'waiting_input', JSON.stringify(execution.payload.error));
    const [interaction] = (await f.hub.ai.runtime.view(execution.id)).interactions;
    await f.hub.ai.runtime.respond(
      execution.id,
      interaction.id,
      f.admin.id,
      interaction.payload.revision,
      { approved: true },
    );
    const accepted = acceptedSuggestion(executionResponse(await run(f)));
    assert.deepEqual(accepted?.fields, fields);
    assert.deepEqual(await f.hub.catalog.listScenarios(f.admin), []);
    assert.deepEqual(await f.store.all('requests'), []);
  }
});

test('资源审计通过自主工具调查、SSE 活动、人工恢复形成报告，发布申请保持待审', async (t) => {
  const scenarioId = randomUUID();
  const suggested = { ...publicationSuggestion, category: 'scenario', scenario_ids: [scenarioId] };
  const provider = await fixture('openai', 'tools', false, {
    ...script,
    turns: [...script.turns, { name: 'publication_scenarios', input: { query: '工程' } }],
    json: JSON.stringify({ ...assessment, publication_suggestion: suggested }),
  });
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t, { ai: frameworkConfig(provider.url) });
  await f.store.insert('scenarios', {
    id: scenarioId,
    name: '工程实践',
    description: '工程工作流',
    active: true,
  });
  const intake = await receiveSkill(f);
  const beforePublication = await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 });
  assert.equal(beforePublication.length, 1, '上传校验完成后即排队，无需提交发布申请');
  const request = await submitPublication(f, intake);
  const queued = await f.hub.ai.runtime.store.list('ai_executions', {
    owner_id: f.admin.id,
    limit: 100,
  });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].id, beforePublication[0].id, '发布申请复用上传审计');
  assert.equal(queued[0].payload.operation_id, 'resource-audit');
  assert.deepEqual(queued[0].payload.input, { version_id: intake.version_id });
  const waiting = await run(f);
  assert.equal(waiting.status, 'waiting_input', JSON.stringify(waiting.payload.error));
  const firstRequest = JSON.stringify(provider.requests[0].body.messages);
  assert(!firstRequest.includes('name: sample-skill'), '首轮不能预装资源全文');
  assert(provider.requests.length >= 7, '超过原先五轮默认限制仍应完成调查');
  const view = await f.hub.ai.runtime.view(waiting.id);
  assert(
    view.activity.some(
      (item) =>
        item.payload.type === 'tool.started' &&
        String(item.payload.data.display).includes('SKILL.md'),
    ),
  );
  assert(view.artifacts.some((item) => item.payload.name === 'assessment'));
  const interaction = view.interactions[0];
  await f.hub.ai.runtime.respond(
    waiting.id,
    interaction.id,
    f.admin.id,
    interaction.payload.revision,
    { approved: true, comment: '确认检查范围', apply_feedback: false },
  );
  const done = await run(f);
  assert.equal(done.status, 'succeeded', JSON.stringify(done.payload.error));
  assert.deepEqual(
    (done.payload.result as { assessment: typeof assessment }).assessment.publication_suggestion,
    suggested,
  );
  assert.deepEqual(acceptedSuggestion(executionResponse(done)), {
    executionId: done.id,
    versionId: intake.version_id,
    digest: intake.content_digest,
    fields: suggested,
    notices: [
      {
        title: assessment.findings[0].title,
        explanation: assessment.findings[0].explanation,
        evidence: ['SKILL.md:1–3'],
      },
    ],
  });
  assert.equal((await f.store.get('requests', request.id))?.state, 'pending');
  assert.equal((await f.store.all('releases')).length, 0);
  assert.equal(provider.requests.length, 8, '人工恢复不重复调用模型');
});

test('反馈提交自动排队且幂等，采纳后仅写入处理中，效果回执与业务写入共同提交', async (t) => {
  const provider = await fixture('openai', 'tools', false, {
    ...script,
    json: feedbackJson,
    turns: [...script.turns, { name: 'read_feedback', input: {} }],
  });
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t);
  await grantMaintainer(f, f.reader.id);
  const uploader = await f.hub.identity.principal(f.reader.id);
  const { intake } = await publishSkill({ ...f, admin: uploader });
  Object.assign(f.hub.ai.runtime.config, frameworkConfig(provider.url));
  const input = assetFeedbackRequestSchema.parse({
    version_id: intake.version_id,
    idempotency_key: randomUUID(),
    consent: true,
    kind: 'defect',
    title: '异常输入',
    scenario: '空数据',
    expected: '提示',
    actual: '失败',
  });
  const reported = await f.hub.feedback.report(f.reviewer, input);
  assert.equal((await f.hub.feedback.report(f.reviewer, input)).id, reported.id);
  assert.equal(reported.submitted_by, f.reviewer.id);
  assert.equal((await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 })).length, 1);
  const waiting = await run(f);
  assert.equal(waiting.owner_id, uploader.id);
  assert.equal(waiting.status, 'waiting_input', JSON.stringify(waiting.payload.error));
  const interaction = (await f.hub.ai.runtime.view(waiting.id)).interactions[0];
  await f.hub.ai.runtime.respond(
    waiting.id,
    interaction.id,
    uploader.id,
    interaction.payload.revision,
    { approved: true, comment: '', apply_feedback: true },
  );
  assert.equal((await run(f)).status, 'succeeded');
  const feedback = await f.hub.feedback.get(f.admin, reported.id);
  assert.equal(feedback.status, 'in_progress');
  assert.equal(feedback.resolution, assessment.suggested_resolution);
  assert.equal(feedback.revision, 2);
  assert.equal(
    (
      await f.hub.ai.runtime.store.list('ai_effects', { execution_id: waiting.id, limit: 100 })
    ).filter((item) => item.payload.tool_id === 'apply-feedback-assessment').length,
    1,
  );
});

test('整理反馈报告时能独立核对上报原文，即使调查扩大了影响范围', async (t) => {
  const investigation = '远端服务故障，所有用户都无法连接。';
  const provider = await fixture('openai', 'tools', false, {
    turns: [
      { name: 'read_file', input: { path: 'SKILL.md' } },
      { name: 'read_feedback', input: {} },
    ],
    text: investigation,
    json: JSON.stringify({
      summary: '提交者报告一次连接超时，现有材料不能确定原因或影响范围。',
      risk: 'unknown',
      findings: [],
      limitations: ['缺少区分客户端和服务端故障的证据。'],
      suggested_resolution: '核对同一次请求的脱敏错误码。',
    }),
  });
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t);
  const { intake } = await publishSkill(f);
  Object.assign(f.hub.ai.runtime.config, frameworkConfig(provider.url));
  const feedback = await f.hub.feedback.report(
    f.admin,
    assetFeedbackRequestSchema.parse({
      version_id: intake.version_id,
      idempotency_key: randomUUID(),
      consent: true,
      kind: 'defect',
      title: '首次连接超时',
      scenario: '首次连接',
      expected: '连接成功',
      actual: '我在第一次连接时超时，第二次成功。',
      evidence: '客户端日志：首次请求 ETIMEDOUT。',
      blocking: false,
    }),
  );
  const waiting = await run(f);
  assert.equal(waiting.status, 'waiting_input', JSON.stringify(waiting.payload.error));
  const messages = provider.requests.at(-1)?.body.messages as { role: string; content: string }[];
  const message = messages.find((item) => item.role === 'user');
  assert(message);
  const material = JSON.parse(message.content) as {
    investigation: string;
    reported_feedback: Pick<typeof feedback, 'actual' | 'evidence' | 'blocking'>;
  };
  assert.equal(material.investigation, investigation);
  assert.equal(material.reported_feedback.actual, feedback.actual);
  assert.equal(material.reported_feedback.evidence, feedback.evidence);
  assert.equal(material.reported_feedback.blocking, feedback.blocking);
});

test('原上传人失去维护权限时，反馈保留并只向当前合格的维护者派单', async (t) => {
  const f = await createTestHub(t);
  const { intake } = await publishSkill(f);
  Object.assign(f.hub.ai.runtime.config, frameworkConfig());
  const binding = (await f.store.where('role_bindings', 'principal_id', f.admin.id)).find(
    (item) => item.scope_type === 'team',
  );
  assert(binding);
  await f.hub.administration.removeGrant(f.admin, 'role_bindings', binding.id);
  const report = () =>
    f.hub.feedback.report(
      f.reader,
      assetFeedbackRequestSchema.parse({
        version_id: intake.version_id,
        idempotency_key: randomUUID(),
        consent: true,
        kind: 'defect',
        title: '上传样例失败',
        scenario: '上传',
        expected: '通过',
        actual: '失败',
      }),
    );
  assert.equal((await report()).status, 'pending');
  assert.equal((await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 })).length, 0);
  const rotation = await f.hub.administration.createGroup(f.admin, { name: '反馈值班组' });
  await f.hub.administration.addMembership(f.admin, {
    group_id: rotation.id,
    user_id: f.reviewer.id,
  });
  await grantMaintainer(f, rotation.id);
  const feedback = await report();
  const runs = await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 });
  assert.deepEqual(
    runs.map((row) => [row.owner_id, row.payload.input]),
    [[f.reviewer.id, { version_id: intake.version_id, feedback_id: feedback.id }]],
  );
  await grantMaintainer(f, f.admin.id);
  const version = await f.store.get('versions', intake.version_id);
  assert(version);
  await Promise.all([
    f.hub.ai.autoTriage(version, feedback.id),
    f.hub.ai.autoTriage(version, feedback.id),
  ]);
  const retried = await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 });
  assert.deepEqual(
    retried.map((row) => row.id),
    [runs[0].id],
  );
});

test('反馈仅共享带自动分派标识的研判，协作者只读且两项授权都必须仍然有效', async (t) => {
  const f = await createTestHub(t);
  const { intake } = await publishSkill(f);
  Object.assign(f.hub.ai.runtime.config, frameworkConfig());
  const maintainer = await f.hub.administration.createUser(f.admin, {
    username: 'triage-maintainer',
    display_name: '反馈维护者',
    password: testPassword,
    group_ids: [f.teamId],
  });
  const grant = await grantMaintainer(f, maintainer.id);
  const feedback = await f.hub.feedback.report(
    f.reader,
    assetFeedbackRequestSchema.parse({
      version_id: intake.version_id,
      idempotency_key: randomUUID(),
      consent: true,
      kind: 'defect',
      title: '上传失败',
      scenario: '上传',
      expected: '通过',
      actual: '失败',
    }),
  );
  const target = { version_id: intake.version_id, feedback_id: feedback.id };
  const runtime = f.hub.ai.runtime;
  const [automatic] = await runtime.store.list('ai_executions', { limit: 10 });
  assert.equal(automatic.owner_id, f.admin.id);
  const privateRun = await runtime.submit(f.admin.id, 'feedback-triage', target);
  const ownRun = await runtime.submit(maintainer.id, 'feedback-triage', target);
  const colleague = await signIn(f, maintainer.username);
  const list = async (client: typeof colleague, query: Record<string, unknown>) =>
    aiExecutionListResponseSchema.parse(
      (await client.get('/api/ai/executions').query(query).expect(200)).body,
    );
  const path = `/api/ai/executions/${automatic.id}`;
  const personal = await list(colleague, { version_id: intake.version_id });
  assert.deepEqual(
    personal.items.map((item) => item.id),
    [ownRun.id],
  );
  assert.equal(personal.automatic_triage, undefined);
  const first = await list(colleague, { ...target, limit: 1 });
  assert.deepEqual(
    first.items.map((item) => item.id),
    [ownRun.id],
  );
  assert.equal(first.automatic_triage?.id, automatic.id);
  assert.equal(first.automatic_triage?.owner_display_name, f.admin.display_name);
  assert(first.next_cursor);
  assert.equal(
    (await list(colleague, { ...target, limit: 1, cursor: first.next_cursor })).automatic_triage,
    undefined,
  );
  assert.equal(
    (await list(colleague, { ...target, version_id: randomUUID() })).automatic_triage,
    undefined,
  );
  await colleague.get(path).expect(200);
  await colleague.get(`/api/ai/executions/${privateRun.id}`).expect(404);
  await colleague
    .post(path + '/cancel')
    .set('If-Match', `"${automatic.payload.revision}"`)
    .set('Idempotency-Key', randomUUID())
    .send({})
    .expect(404);
  await assert.rejects(runtime.respond(automatic.id, randomUUID(), maintainer.id, 1, {}), {
    code: 'AI_FORBIDDEN',
  });
  await runtime.cancel(automatic.id, f.admin.id, automatic.payload.revision);
  const events = await colleague.get(path + '/events').expect(200);
  assert.match(events.text, /event: stream\.snapshot/);

  const aiRole = await f.hub.administration.createRole(f.admin, {
    name: '业务 AI',
    permissions: ['ai:execute'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: aiRole.id,
    scope_type: 'team',
    scope_id: f.teamId,
  });
  const reporter = await signIn(f, f.reader.username);
  assert.equal((await list(reporter, target)).automatic_triage, undefined);
  await reporter.get(path).expect(404);

  const maintainRole = await f.hub.administration.createRole(f.admin, {
    name: '仅维护',
    permissions: ['asset:maintain'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: maintainer.id,
    role_id: maintainRole.id,
    scope_type: 'team',
    scope_id: f.teamId,
  });
  const other = await f.hub.administration.createGroup(f.admin, { name: '其他团队' });
  await grantMaintainer(f, maintainer.id, other.id);
  await f.hub.administration.removeGrant(f.admin, 'role_bindings', grant.id);
  assert.equal((await list(colleague, target)).automatic_triage, undefined);
  await colleague.get(path).expect(404);
  await colleague.get(path + '/events').expect(404);
  await grantMaintainer(f, maintainer.id);
  const asset = await f.hub.assetAccess.getAsset(intake.asset_id);
  await f.store.put('assets', { ...asset, lifecycle: 'blocked' });
  assert.equal((await list(colleague, target)).automatic_triage, undefined);
  await colleague.get(path).expect(404);
});

test('控制台跨用户分页只列可读执行，业务面板仍只列本人的任务', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  const request = await submitPublication(f, intake);
  const runtime = f.hub.ai.runtime;
  Object.assign(runtime.config, frameworkConfig());
  const target = { version_id: intake.version_id };
  const audit = await runtime.submit(f.reviewer.id, 'resource-audit', target);
  const own = await runtime.submit(f.admin.id, 'assistant', { prompt: '检查发布状态' });
  const review = await runtime.submit(f.reviewer.id, 'publication-review', {
    publication_request_id: request.id,
  });
  const admin = await signIn(f);
  await admin.get(`/api/ai/executions/${audit.id}`).expect(200);
  await admin.get(`/api/ai/executions/${review.id}`).expect(403);
  const list = async (query: Record<string, string | number>) =>
    aiExecutionListResponseSchema.parse(
      (await admin.get('/api/ai/executions').query(query).expect(200)).body,
    );
  const first = await list({ limit: 1 });
  assert.equal(first.items.length, 1);
  assert(first.next_cursor);
  const second = await list({ limit: 1, cursor: first.next_cursor });
  assert.equal(second.items.length, 1);
  assert.equal(second.next_cursor, null);
  assert.deepEqual(
    new Map([...first.items, ...second.items].map((item) => [item.id, item.owner_display_name])),
    new Map([
      [own.id, f.admin.display_name],
      [audit.id, f.reviewer.display_name],
    ]),
  );
  assert.deepEqual((await list(target)).items, []);
  assert.deepEqual(
    (
      await list({ q: f.reviewer.display_name, operation_id: 'resource-audit', status: 'queued' })
    ).items.map((item) => item.id),
    [audit.id],
  );
  assert.deepEqual((await list({ q: review.id })).items, []);
  const summary = aiExecutionLedgerResponseSchema.parse(
    (await admin.get('/api/ai/executions').query({ view: 'summary', q: '资源审计' }).expect(200))
      .body,
  );
  assert.deepEqual(
    summary.items.map((item) => item.id),
    [audit.id],
  );
  await admin.get(`/api/ai/executions/${audit.id}/diagnostics`).expect(200);
  await admin.get(`/api/ai/executions/${review.id}/diagnostics?download=markdown`).expect(403);
  const reviewer = await signIn(f, f.reviewer.username);
  await reviewer.get(`/api/ai/executions/${audit.id}/diagnostics?download=json`).expect(403);
});

test('团队维护者的上传自动排队，撤回目标团队授权后公开版本的任务也不可读', async (t) => {
  const f = await createTestHub(t, { ai: frameworkConfig() });
  const grant = await grantMaintainer(f, f.reader.id);
  const uploader = await f.hub.identity.principal(f.reader.id);
  const asUploader = { ...f, admin: uploader };
  const intake = await receiveSkill(asUploader);
  const client = await signIn(f, uploader.username);
  const { capabilities } = (await client.get('/api/me').expect(200)).body;
  assert.equal(capabilities.can_ai, true);
  assert.equal(capabilities.can_ai_console, false);
  await client.get('/api/ai/catalog').expect(403);
  await client.get('/api/ai/executions').expect(403);
  const { default_profile, profiles } = f.hub.ai.runtime.config;
  assert.deepEqual((await client.get('/api/ai/model-options').expect(200)).body, {
    default_profile,
    profiles: profiles.map(({ id, label }) => ({ id, label })),
  });
  const list = async () =>
    aiExecutionListResponseSchema.parse(
      (await client.get('/api/ai/executions').query({ version_id: intake.version_id }).expect(200))
        .body,
    ).items;
  const [audit] = await list();
  assert(audit && audit.operation_id === 'resource-audit' && audit.owner_id === uploader.id);
  await client.get(`/api/ai/executions/${audit.id}`).expect(200);
  await assert.rejects(f.hub.ai.runtime.submit(uploader.id, 'assistant', { prompt: 'test' }), {
    code: 'AI_FORBIDDEN',
  });
  const request = await submitPublication(asUploader, intake);
  await f.hub.publications.decide(
    f.reviewer,
    request.id,
    {
      decision: 'approve',
      comment: '核对公开范围',
      policy_digest: request.policy_digest,
      accepted_warnings: [],
    },
    `"${request.revision}"`,
    randomUUID(),
  );
  const other = await f.hub.administration.createGroup(f.admin, { name: '其他维护团队' });
  await grantMaintainer(f, uploader.id, other.id);
  await f.hub.administration.removeGrant(f.admin, 'role_bindings', grant.id);
  await client.get(`/api/ai/executions/${audit.id}`).expect(403);
  await client.get(`/api/ai/executions/${audit.id}/events`).expect(403);
  assert.deepEqual(await list(), []);
  await assert.rejects(
    f.hub.ai.runtime.submit(uploader.id, 'resource-audit', { version_id: intake.version_id }),
    { code: 'AI_FORBIDDEN' },
  );
});

test('业务目标在提交、读取时复核权限；工具不能绕过固定版本与文件边界', async (t) => {
  const f = await createTestHub(t, { ai: frameworkConfig() });
  const intake = await receiveSkill(f);
  const evidence = new AgentEvidenceService(
    { store: f.store, blobs: f.hub.blobs, identity: f.hub.identity },
    f.hub.assetAccess,
    f.hub.feedback,
  );
  await assert.rejects(() => evidence.read(f.reader.id, intake.version_id, 'SKILL.md', 1, 10));
  await assert.rejects(() => evidence.read(f.admin.id, intake.version_id, '../SKILL.md', 1, 10));
  const execution = await f.hub.ai.runtime.submit(f.admin.id, 'resource-audit', {
    version_id: intake.version_id,
  });
  const asset = await f.hub.assetAccess.getAsset(intake.asset_id);
  await f.store.put('assets', { ...asset, lifecycle: 'blocked' });
  await assert.rejects(() => f.hub.ai.principal(f.admin, execution, true));
  await assert.rejects(() =>
    f.hub.ai.runtime.submit(f.admin.id, 'resource-audit', { version_id: intake.version_id }),
  );
  await assert.rejects(
    () => f.hub.ai.runtime.submit(f.reader.id, 'resource-audit', { version_id: intake.version_id }),
    (error: unknown) => error instanceof AiError && error.code === 'AI_FORBIDDEN',
  );
});

function evidenceFor(f: TestHub) {
  return new AgentEvidenceService(
    { store: f.store, blobs: f.hub.blobs, identity: f.hub.identity },
    f.hub.assetAccess,
    f.hub.feedback,
  );
}

test('文本搜索不把行号前缀当作正文命中', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  const result = await evidenceFor(f).search(f.admin.id, intake.version_id, '7:', 0);
  assert.deepEqual(result.matches, []);
});

test('候选版本的文本读取按单文件或搜索页记审计，纯权限复查没有读取记录', async (t) => {
  const f = await createTestHub(t);
  const slug = 'audit-page';
  const bytes = await archive([
    { path: 'SKILL.md', bytes: skillDocument(slug), executable: false },
    ...Array.from({ length: 10 }, (_, index) => ({
      path: `references/${index}.md`,
      bytes: Buffer.from('可检索内容'),
      executable: false,
    })),
  ]);
  const receipt = await f.hub.intakes.receive(
    f.admin,
    bytes,
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug,
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  await f.worker.tick();
  const intake = await f.hub.intakeQueries.getDetail(f.admin, receipt.intake_id);
  assert(intake.version_id);
  const evidence = evidenceFor(f);
  Object.assign(f.hub.ai.runtime.config, frameworkConfig());
  const task = await f.hub.ai.runtime.submit(f.admin.id, 'resource-audit', {
    version_id: intake.version_id,
  });
  await f.hub.ai.principal(f.admin, task, true);
  await assert.rejects(evidence.search(f.reader.id, intake.version_id, '可检索内容', 0), {
    code: 'FORBIDDEN',
  });
  const read = await evidence.read(f.admin.id, intake.version_id, 'SKILL.md', 1, 3);
  assert(read.text);
  const first = await evidence.search(f.admin.id, intake.version_id, '可检索内容', 0);
  assert.equal(first.next_offset, 10);
  const next = await evidence.search(
    f.admin.id,
    intake.version_id,
    '可检索内容',
    first.next_offset,
  );
  assert.equal(next.next_offset, null);
  assert.equal(first.matches.length + next.matches.length, 10);
  const records = (await f.store.where('audit', 'entity_id', intake.version_id)).filter(
    (row) => row.action === 'content.management_read',
  );
  assert(records.every((row) => row.actor_id === f.admin.id));
  const details = records.map((row) => row.metadata);
  assert.deepEqual(
    details.filter((item) => item.tool === 'read_file'),
    [{ tool: 'read_file', path: 'SKILL.md', start_line: 1, lines: 3 }],
  );
  assert.deepEqual(
    details
      .filter((item) => item.tool === 'search_files')
      .sort((a, b) => Number(a.offset) - Number(b.offset)),
    [
      { tool: 'search_files', offset: 0, limit: 10 },
      { tool: 'search_files', offset: 10, limit: 10 },
    ],
  );
  assert.equal(records.length, 3);
  const grant = await grantMaintainer(f, f.reader.id);
  const readBlob = f.blobs.read.bind(f.blobs);
  t.mock.method(
    f.blobs,
    'read',
    async (ref: string) => {
      const bytes = await readBlob(ref);
      await f.hub.administration.removeGrant(f.admin, 'role_bindings', grant.id);
      return bytes;
    },
    { times: 1 },
  );
  await assert.rejects(evidence.search(f.reader.id, intake.version_id, '可检索内容', 0), {
    code: 'FORBIDDEN',
  });
});

test('搜索命中超出单页上限时，被截断的文件标为未完整检查', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f, { body: Array(45).fill('标记').join('\n') });
  const result = await evidenceFor(f).search(f.admin.id, intake.version_id, '标记', 0);
  assert.equal(result.matches.length, 40);
  assert.deepEqual(result.partial_files, ['SKILL.md']);
});

test('单行超过读取上限时明确返回不可读，不让调查停在同一行', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f, { body: 'a'.repeat(25000) });
  const result = await evidenceFor(f).read(f.admin.id, intake.version_id, 'SKILL.md', 8, 10);
  assert.equal(result.text, '');
  assert(result.unavailable);
});

test('模型伪造未读取文件的引用时任务失败，不生成可采纳报告', async (t) => {
  const provider = await fixture('openai', 'tools', false, {
    ...script,
    json: JSON.stringify({
      ...assessment,
      findings: [
        {
          ...assessment.findings[0],
          evidence: [{ path: 'secret.txt', start_line: 1, end_line: 2 }],
        },
      ],
    }),
  });
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t, { ai: frameworkConfig(provider.url) });
  await receiveSkill(f);
  const failed = await run(f);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.payload.error?.code, 'AI_OUTPUT_INVALID');
  assert.equal((await f.hub.ai.runtime.view(failed.id)).interactions.length, 0);
});

test('分页读取的相邻区间可连续引用，跨越未读行的引用仍使任务失败', async (t) => {
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  for (const [endLine, status] of [
    [4, 'waiting_input'],
    [6, 'failed'],
  ] as const) {
    const provider = await fixture('openai', 'tools', false, {
      ...script,
      turns: script.turns.flatMap((turn) =>
        turn.name === 'read_file'
          ? [1, 3, 6].map((start_line) => ({
              name: 'read_file',
              input: { path: 'SKILL.md', start_line, lines: 2 },
            }))
          : [turn],
      ),
      json: JSON.stringify({
        ...assessment,
        findings: [
          {
            ...assessment.findings[0],
            evidence: [{ path: 'SKILL.md', start_line: 1, end_line: endLine }],
          },
        ],
      }),
    });
    t.after(provider.close);
    const f = await createTestHub(t, { ai: frameworkConfig(provider.url) });
    await receiveSkill(f);
    const execution = await run(f);
    assert.equal(execution.status, status, `引用 SKILL.md:1–${endLine}`);
    if (status === 'failed') assert.equal(execution.payload.error?.code, 'AI_OUTPUT_INVALID');
  }
});

test('模型给出超量关键词时按序只保留前 8 个，不因数量拒绝整份报告', async (t) => {
  const keywords = Array.from({ length: 10 }, (_, index) => `检索词${index + 1}`);
  const provider = await fixture('openai', 'tools', false, {
    ...script,
    json: JSON.stringify({
      ...assessment,
      publication_suggestion: { ...publicationSuggestion, keywords },
    }),
  });
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t, { ai: frameworkConfig(provider.url) });
  await receiveSkill(f);
  const waiting = await run(f);
  assert.equal(waiting.status, 'waiting_input', JSON.stringify(waiting.payload.error));
  const artifact = (await f.hub.ai.runtime.view(waiting.id)).artifacts.find(
    (item) => item.payload.name === 'assessment',
  );
  assert(artifact);
  assert.deepEqual(
    (artifact.payload.content as { assessment: typeof assessment }).assessment
      .publication_suggestion.keywords,
    keywords.slice(0, 8),
  );
});

test('MCP 审计按需读取 server.json 和声明工具，明确静态边界并允许不采纳', async (t) => {
  const report = {
    ...assessment,
    findings: [
      {
        ...assessment.findings[0],
        evidence: [{ path: 'server.json', start_line: 1, end_line: 1 }],
      },
    ],
  };
  const provider = await fixture('openai', 'tools', false, {
    turns: [
      { name: 'resource_overview', input: {} },
      { name: 'read_file', input: { path: 'server.json', start_line: 1, lines: 100 } },
      { name: 'mcp_declarations', input: {} },
    ],
    text: '已检查 server.json；远端工具能力尚未验证。',
    json: JSON.stringify(report),
  });
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t, { ai: frameworkConfig(provider.url) });
  const document = buildMcpDocument(
    { ...emptyMcpEntry, mode: 'url', url: 'https://example.test/mcp', description: '文档服务' },
    'audit-mcp',
    '1.0.0',
  );
  const receipt = await f.hub.intakes.receive(
    f.admin,
    Buffer.from(JSON.stringify(document)),
    'server.json',
    {
      target: 'new',
      kind: 'mcp',
      slug: 'audit-mcp',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  await f.worker.tick();
  const intake = await f.hub.intakeQueries.getDetail(f.admin, receipt.intake_id);
  assert.equal(intake.state, 'ready');
  assert(intake.version_id);
  const waiting = await run(f);
  assert.equal(waiting.status, 'waiting_input', JSON.stringify(waiting.payload.error));
  const view = await f.hub.ai.runtime.view(waiting.id);
  assert(view.activity.some((item) => item.payload.data.tool_id === 'mcp-declarations'));
  assert(JSON.stringify(view.artifacts).includes('未连接远端服务'));
  const interaction = view.interactions[0];
  await f.hub.ai.runtime.respond(
    waiting.id,
    interaction.id,
    f.admin.id,
    interaction.payload.revision,
    { approved: false, comment: '需继续核实', apply_feedback: false },
  );
  const done = await run(f);
  assert.equal(done.status, 'succeeded');
  assert.equal((done.payload.result as { approved: boolean }).approved, false);
  assert.equal(acceptedSuggestion(executionResponse(done)), undefined);
});

test('等待确认期间反馈被人工修改时，Agent 写回冲突不覆盖人工处理', async (t) => {
  const provider = await fixture('openai', 'tools', false, {
    ...script,
    json: feedbackJson,
    turns: [...script.turns, { name: 'read_feedback', input: {} }],
  });
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t);
  const { intake } = await publishSkill(f);
  Object.assign(f.hub.ai.runtime.config, frameworkConfig(provider.url));
  const feedback = await f.hub.feedback.report(
    f.admin,
    assetFeedbackRequestSchema.parse({
      version_id: intake.version_id,
      idempotency_key: randomUUID(),
      consent: true,
      kind: 'suggestion',
      title: '补充说明',
      scenario: '使用资源',
      expected: '说明完整',
      actual: '需要补充',
    }),
  );
  const waiting = await run(f);
  assert.equal(waiting.status, 'waiting_input');
  await f.hub.feedback.update(f.admin, feedback.id, {
    revision: feedback.revision,
    status: 'resolved',
    resolution: '人工已解决',
    fixed_version_id: null,
  });
  const interaction = (await f.hub.ai.runtime.view(waiting.id)).interactions[0];
  await f.hub.ai.runtime.respond(
    waiting.id,
    interaction.id,
    f.admin.id,
    interaction.payload.revision,
    { approved: true, apply_feedback: true, comment: '' },
  );
  assert.equal((await run(f)).status, 'failed');
  const current = await f.hub.feedback.get(f.admin, feedback.id);
  assert.equal(current.status, 'resolved');
  assert.equal(current.resolution, '人工已解决');
  assert.equal(
    (
      await f.hub.ai.runtime.store.list('ai_effects', { execution_id: waiting.id, limit: 100 })
    ).filter((item) => item.payload.tool_id === 'apply-feedback-assessment').length,
    0,
  );
});

test('Skill 引用文件由工具分段读取，超过十轮调用仍可完成且记录精确范围', async (t) => {
  const turns = [
    { name: 'read_file', input: { path: 'SKILL.md', start_line: 1, lines: 100 } },
    ...Array.from({ length: 11 }, (_, index) => ({
      name: 'read_file',
      input: { path: 'references/guide.md', start_line: index * 20 + 1, lines: 20 },
    })),
  ];
  const report = {
    ...assessment,
    findings: [
      {
        ...assessment.findings[0],
        evidence: [{ path: 'references/guide.md', start_line: 201, end_line: 210 }],
      },
    ],
  };
  const provider = await fixture('openai', 'tools', false, {
    turns,
    text: '已按入口引用分段检查 guide.md。',
    json: JSON.stringify(report),
  });
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t, { ai: frameworkConfig(provider.url) });
  const bytes = await archive([
    {
      path: 'SKILL.md',
      bytes: skillDocument('paged-skill', '详见 [操作说明](references/guide.md)。'),
      executable: false,
    },
    {
      path: 'references/guide.md',
      bytes: Buffer.from(
        Array.from({ length: 240 }, (_, i) => `第 ${i + 1} 项说明：核对输入。`).join('\n'),
      ),
      executable: false,
    },
  ]);
  const receipt = await f.hub.intakes.receive(
    f.admin,
    bytes,
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'paged-skill',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  await f.worker.tick();
  const intake = await f.hub.intakeQueries.getDetail(f.admin, receipt.intake_id);
  assert.equal(intake.state, 'ready');
  assert(intake.version_id);
  const waiting = await run(f);
  assert.equal(waiting.status, 'waiting_input', JSON.stringify(waiting.payload.error));
  assert.equal(waiting.payload.usage.tools, 12);
  const result = (await f.hub.ai.runtime.view(waiting.id)).artifacts.find(
    (item) => item.payload.name === 'assessment',
  );
  assert(result);
  assert(JSON.stringify(result.payload.content).includes('references/guide.md'));
  assert(!JSON.stringify(provider.requests[0].body).includes('第 240 项说明'));
});

test('自动审计无模型或权限时跳过，并发及失败后的自动触发复用任务', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  assert.equal((await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 })).length, 0);
  Object.assign(f.hub.ai.runtime.config, frameworkConfig());
  await f.store.tx(async () => {
    await f.hub.ai.autoSubmit('removed-user', 'resource-audit', intake.version_id);
    await f.hub.ai.autoSubmit(f.admin, 'resource-audit', randomUUID());
    await f.store.audit(f.admin.id, 'test.optional-ai', intake.id);
  });
  assert((await f.store.all('audit')).some((entry) => entry.action === 'test.optional-ai'));
  await Promise.all([
    f.hub.ai.autoSubmit(f.admin, 'resource-audit', intake.version_id),
    f.hub.ai.autoSubmit(f.admin.id, 'resource-audit', intake.version_id),
  ]);
  const tasks = await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 });
  assert.equal(tasks.length, 1);
  await f.hub.ai.runtime.store.put('ai_executions', { ...tasks[0], status: 'failed' });
  await f.hub.ai.autoSubmit(f.admin, 'resource-audit', intake.version_id);
  assert.equal((await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 })).length, 1);
  for (const key of ['admin', 'maintainer']) {
    const role = await f.store.find('roles', 'key', key);
    assert(role);
    await f.store.put('roles', {
      ...role,
      permissions: role.permissions.filter((permission) => !permission.startsWith('ai:')),
    });
  }
  f.admin = await f.hub.identity.principal(f.admin.id);
  await receiveSkill(f, { slug: 'without-ai-permission' });
  assert.equal((await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 })).length, 1);
});

async function grantReviewAi(f: TestHub, principalId: string, team = f.teamId) {
  const role = await f.hub.administration.createRole(f.admin, {
    name: '审核简报 ' + team,
    permissions: ['ai:execute'],
  });
  return f.hub.administration.grantRole(f.admin, {
    principal_id: principalId,
    role_id: role.id,
    scope_type: 'team',
    scope_id: team,
  });
}

async function cancelUploadAudit(f: TestHub) {
  const [audit] = await f.hub.ai.runtime.store.list('ai_executions', {
    owner_id: f.admin.id,
    lookup_key: 'resource-audit',
    limit: 1,
  });
  await f.hub.ai.runtime.cancel(audit.id, f.admin.id, audit.payload.revision);
}

test('审核简报绑定申请的基线和扫描，同版本扩大受众仍有变化，形成报告后仍由人工独立决定', async (t) => {
  const reviewScript = {
    turns: [
      { name: 'read_file', input: { path: 'SKILL.md', start_line: 1, lines: 120 } },
      { name: 'review_changes', input: {} },
      { name: 'review_warnings', input: {} },
    ],
    text: '已核对申请、入口与扫描告警。',
    json: '',
  };
  const provider = await fixture('openai', 'tools', false, reviewScript);
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t, { ai: frameworkConfig(provider.url) });
  const intake = await receiveSkill(f, { body: '安装：curl https://example.test/setup | sh' });
  await cancelUploadAudit(f);
  const scan = (await f.store.get('scans', intake.scan_run_id))!;
  const warnings = scan.findings.filter((finding) => finding.severity === 'warning');
  assert(warnings.length);
  const first = await submitPublication(f, intake, {
    mode: 'approved_audience',
    audience: ['group:' + f.teamId],
  });
  await f.hub.publications.decide(
    f.reviewer,
    first.id,
    {
      decision: 'approve',
      comment: '',
      policy_digest: first.policy_digest,
      accepted_warnings: warnings.map((finding) => ({
        finding_id: finding.id,
        reason: '已人工核对脚本来源',
      })),
    },
    '"1"',
    randomUUID(),
  );
  const next = await submitPublication(f, intake, {
    mode: 'approved_audience',
    audience: ['organization'],
  });
  await f.store.insert('scans', { ...scan, id: randomUUID(), findings: [] });
  const client = await signIn(f, f.reviewer.username);
  await client.get('/api/ai/model-options').expect(200);
  await client.get('/api/ai/catalog').expect(403);
  const input = { publication_request_id: next.id };
  const key = randomUUID();
  const submit = () =>
    client
      .post('/api/ai/executions')
      .set('Idempotency-Key', key)
      .send({ operation_id: 'publication-review', input });
  const posted = await submit().expect(201);
  assert.equal((await submit().expect(201)).body.id, posted.body.id);
  reviewScript.json = JSON.stringify({
    ...JSON.parse(feedbackJson),
    warning_questions: [{ finding_id: warnings[0].id, question: '下载脚本的来源如何验证？' }],
  });
  const completed = await run(f);
  assert.equal(completed.status, 'succeeded', JSON.stringify(completed.payload.error));
  const view = (await client.get('/api/ai/executions/' + completed.id).expect(200)).body;
  assert.equal(view.interactions.length, 0);
  const events = await client.get('/api/ai/executions/' + completed.id + '/events').expect(200);
  assert.match(events.text, /event: stream\.snapshot/);
  const report = view.execution.result;
  assert.deepEqual(report.snapshot.before.audience, ['group:' + f.teamId]);
  assert.deepEqual(report.snapshot.proposed.audience, ['organization']);
  assert.equal(report.snapshot.changed_files, 0);
  assert.equal(report.snapshot.policy_digest, next.policy_digest);
  assert.equal(report.snapshot.base_release_id, next.base_release_id);
  assert.equal(report.snapshot.scan_run_id, scan.id);
  assert.deepEqual(
    report.warnings.map((w: { finding_id: string }) => w.finding_id),
    warnings.map((w) => w.id),
  );
  assert.equal(report.assessment.warning_questions[0].finding_id, warnings[0].id);
  assert.equal((await f.store.get('requests', next.id))?.state, 'pending');
  assert.equal((await f.store.all('releases')).length, 1);
  for (const [request, expected] of [
    [next, [completed.id]],
    [first, []],
  ] as const) {
    const list = aiExecutionListResponseSchema.parse(
      (
        await client
          .get('/api/ai/executions')
          .query({ publication_request_id: request.id })
          .expect(200)
      ).body,
    );
    assert.deepEqual(
      list.items.map((item) => item.id),
      expected,
    );
  }
  await f.hub.publications.decide(
    await f.hub.identity.principal(f.reviewer.id),
    next.id,
    {
      decision: 'reject',
      comment: '需要补充共享目的',
      policy_digest: next.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const history = (await client.get('/api/ai/executions/' + completed.id).expect(200)).body;
  assert.deepEqual(history.execution.result, report);
  await client
    .post('/api/ai/executions')
    .set('Idempotency-Key', randomUUID())
    .send({ operation_id: 'publication-review', input })
    .expect(409);
});

test('审核助手要求独立审核及目标范围的 AI 权限，撤权后简报、事件与提交重放均受限', async (t) => {
  const f = await createTestHub(t, { ai: frameworkConfig('http://127.0.0.1:1/v1') });
  const intake = await receiveSkill(f);
  await cancelUploadAudit(f);
  const request = await submitPublication(f, intake);
  const input = { publication_request_id: request.id };
  const key = randomUUID();
  const post = (client: Awaited<ReturnType<typeof signIn>>, target = input) =>
    client
      .post('/api/ai/executions')
      .set('Idempotency-Key', key)
      .send({ operation_id: 'publication-review', input: target });
  const admin = await signIn(f);
  const manualRole = await f.hub.administration.createRole(f.admin, {
    name: '仅人工审核',
    permissions: ['review:decide'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: manualRole.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const reviewer = await signIn(f, f.reader.username);
  await post(admin).expect(403);
  await post(reviewer).expect(403);
  const other = await f.hub.administration.createGroup(f.admin, { name: '其他团队' });
  await grantReviewAi(f, f.reader.id, other.id);
  await post(reviewer).expect(403);
  const grant = await grantReviewAi(f, f.reader.id);
  const created = await post(reviewer).expect(201);
  const path = '/api/ai/executions/' + String(created.body.id);
  await reviewer.get(path).expect(200);
  await admin.get(path).expect(403);
  await f.hub.administration.removeGrant(f.admin, 'role_bindings', grant.id);
  await reviewer.get(path).expect(403);
  await reviewer.get(path + '/events').expect(403);
  await post(reviewer).expect(403);
  const stopped = await run(f);
  assert.equal(stopped.payload.error?.code, 'AI_FORBIDDEN');
  assert.equal(stopped.payload.usage.requests, 0);
  assert.deepEqual(
    (await reviewer.get('/api/ai/executions').query(input).expect(200)).body.items,
    [],
  );
});

test('多场景申请的简报要求 AI 执行权覆盖全部审核场景', async (t) => {
  const f = await createTestHub(t, { ai: frameworkConfig('http://127.0.0.1:1/v1') });
  const intake = await receiveSkill(f);
  const first = await f.hub.administration.createScenario(f.admin, { name: '测试环境' });
  const second = await f.hub.administration.createScenario(f.admin, { name: '正式环境' });
  const request = await f.hub.publications.submit(
    f.admin,
    {
      source_intake_id: intake.id,
      version_id: intake.version_id,
      base_release_id: null,
      category: 'scenario',
      scenario_ids: [first.id, second.id],
      distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
      purpose: '共享运维步骤',
      applies_to: {},
    },
    randomUUID(),
  );
  const builtin = (await f.store.find('roles', 'key', 'reviewer'))!;
  const manual = await f.hub.administration.createRole(f.admin, {
    name: '仅人工审核',
    permissions: ['review:decide'],
  });
  const grant = (role: string, scenario: string) =>
    f.hub.administration.grantRole(f.admin, {
      principal_id: f.reader.id,
      role_id: role,
      scope_type: 'scenario',
      scope_id: scenario,
    });
  await grant(builtin.id, first.id);
  await grant(manual.id, second.id);
  const submit = () =>
    f.hub.ai.runtime.submit(f.reader.id, 'publication-review', {
      publication_request_id: request.id,
    });
  const reader = await f.hub.identity.principal(f.reader.id);
  assert.equal((await f.hub.publicationQueries.getReview(reader, request.id)).can_decide, true);
  await assert.rejects(submit, { code: 'AI_FORBIDDEN' });
  await grant(builtin.id, second.id);
  const target = await f.hub.publicationQueries.getReview(
    await f.hub.identity.principal(f.reader.id),
    request.id,
  );
  assert.equal(target.can_use_review_agent, true);
  assert.equal(target.can_audit_version, false);
  assert.equal((await submit()).status, 'queued');
});

test('排队后发布基线变化使审核助手停止，不生成当前简报', async (t) => {
  const f = await createTestHub(t, { ai: frameworkConfig('http://127.0.0.1:1/v1') });
  const intake = await receiveSkill(f);
  await cancelUploadAudit(f);
  const request = await submitPublication(f, intake);
  await f.hub.ai.runtime.submit(f.reviewer.id, 'publication-review', {
    publication_request_id: request.id,
  });
  const asset = await f.hub.assetAccess.getAsset(intake.asset_id);
  await f.store.put('assets', { ...asset, revision: asset.revision + 1 });
  const execution = await run(f);
  assert.equal(execution.status, 'failed');
  assert.equal(execution.payload.error?.code, 'AI_CONFLICT');
  assert.equal(execution.payload.result, null);
  assert.equal(execution.payload.usage.requests, 0);
});

test('通用提名的提名者与来源共享者均不能以审核助手身份读取申请', async (t) => {
  const f = await createTestHub(t, { ai: frameworkConfig('http://127.0.0.1:1/v1') });
  const { intake } = await publishSkill(f);
  const release = (await f.hub.assetAccess.getAsset(intake.asset_id)).current_release_id;
  assert(release);
  const nomination = await f.hub.publications.nominate(
    await f.hub.identity.principal(f.reviewer.id),
    {
      release_id: release,
      reason: '适用于多个团队',
    },
    randomUUID(),
  );
  for (const user of [f.admin, f.reviewer]) {
    await assert.rejects(
      () =>
        f.hub.ai.runtime.submit(user.id, 'publication-review', {
          publication_request_id: nomination.id,
        }),
      { code: 'AI_FORBIDDEN' },
    );
  }
});

test('模型把另一条扫描告警写入简报时拒绝整个结果', async (t) => {
  const provider = await fixture('openai', 'tools', false, {
    turns: [
      { name: 'read_file', input: { path: 'SKILL.md' } },
      { name: 'review_warnings', input: {} },
    ],
    text: '已检查入口和本次扫描。',
    json: JSON.stringify({
      ...JSON.parse(feedbackJson),
      warning_questions: [{ finding_id: 'unrelated', question: '请核对用途' }],
    }),
  });
  t.after(provider.close);
  const previous = process.env.AI_FIXTURE_KEY;
  process.env.AI_FIXTURE_KEY = 'ai-fixture-key';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_FIXTURE_KEY;
    else process.env.AI_FIXTURE_KEY = previous;
  });
  const f = await createTestHub(t, { ai: frameworkConfig(provider.url) });
  const intake = await receiveSkill(f);
  await cancelUploadAudit(f);
  const request = await submitPublication(f, intake);
  await f.hub.ai.runtime.submit(f.reviewer.id, 'publication-review', {
    publication_request_id: request.id,
  });
  const execution = await run(f);
  assert.equal(execution.payload.error?.code, 'AI_OUTPUT_INVALID');
  assert.equal(execution.payload.result, null);
  assert.equal((await f.store.get('requests', request.id))?.state, 'pending');
});
