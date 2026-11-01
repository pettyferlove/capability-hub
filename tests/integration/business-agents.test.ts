import assert from 'node:assert/strict';
import { acceptedSuggestion } from '../../apps/web/src/features/ai/publication-suggestion.js';
import { executionResponse } from '../../apps/server/src/http/routes/ai-views.js';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { AgentEvidenceService } from '@capability-hub/application';
import { AiError } from '@capability-hub/ai';
import { assetFeedbackRequestSchema } from '@capability-hub/contracts';
import {
  createTestHub,
  publishSkill,
  receiveSkill,
  submitPublication,
  type TestHub,
} from '../support/application.js';
import { fixture } from '../support/ai-provider.js';
import { frameworkConfig } from '../support/ai-framework.js';
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
  const { intake } = await publishSkill(f);
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
  const reported = await f.hub.feedback.report(f.admin, input);
  assert.equal((await f.hub.feedback.report(f.admin, input)).id, reported.id);
  assert.equal((await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 })).length, 1);
  const waiting = await run(f);
  assert.equal(waiting.status, 'waiting_input', JSON.stringify(waiting.payload.error));
  const interaction = (await f.hub.ai.runtime.view(waiting.id)).interactions[0];
  await f.hub.ai.runtime.respond(
    waiting.id,
    interaction.id,
    f.admin.id,
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

test('业务目标在提交、读取时复核权限；工具不能绕过固定版本与文件边界', async (t) => {
  const f = await createTestHub(t, { ai: frameworkConfig() });
  const intake = await receiveSkill(f);
  const evidence = new AgentEvidenceService(
    { store: f.store, blobs: f.hub.blobs, identity: f.hub.identity },
    f.hub.assetAccess,
    f.hub.content,
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
    f.hub.content,
    f.hub.feedback,
  );
}

test('文本搜索不把行号前缀当作正文命中', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  const result = await evidenceFor(f).search(f.admin.id, intake.version_id, '7:', 0);
  assert.deepEqual(result.matches, []);
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
  const role = await f.store.find('roles', 'key', 'admin');
  assert(role);
  await f.store.put('roles', {
    ...role,
    permissions: role.permissions.filter((permission) => !permission.startsWith('ai:')),
  });
  f.admin = await f.hub.identity.principal(f.admin.id);
  await receiveSkill(f, { slug: 'without-ai-permission' });
  assert.equal((await f.hub.ai.runtime.store.list('ai_executions', { limit: 100 })).length, 1);
});
