import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test, type TestContext } from 'node:test';
import { createElement, type ReactElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createHubAgentRegistry } from '@capability-hub/hub-agents';
import {
  aiExecutionViewResponseSchema,
  aiEventResponseSchema,
  type AiExecutionResponse,
} from '@capability-hub/contracts';
import { ExecutionPanel } from '../../apps/web/src/features/ai/ExecutionPanel.js';
import { ExecutionDetails } from '../../apps/web/src/features/ai/ExecutionDetails.js';
import { ExecutionResult } from '../../apps/web/src/features/ai/ExecutionResult.js';
import { ActivityFeed } from '../../apps/web/src/features/ai/ActivityFeed.js';
import { activityItems, businessPhase } from '../../apps/web/src/features/ai/activity.js';
import { advanceStreamCursor } from '../../apps/web/src/features/ai/stream-text.js';
import { liveAction, recentTrail } from '../../apps/web/src/features/ai/agent-brief.js';
import { InteractionForm } from '../../apps/web/src/features/ai/InteractionForm.js';
import { NewExecution } from '../../apps/web/src/features/operations/agents/NewExecution.js';
import { BusinessAgentPanel } from '../../apps/web/src/features/ai/BusinessAgentPanel.js';
import { PublicationReviewAssistant } from '../../apps/web/src/features/review/PublicationReviewAssistant.js';
import { ReviewAuditEvidence } from '../../apps/web/src/features/review/ReviewAuditEvidence.js';
import { ReviewDetail } from '../../apps/web/src/features/review/ReviewDetail.js';
import { createTestHub, receiveSkill, submitPublication } from '../support/application.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';

afterEach(cleanup);

function withHub(content: ReactElement, ownerId = 'owner') {
  return createElement(
    HubCtx.Provider,
    {
      value: {
        me: {
          id: ownerId,
          username: 'owner',
          auth_provider: 'local',
          display_name: '维护者',
          csrf_token: '',
          groups: [],
          features: { git_hosts: [] },
          capabilities: {
            can_ai: true,
            can_ai_console: false,
            can_admin: false,
            can_audit: false,
            can_publish: true,
            can_review: false,
          },
        },
        reviewCount: 0,
        refresh: 0,
        reload() {},
        openPalette() {},
        logout: async () => {},
      },
    },
    content,
  );
}

function renderBusinessPanel(props: Parameters<typeof BusinessAgentPanel>[0]) {
  return render(withHub(createElement(BusinessAgentPanel, props)));
}

test('失败时间线显示具体原因及错误代码，避免只显示执行失败', () => {
  const error = {
    code: 'AI_OUTPUT_INVALID',
    message: '模型结构化结果的字段或类型不符合约定',
    retryable: false,
  };
  const event = activityEvent(1, 'execution.failed', { error });
  render(
    createElement(ExecutionDetails, {
      view: executionView({ status: 'failed', error }),
      events: [event],
    }),
  );
  const timeline = screen.getByRole('region', { name: '执行过程' });
  assert(within(timeline).getByText(error.message));
  assert(within(timeline).getByText(error.code));
});

test('状态条接收实时活动，快速采纳复用人工意见，失败可幂等重试', async (t) => {
  let view = executionView({
    operation_id: 'resource-audit',
    status: 'running',
    input: { version_id: 'version' },
  });
  let stream: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const response = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
    },
  });
  const attempts: string[] = [];
  let starts = 0;
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (options.method === 'POST' && path === '/api/ai/executions') {
      assert.deepEqual(JSON.parse(String(options.body)), {
        operation_id: 'resource-audit',
        model_profile: 'primary',
        input: { version_id: 'version' },
      });
      starts++;
      view = executionView({
        id: 'next',
        operation_id: 'resource-audit',
        status: 'queued',
        input: { version_id: 'version' },
      });
      return Response.json(view.execution);
    }
    if (options.method === 'POST') {
      assert.equal(path, '/api/ai/executions/execution/interactions/review/respond');
      assert.deepEqual(JSON.parse(String(options.body)), {
        response: { approved: true, comment: '需要补充说明' },
      });
      const headers = new Headers(options.headers);
      assert.equal(headers.get('If-Match'), '"1"');
      attempts.push(headers.get('Idempotency-Key')!);
      if (attempts.length === 1) throw new Error('网络暂不可用');
      view = {
        ...view,
        execution: {
          ...view.execution,
          status: 'succeeded',
          result: { ...businessReport, approved: true },
        },
        interactions: [],
      };
      return Response.json({});
    }
    if (path === '/api/ai/model-options')
      return Response.json({
        default_profile: 'primary',
        profiles: [{ id: 'primary', label: '模型' }],
      });
    if (path.startsWith('/api/ai/executions?'))
      return Response.json({ items: [view.execution], next_cursor: null });
    if (path === '/api/ai/executions/next/events')
      return new Response(new ReadableStream(), {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    if (path.endsWith('/events'))
      return new Response(attempts.length ? '' : response, {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    assert.equal(path, '/api/ai/executions/execution');
    return Response.json(view);
  });
  renderBusinessPanel({ versionId: 'version', title: '测试资源' });
  await act(async () => {
    stream.enqueue(
      encoder.encode(
        `event: stream.snapshot\nid: execution:operator:0\ndata: ${JSON.stringify({ schema_version: 1, ...view })}\n\n`,
      ),
    );
  });
  await screen.findByRole('button', { name: '展开 Agent 实时状态' });
  const event = aiEventResponseSchema.parse({
    schema_version: 1,
    execution_id: 'execution',
    audience: 'operator',
    seq: 1,
    attempt: 1,
    continuation: 0,
    occurred_at: new Date().toISOString(),
    type: 'tool.started',
    data: { tool_id: 'read-file', invocation_id: 'read-1', display: 'SKILL.md · 第 1–20 行' },
  });
  await act(async () => {
    stream.enqueue(
      encoder.encode(
        `event: tool.started\nid: execution:operator:1\ndata: ${JSON.stringify(event)}\n\n`,
      ),
    );
  });
  await waitFor(() =>
    assert.match(
      screen.getByRole('button', { name: '展开 Agent 实时状态' }).textContent ?? '',
      /SKILL.md/,
    ),
  );
  const message = {
    ...event,
    seq: 2,
    type: 'message.started',
    data: { message_id: 'resource-audit:one', block_id: 'notes', format: 'text' },
  };
  const delta = {
    ...event,
    seq: 3,
    type: 'message.delta',
    data: {
      message_id: 'resource-audit:one',
      block_id: 'notes',
      offset: 0,
      delta: '入口文档引用了两个脚本',
    },
  };
  await act(async () => {
    for (const item of [message, delta])
      stream.enqueue(
        encoder.encode(
          `event: ${item.type}\nid: execution:operator:${item.seq}\ndata: ${JSON.stringify(item)}\n\n`,
        ),
      );
  });
  await waitFor(() =>
    assert.match(
      screen.getByRole('button', { name: '展开 Agent 实时状态' }).textContent ?? '',
      /入口文档引用了两个脚本/,
    ),
  );
  view = {
    ...view,
    execution: { ...view.execution, status: 'waiting_input', last_seq: 1 },
    watermark: 1,
    activity: [event],
    interactions: [
      {
        id: 'review',
        status: 'pending',
        revision: 1,
        response: null,
        expires_at: Date.now() + 60000,
        request: { question: '采纳研判？', assessment: businessReport },
        response_schema: {
          type: 'object',
          properties: { approved: { type: 'boolean' }, comment: { type: 'string', default: '' } },
          required: ['approved'],
        },
      },
    ],
  };
  await act(async () => {
    stream.close();
  });
  await waitFor(() =>
    assert.match(
      screen.getByRole('button', { name: '展开 Agent 实时状态' }).textContent ?? '',
      /等待你的确认/,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: '展开 Agent 实时状态' }));
  fireEvent.change(screen.getByRole('textbox', { name: '补充意见' }), {
    target: { value: '需要补充说明' },
  });
  fireEvent.click(screen.getByRole('radio', { name: '采纳研判' }));
  fireEvent.click(screen.getByRole('button', { name: '最小化 Agent 面板' }));
  assert.equal(screen.queryByRole('textbox', { name: '补充意见' }), null);
  fireEvent.click(screen.getByRole('button', { name: '展开 Agent 实时状态' }));
  assert.equal(
    (screen.getByRole('textbox', { name: '补充意见' }) as HTMLTextAreaElement).value,
    '需要补充说明',
  );
  assert((screen.getByRole('radio', { name: '采纳研判' }) as HTMLInputElement).checked);
  fireEvent.keyDown(screen.getByRole('textbox', { name: '补充意见' }), { key: 'Escape' });
  assert.equal(document.activeElement, screen.getByRole('button', { name: '展开 Agent 实时状态' }));
  assert.equal(attempts.length, 0);
  assert.equal(screen.queryByRole('button', { name: '发起新研判' }), null);
  fireEvent.click(screen.getByRole('button', { name: '快速采纳' }));
  await screen.findByRole('alert', { name: '' });
  fireEvent.click(screen.getByRole('button', { name: '快速采纳' }));
  await waitFor(() => assert.equal(screen.queryByRole('button', { name: '快速采纳' }), null));
  assert.equal(attempts.length, 2);
  assert(attempts[0] && attempts[0] === attempts[1]);
  const brief = within(screen.getByRole('region', { name: 'Agent 任务简报' }));
  await brief.findByText(/已采纳/);
  assert(!brief.queryByText(businessReport.assessment.findings[0]!.recommendation));
  fireEvent.click(await brief.findByRole('button', { name: '发起新研判' }));
  await brief.findByText('任务已排队');
  assert.equal(starts, 1);
  assert.equal(brief.queryByRole('button', { name: '发起新研判' }), null);
});

const businessReport = {
  version_id: 'version',
  content_digest: 'sha256:fixed',
  feedback_revision: 1,
  can_apply_feedback: true,
  feedback_id: 'feedback',
  inspected: [{ path: 'SKILL.md', start_line: 1, end_line: 20 }],
  assessment: {
    summary: '需要补充异常输入约定',
    risk: 'medium',
    findings: [
      {
        title: '缺少输入约定',
        severity: 'warning',
        explanation: '已读取入口说明',
        recommendation: '明确错误反馈',
        evidence: [{ path: 'SKILL.md', start_line: 5, end_line: 8 }],
      },
    ],
    limitations: ['未执行脚本'],
    suggested_resolution: '补充说明后再验证',
  },
};

test('业务成果展示发现、行号证据、真实检查范围和人工采纳结果', () => {
  const view = executionView({
    operation_id: 'resource-audit',
    result: { ...businessReport, approved: true, comment: '同意建议', feedback_applied: false },
  });
  render(createElement(ExecutionResult, { view }));
  assert(screen.getByRole('heading', { name: '研判摘要' }));
  assert(screen.getByRole('heading', { name: '缺少输入约定' }));
  assert(screen.getByText('SKILL.md:5–8'));
  assert(screen.getByText('SKILL.md:1–20'));
  assert(screen.getByText('未执行脚本'));
  assert(screen.getByText('人工已采纳'));
});

test('维护者从反馈详情打开同事的自动研判能看负责人和报告且没有确认或取消入口', async (t) => {
  const view = executionView({
    owner_id: 'colleague',
    operation_id: 'feedback-triage',
    status: 'waiting_input',
    input: { version_id: 'version', feedback_id: 'feedback' },
  });
  view.artifacts = [
    {
      id: 'report',
      name: 'assessment',
      media_type: 'application/json',
      digest: 'report',
      content: businessReport,
    },
  ];
  view.interactions = [
    {
      id: 'review',
      status: 'pending',
      revision: 1,
      response: null,
      expires_at: Date.now() + 60000,
      request: { question: '是否采纳反馈研判？' },
      response_schema: {},
    },
  ];
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    assert.equal(options.method ?? 'GET', 'GET');
    if (path === '/api/ai/model-options')
      return Response.json({ default_profile: '', profiles: [] });
    if (path.startsWith('/api/ai/executions?'))
      return Response.json({
        items: [],
        next_cursor: null,
        automatic_triage: { ...view.execution, owner_display_name: '林工' },
      });
    if (path.endsWith('/events'))
      return new Response('', { headers: { 'Content-Type': 'text/event-stream' } });
    assert.equal(path, '/api/ai/executions/execution');
    return Response.json(view);
  });
  renderBusinessPanel({ versionId: 'version', feedbackId: 'feedback', title: '反馈测试' });
  const toggle = await screen.findByRole('button', { name: '展开 Agent 实时状态' });
  await waitFor(() => assert.match(toggle.textContent ?? '', /等待负责人确认/));
  fireEvent.click(toggle);
  assert(await screen.findByText(/负责人 林工/));
  assert.equal(screen.queryByRole('button', { name: '取消任务' }), null);
  assert.equal(screen.queryByRole('button', { name: '前往确认' }), null);
  assert.equal(screen.queryByRole('radio', { name: '采纳研判' }), null);
  fireEvent.click(screen.getByRole('tab', { name: /成果/ }));
  assert(
    await within(screen.getByRole('tabpanel', { name: /成果/ })).findByText(
      businessReport.assessment.summary,
    ),
  );
});

test('已保存的人工确认在选定决定后允许留空补充意见', async (context) => {
  const decision = createHubAgentRegistry().get('agent-lab').interactions.approval;
  const submitted: unknown[] = [];
  context.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    submitted.push(decision.parse(JSON.parse(String(options.body)).response));
    return Response.json({});
  });
  render(
    createElement(InteractionForm, {
      executionId: 'execution',
      interaction: {
        id: 'approval',
        status: 'pending',
        revision: 1,
        request: {},
        response: null,
        response_schema: {
          type: 'object',
          required: ['approved', 'comment'],
          properties: { approved: { type: 'boolean' }, comment: { type: 'string', default: '' } },
        },
        expires_at: Date.now() + 60000,
      },
      onDone: () => {},
    }),
  );
  const user = userEvent.setup();
  assert.equal(screen.getByRole<HTMLTextAreaElement>('textbox', { name: '补充意见' }).value, '');
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '确认并继续' });
  assert(submit.disabled);
  await user.click(screen.getByRole('radio', { name: '暂不采纳' }));
  await user.click(submit);
  assert.deepEqual(submitted, [{ approved: false, comment: '' }]);
});

function renderTaskForm(context: TestContext, inputSchema: AiExecutionResponse['input']) {
  const inputs: AiExecutionResponse['input'][] = [];
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    assert.equal(path, '/api/ai/executions');
    const { input } = JSON.parse(String(options.body)) as Pick<AiExecutionResponse, 'input'>;
    inputs.push(input);
    return Response.json(
      executionView({ operation_id: 'reference-task', status: 'queued', input }).execution,
    );
  });
  render(
    createElement(NewExecution, {
      catalog: {
        default_profile: 'primary',
        profiles: [{ id: 'primary', label: '模型', format: 'openai', model: 'test' }],
        operations: [
          {
            id: 'reference-task',
            version: '1',
            title: '参考资料任务',
            description: '',
            digest: 'test',
            input_schema: inputSchema,
            output_schema: {},
            interactions: {},
          },
        ],
      },
      onCreated: () => {},
    }),
  );
  return inputs;
}

test('必填参考项在可选折叠区外，填写后才能开始任务', async (context) => {
  const inputs = renderTaskForm(context, {
    type: 'object',
    required: ['prompt', 'resource_ref'],
    properties: {
      prompt: { type: 'string', minLength: 1 },
      resource_ref: { type: 'string', minLength: 1 },
      skill_ref: { type: 'string' },
    },
  });
  const user = userEvent.setup();
  const references = screen.getByText('参考资源与工具').closest('details')!;
  const required = screen.getByRole('textbox', { name: /^参考资源.*必填/ });
  assert(!references.contains(required), '必填项必须在展开可选区之前就能填写');
  const submit = screen.getByRole('button', { name: '开始任务' });
  await user.type(screen.getByRole('textbox', { name: '你的问题' }), '请检查资源');
  await user.click(submit);
  assert.deepEqual(inputs, []);
  await user.type(required, 'resource');
  await user.click(submit);
  assert.deepEqual(inputs, [{ prompt: '请检查资源', resource_ref: 'resource' }]);
});

test('可选任务参数提交时保留填写的值，清空后从请求中省略', async (context) => {
  const inputs = renderTaskForm(context, {
    type: 'object',
    required: ['prompt'],
    properties: {
      prompt: { type: 'string', minLength: 1 },
      skill_ref: { type: 'string', minLength: 2 },
      count: { type: 'integer', minimum: 1 },
      mode: { type: 'string', enum: ['fast', 'slow'] },
      options: { type: 'object' },
    },
  });
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: '你的问题' }), '请检查资源');
  await user.click(screen.getByText('参考资源与工具'));
  const skill = screen.getByRole('textbox', { name: /参考 Skill/ });
  const count = screen.getByRole('spinbutton', { name: 'count' });
  const mode = screen.getByRole('combobox', { name: 'mode' });
  const options = screen.getByRole('textbox', { name: 'options' });
  const submit = screen.getByRole('button', { name: '开始任务' });
  await user.type(skill, 'skill');
  await user.type(count, '2');
  await user.selectOptions(mode, 'slow');
  fireEvent.change(options, { target: { value: '{"limit":1}' } });
  await user.click(submit);
  assert.deepEqual(inputs, [
    {
      prompt: '请检查资源',
      skill_ref: 'skill',
      count: 2,
      mode: 'slow',
      options: { limit: 1 },
    },
  ]);

  await user.clear(skill);
  await user.clear(count);
  await user.selectOptions(mode, '');
  await user.clear(options);
  await user.click(submit);
  assert.deepEqual(inputs.at(-1), { prompt: '请检查资源' });
});

test('反馈写回必须明确采纳；改为不采纳会清除写回选择', () => {
  render(
    createElement(InteractionForm, {
      executionId: 'execution',
      onDone: () => {},
      interaction: {
        id: 'review',
        status: 'pending',
        revision: 1,
        response: null,
        expires_at: Date.now() + 60000,
        request: { question: '采纳反馈研判？', assessment: businessReport },
        response_schema: {
          type: 'object',
          properties: {
            approved: { type: 'boolean' },
            apply_feedback: { type: 'boolean', default: false },
            comment: { type: 'string', default: '' },
          },
          required: ['approved'],
        },
      },
    }),
  );
  assert.equal(screen.queryByRole('checkbox'), null);
  fireEvent.click(screen.getByRole('radio', { name: '采纳研判' }));
  const write = screen.getByRole('checkbox', { name: /将反馈标记为处理中/ });
  fireEvent.click(write);
  assert((write as HTMLInputElement).checked);
  fireEvent.click(screen.getByRole('radio', { name: '暂不采纳' }));
  assert.equal(screen.queryByRole('checkbox'), null);
  fireEvent.click(screen.getByRole('radio', { name: '采纳研判' }));
  assert.equal((screen.getByRole('checkbox') as HTMLInputElement).checked, false);
});

test('审计或无维护权限的研判不显示业务写回选项', () => {
  render(
    createElement(InteractionForm, {
      executionId: 'execution',
      onDone: () => {},
      interaction: {
        id: 'review',
        status: 'pending',
        revision: 1,
        response: null,
        expires_at: Date.now() + 60000,
        request: {
          question: '确认审计？',
          assessment: { ...businessReport, can_apply_feedback: false },
        },
        response_schema: {
          type: 'object',
          properties: {
            approved: { type: 'boolean' },
            apply_feedback: { type: 'boolean', default: false },
          },
          required: ['approved'],
        },
      },
    }),
  );
  fireEvent.click(screen.getByRole('radio', { name: '采纳研判' }));
  assert.equal(screen.queryByRole('checkbox'), null);
});
function executionView(overrides: Partial<AiExecutionResponse> = {}) {
  const now = new Date().toISOString();
  return aiExecutionViewResponseSchema.parse({
    execution: {
      id: 'execution',
      owner_id: 'owner',
      operation_id: 'agent-lab',
      model_profile: 'primary',
      status: 'succeeded',
      revision: 1,
      attempt: 1,
      continuation: 0,
      input: { topic: '改进团队协作' },
      result: null,
      created_at: now,
      updated_at: now,
      deadline: Date.now() + 10000,
      last_seq: 0,
      message_text: '',
      message_blocks: [],
      usage: { requests: 3, tools: 1, input_tokens: 200, output_tokens: 100, unknown_requests: 0 },
      error: null,
      ...overrides,
    },
    interactions: [],
    artifacts: [],
    activity: [],
    activity_truncated: false,
    watermark: 0,
  });
}

test('协作成果合并相同草案记录，展示采纳结论并明确演示检查含义', () => {
  const proposal = {
    draft: '## 协作草案\n先明确团队边界。',
    review: '## 审查清单\n验证资源访问范围。',
    approved: false,
    comment: '请先补齐证据',
  };
  const view = executionView({ result: { ...proposal, artifact_id: 'proposal-id' } });
  view.artifacts = [
    {
      id: 'proposal-id',
      name: 'proposal',
      media_type: 'application/json',
      content: proposal,
      digest: 'digest',
    },
    {
      id: 'evaluation-id',
      name: 'evaluation:proposal',
      media_type: 'application/json',
      content: { has_review: 1 },
      digest: 'evaluation',
    },
  ];
  render(createElement(ExecutionResult, { view }));
  assert.equal(screen.getAllByRole('heading', { name: '协作草案' }).length, 1);
  assert.equal(screen.getAllByRole('heading', { name: '审查清单' }).length, 1);
  assert.ok(screen.getByText('未采纳草案'));
  assert.ok(screen.getByText('请先补齐证据'));
  assert.ok(screen.getByText(/不代表事实准确性或方案质量/));
  assert.equal(screen.queryByText('proposal'), null);
  assert.equal(screen.queryByText('evaluation:proposal'), null);
});

test('成果视图保留与最终结果不同的草案和未知成果', () => {
  const proposal = { draft: '最终草案', review: '审查意见', approved: true, comment: '' };
  const view = executionView({ result: proposal });
  view.artifacts = [
    {
      id: 'earlier',
      name: 'proposal',
      media_type: 'application/json',
      content: { ...proposal, draft: '先前草案' },
      digest: 'old',
    },
    {
      id: 'custom',
      name: '附加建议',
      media_type: 'text/markdown',
      content: '## 后续行动\n完成资源核验。',
      digest: 'custom',
    },
  ];
  render(createElement(ExecutionResult, { view }));
  const summary = screen.getByText('保存的草案记录');
  const details = summary.closest('details');
  assert.ok(details);
  fireEvent.click(summary);
  assert.match(details.textContent ?? '', /先前草案/);
  assert.ok(screen.getByText('附加建议'));
});

test('人工确认需要明确选择，切换视图保留决定与意见，标签支持键盘操作', () => {
  const view = executionView({ status: 'waiting_input' });
  view.interactions = [
    {
      id: 'approval',
      status: 'pending',
      revision: 1,
      request: { question: '是否采用这份草案？', draft: '任务草案', review: '审查建议内容' },
      response_schema: {
        type: 'object',
        required: ['approved'],
        properties: { approved: { type: 'boolean' }, comment: { type: 'string', default: '' } },
      },
      response: null,
      expires_at: Date.now() + 10000,
    },
  ];
  render(
    createElement(ExecutionPanel, {
      canManage: true,
      view,
      connection: '等待你的回答',
      onRefresh: () => undefined,
    }),
  );
  const submit = screen.getByRole('button', { name: '确认并继续' }) as HTMLButtonElement;
  assert.equal(submit.disabled, true);
  fireEvent.click(screen.getByRole('radio', { name: '暂不采纳' }));
  fireEvent.change(screen.getByLabelText('补充意见'), { target: { value: '先核实来源' } });
  assert.equal(submit.disabled, false);
  assert.equal(screen.queryByRole('tab', { name: '待你确认' }), null);
  assert.ok(
    within(screen.getByRole('tabpanel', { name: '协作过程' })).getByRole('form', {
      name: '人工确认',
    }),
  );
  fireEvent.click(screen.getByRole('tab', { name: '运行详情' }));
  assert.equal(screen.queryByRole('form', { name: '人工确认' }), null);
  assert.ok(screen.getByRole('button', { name: '前往确认' }));
  fireEvent.click(screen.getByRole('button', { name: '前往确认' }));
  assert.equal((screen.getByRole('radio', { name: '暂不采纳' }) as HTMLInputElement).checked, true);
  assert.equal((screen.getByLabelText('补充意见') as HTMLTextAreaElement).value, '先核实来源');
  fireEvent.keyDown(screen.getByRole('tab', { name: '协作过程' }), { key: 'End' });
  assert.equal(screen.getByRole('tab', { name: '运行详情' }).getAttribute('aria-selected'), 'true');
  assert.ok(
    within(screen.getByRole('tabpanel', { name: '运行详情' })).getByRole('heading', {
      name: '运行概览',
    }),
  );
});

test('查看他人的执行只展示等待状态，不提供取消或代答入口', () => {
  const view = executionView({ status: 'waiting_input' });
  view.interactions = [
    {
      id: 'approval',
      status: 'pending',
      revision: 1,
      request: { question: '是否采用草案？' },
      response_schema: { type: 'object', properties: { approved: { type: 'boolean' } } },
      response: null,
      expires_at: Date.now() + 10000,
    },
  ];
  render(
    createElement(ExecutionPanel, {
      view,
      canManage: false,
      connection: '已连接',
      onRefresh: () => undefined,
    }),
  );
  assert.equal(screen.queryByRole('button', { name: '取消任务' }), null);
  assert.equal(screen.queryByRole('button', { name: '前往确认' }), null);
  assert.equal(screen.queryByRole('form', { name: '人工确认' }), null);
  assert.ok(screen.getByText('任务已暂停，等待发起人确认。'));
  assert.ok(screen.getByRole('region', { name: '人工决策记录' }));
});

function activityEvent(seq: number, type: string, data: unknown) {
  return aiEventResponseSchema.parse({
    schema_version: 1,
    execution_id: 'execution',
    audience: 'operator',
    seq,
    type,
    attempt: 1,
    continuation: 0,
    occurred_at: new Date(1730000000000 + seq * 100).toISOString(),
    data,
  });
}

test('工具按调用编号归并，穿插于 Agent 输出之间，失败和中断不伪装成功', () => {
  const view = executionView({
    status: 'running',
    message_blocks: [
      { id: 'one', message_id: 'planner:one', text: '先核验文本', complete: true },
      { id: 'two', message_id: 'editor:two', text: '根据工具结果给出建议', complete: false },
    ],
  });
  view.activity = [
    activityEvent(1, 'message.started', {
      block_id: 'one',
      message_id: 'planner:one',
      format: 'text',
    }),
    activityEvent(2, 'tool.started', { tool_id: 'inspect-text', invocation_id: 'tool-one' }),
    activityEvent(3, 'tool.completed', { tool_id: 'inspect-text', invocation_id: 'tool-one' }),
    activityEvent(4, 'message.started', {
      block_id: 'two',
      message_id: 'editor:two',
      format: 'text',
    }),
    activityEvent(5, 'tool.started', { tool_id: 'inspect-text', invocation_id: 'tool-two' }),
    activityEvent(6, 'tool.failed', {
      tool_id: 'inspect-text',
      invocation_id: 'tool-two',
      code: 'AI_TOOL_FAILED',
    }),
    activityEvent(7, 'tool.started', { tool_id: 'inspect-text', invocation_id: 'tool-three' }),
  ];
  assert.deepEqual(
    activityItems(view).map((item) => [item.kind, item.id]),
    [
      ['message', 'one'],
      ['tool', 'tool-one'],
      ['message', 'two'],
      ['tool', 'tool-two'],
      ['tool', 'tool-three'],
    ],
  );
  render(
    createElement(ActivityFeed, {
      canManage: true,
      view,
      active: true,
      focusRequest: 0,
      onRefresh: () => undefined,
    }),
  );
  assert.equal(screen.getAllByText('文本统计').length, 3);
  assert.ok(screen.getByText('调用失败'));
  assert.ok(screen.getByText('调用中'));
  view.execution.status = 'cancelled';
  const stopped = activityItems(view).find((item) => item.id === 'tool-three');
  assert.equal(stopped?.kind === 'tool' && stopped.state, 'interrupted');
});

test('研判阶段由步骤与人工交互推断，只进不退，中断时停在原阶段', () => {
  const step = (seq: number, type: string, stepId: string) =>
    activityEvent(seq, type, {
      step_id: stepId,
      ...(type === 'step.completed' ? { duration_ms: 1 } : {}),
    });
  const interaction = (status: 'pending' | 'answered') => ({
    id: 'review',
    status,
    revision: 1,
    request: {},
    response_schema: {},
    response: null,
    expires_at: Date.now(),
  });
  const cases: [string, Partial<AiExecutionResponse>, unknown[], unknown[], number, boolean][] = [
    ['排队', { status: 'queued' }, [], [], -1, false],
    ['开始运行', { status: 'running' }, [], [], 0, false],
    [
      '整理报告后调查步骤收尾',
      { status: 'running' },
      [
        step(1, 'step.started', 'investigate'),
        step(2, 'step.started', 'assessment'),
        step(3, 'step.completed', 'assessment'),
        step(4, 'step.completed', 'investigate'),
      ],
      [],
      1,
      false,
    ],
    ['等待人工', { status: 'waiting_input' }, [], [interaction('pending')], 2, false],
    ['人工已答复', { status: 'running' }, [], [interaction('answered')], 3, false],
    [
      '记录失败',
      { status: 'failed' },
      [step(1, 'step.started', 'record-assessment')],
      [interaction('answered')],
      3,
      true,
    ],
    ['完成', { status: 'succeeded' }, [], [], 4, false],
  ];
  for (const [name, execution, activity, interactions, index, halted] of cases) {
    const view = executionView({ operation_id: 'resource-audit', ...execution });
    view.activity = activity as typeof view.activity;
    view.interactions = interactions as typeof view.interactions;
    assert.deepEqual(businessPhase(view), { index, halted }, name);
  }
});

test('发布建议和格式修复进行时优先展示报告动作', () => {
  const view = executionView({ operation_id: 'resource-audit', status: 'running' });
  for (const [step, label] of [
    ['publication-suggestion', '整理发布建议'],
    ['repair-output', '重新整理报告格式'],
  ]) {
    view.activity = [
      activityEvent(1, 'tool.completed', { tool_id: 'read-file', invocation_id: 'read' }),
      activityEvent(2, 'step.started', { step_id: step }),
    ];
    assert.equal(businessPhase(view).index, 1);
    assert.equal(liveAction(view).label, label);
  }
});

test('最近动作取每段输出的最新一句，跳过无文字输出，中断与人工决定如实呈现', () => {
  const view = executionView({
    operation_id: 'resource-audit',
    status: 'cancelled',
    message_blocks: [
      { id: 'empty', message_id: 'resource-audit:a', text: '', complete: false },
      {
        id: 'note',
        message_id: 'resource-audit:b',
        text: '入口已读完。\n- **下一步**核对脚本',
        complete: false,
      },
      { id: 'report', message_id: 'assessment:c', text: '{}', complete: true },
    ],
  });
  view.activity = [
    activityEvent(1, 'tool.started', {
      tool_id: 'read-file',
      invocation_id: 'read',
      display: 'SKILL.md',
    }),
    activityEvent(2, 'tool.completed', { tool_id: 'read-file', invocation_id: 'read' }),
    activityEvent(3, 'message.started', {
      block_id: 'empty',
      message_id: 'resource-audit:a',
      format: 'text',
    }),
    activityEvent(4, 'message.started', {
      block_id: 'note',
      message_id: 'resource-audit:b',
      format: 'text',
    }),
    activityEvent(5, 'message.started', {
      block_id: 'report',
      message_id: 'assessment:c',
      format: 'text',
    }),
    activityEvent(6, 'interaction.requested', {
      interaction_id: 'review',
      request: {},
      response_schema: {},
      revision: 1,
    }),
  ];
  view.interactions = [
    {
      id: 'review',
      status: 'applied',
      revision: 2,
      request: {},
      response_schema: {},
      response: { approved: false },
      expires_at: Date.now(),
    },
  ];
  assert.deepEqual(
    recentTrail(view).map(({ id, label, detail, state, thought, duration }) => ({
      id,
      label,
      detail,
      state,
      thought,
      duration,
    })),
    [
      {
        id: 'read',
        label: '读取文件片段',
        detail: 'SKILL.md',
        state: 'completed',
        thought: undefined,
        duration: 100,
      },
      {
        id: 'note',
        label: '下一步核对脚本',
        detail: undefined,
        state: 'interrupted',
        thought: true,
        duration: undefined,
      },
      {
        id: 'report',
        label: '整理研判报告',
        detail: undefined,
        state: 'completed',
        thought: undefined,
        duration: undefined,
      },
      {
        id: 'review',
        label: '人工确认',
        detail: '未采纳',
        state: 'completed',
        thought: undefined,
        duration: undefined,
      },
    ],
  );
  assert.deepEqual(
    recentTrail(view, 2).map((item) => item.id),
    ['report', 'review'],
  );
});

test('人工回答后在协作过程留下决策记录，不再提供确认表单', () => {
  const view = executionView();
  view.interactions = [
    {
      id: 'approval',
      status: 'applied',
      revision: 2,
      request: { question: '是否采用这份草案？' },
      response_schema: {},
      response: { approved: false, comment: '依据尚不充分' },
      expires_at: Date.now(),
    },
  ];
  render(
    createElement(ActivityFeed, {
      canManage: true,
      view,
      active: true,
      focusRequest: 0,
      onRefresh: () => undefined,
    }),
  );
  const decision = screen.getByRole('region', { name: '人工决策记录' });
  assert.ok(within(decision).getByText('暂不采纳'));
  assert.ok(within(decision).getByText('依据尚不充分'));
  assert.equal(screen.queryByRole('form', { name: '人工确认' }), null);
});

test('流式游标按字素边界推进，不拆开 emoji 和组合字符', () => {
  const text = '测试👨‍👩‍👧‍👦e\u0301🇨🇳结束';
  const boundaries = new Set(
    [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(text)].map(
      (part) => part.index + part.segment.length,
    ),
  );
  let cursor = 0;
  while (cursor < text.length) {
    const next = advanceStreamCursor(text, cursor, 24);
    assert(next > cursor && boundaries.has(next));
    cursor = next;
  }
  assert.equal(cursor, text.length);
});

test('审核底栏只给出一项可定位的核对建议，基线变化和历史记录不沿用当前建议', async (t) => {
  const input = { publication_request_id: 'review-A' };
  const report = {
    ...businessReport,
    assessment: {
      ...businessReport.assessment,
      findings: [
        { ...businessReport.assessment.findings[0], recommendation: '这是次要建议' },
        {
          ...businessReport.assessment.findings[0],
          severity: 'critical',
          recommendation: '1. 明确错误反馈；2. 再检查后续配置。',
        },
      ],
    },
    snapshot: {
      ...input,
      request_revision: 1,
      policy_digest: 'policy-A',
      changed_files: 0,
      before: { visibility_label: '研发组', category: 'uncategorized' },
      proposed: {
        visibility_label: '登录用户',
        category: 'uncategorized',
        purpose: '共享值班手册',
      },
      added_audience_label: '登录用户',
      removed_audience_label: '研发组',
    },
    warnings: [],
  };
  const view = executionView({ operation_id: 'publication-review', input, result: report });
  let started = false;
  t.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    if (path === '/api/ai/model-options')
      return Response.json({
        default_profile: 'primary',
        profiles: [{ id: 'primary', label: '演示' }],
      });
    if (path.startsWith('/api/ai/executions?')) {
      assert.equal(
        new URL(path, 'http://localhost').searchParams.get('publication_request_id'),
        'review-A',
      );
      return Response.json({ items: started ? [view.execution] : [], next_cursor: null });
    }
    if (path === '/api/ai/executions') {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        operation_id: 'publication-review',
        input,
      });
      started = true;
      return Response.json(view.execution);
    }
    if (path.endsWith('/events'))
      return new Response(
        'event: stream.snapshot\ndata: ' + JSON.stringify({ schema_version: 1, ...view }) + '\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    assert.equal(path, '/api/ai/executions/execution');
    return Response.json(view);
  });
  const openEvidence = t.mock.fn();
  const panel = (canDecide: boolean, revision = 1) =>
    withHub(
      createElement(PublicationReviewAssistant, {
        request: {
          id: 'review-A',
          revision,
          can_decide: canDecide,
          policy_digest: 'policy-A',
        },
        onEvidence: openEvidence,
      }),
    );
  const page = render(panel(true));
  const start = screen.getByRole<HTMLButtonElement>('button', { name: '生成审核简报' });
  await waitFor(() => assert(!start.disabled));
  assert.equal(started, false);
  fireEvent.click(start);
  assert(await screen.findByText('需要关注'));
  assert(screen.getByText('明确错误反馈'));
  assert.equal(screen.queryByText('这是次要建议'), null);
  assert.equal(screen.queryByText(businessReport.assessment.summary), null);
  assert.equal(screen.queryByRole('button', { name: '查看审核简报' }), null);
  assert.equal(screen.queryByRole('dialog'), null);
  fireEvent.click(screen.getByRole('button', { name: '核对依据' }));
  assert.deepEqual(openEvidence.mock.calls[0].arguments, ['SKILL.md', 5, 8]);
  page.rerender(panel(true, 2));
  assert(screen.getByText('基线已变'));
  assert.equal(screen.queryByText('明确错误反馈'), null);
  assert.equal(screen.queryByRole('button', { name: '核对依据' }), null);
  page.rerender(panel(false, 2));
  assert(screen.getByText('历史研判'));
  assert.equal(screen.queryByRole('button', { name: '生成审核简报' }), null);
  assert.equal(screen.queryByRole('button', { name: '重新研判' }), null);
});

test('审核底栏跟随取证和整理阶段，可直接取消并重新研判', async (t) => {
  const request = { id: 'review-A', revision: 1, policy_digest: 'policy-A', can_decide: true };
  const input = { publication_request_id: request.id };
  let view = executionView({ operation_id: 'publication-review', input, status: 'queued' });
  let stream: ReadableStreamDefaultController<Uint8Array>;
  const events = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
    },
  });
  const citation = t.mock.fn();
  t.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    if (path === '/api/ai/model-options')
      return Response.json({
        default_profile: 'primary',
        profiles: [{ id: 'primary', label: '演示' }],
      });
    if (path.startsWith('/api/ai/executions?'))
      return Response.json(
        new URL(path, 'http://localhost').searchParams.has('cursor')
          ? { items: [view.execution], next_cursor: null }
          : { items: [], next_cursor: 'next-page' },
      );
    if (path.endsWith('/events'))
      return new Response(events, { headers: { 'Content-Type': 'text/event-stream' } });
    if (path === '/api/ai/executions/execution') return Response.json(view);
    if (path.endsWith('/cancel')) {
      assert.equal(new Headers(init?.headers).get('If-Match'), '"4"');
      view = executionView({ ...view.execution, status: 'cancelled', revision: 5 });
      return Response.json(view.execution);
    }
    assert.equal(path, '/api/ai/executions');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), { operation_id: 'publication-review', input });
    view = executionView({
      id: 'retry',
      input,
      operation_id: 'publication-review',
      result: {
        snapshot: { ...input, request_revision: 1, policy_digest: 'policy-A' },
        warnings: [{ finding_id: 'scan-1', file: 'entry.js', line: 12 }],
        assessment: {
          ...businessReport.assessment,
          warning_questions: [{ finding_id: 'scan-1', question: '这个外部调用是否获得授权？' }],
        },
      },
    });
    return Response.json(view.execution);
  });
  const rendered = render(
    withHub(createElement(PublicationReviewAssistant, { request, onEvidence: citation })),
  );
  t.after(() => {
    rendered.unmount();
    stream.close();
  });
  await screen.findByText('已排队');
  assert.equal(screen.queryByRole('list', { name: '审核研判阶段' }), null);
  view = executionView({ ...view.execution, status: 'running', revision: 4 });
  const encoder = new TextEncoder();
  await act(async () => {
    stream.enqueue(
      encoder.encode(
        'event: stream.snapshot\ndata: ' + JSON.stringify({ schema_version: 1, ...view }) + '\n\n',
      ),
    );
  });
  await screen.findByText('查阅依据');
  const phases = within(screen.getByRole('list', { name: '审核研判阶段' }));
  assert.equal(phases.getByRole('listitem', { current: 'step' }).textContent, '核对证据');
  const activity = aiEventResponseSchema.parse({
    schema_version: 1,
    execution_id: view.execution.id,
    audience: 'operator',
    seq: 1,
    attempt: 1,
    continuation: 0,
    occurred_at: new Date().toISOString(),
    type: 'tool.started',
    data: { tool_id: 'review-warnings', invocation_id: 'warnings-1' },
  });
  await act(async () => {
    stream.enqueue(
      encoder.encode('event: tool.started\ndata: ' + JSON.stringify(activity) + '\n\n'),
    );
  });
  await screen.findByText('正在核对申请告警。');
  const step = { ...activity, seq: 2, type: 'step.started', data: { step_id: 'assessment' } };
  await act(async () => {
    stream.enqueue(encoder.encode('event: step.started\ndata: ' + JSON.stringify(step) + '\n\n'));
  });
  await screen.findByText('整理结论');
  assert.equal(phases.getByRole('listitem', { current: 'step' }).textContent, '整理简报');
  assert.equal(screen.queryByRole('button', { name: '生成审核简报' }), null);
  assert.equal(screen.queryByRole('dialog'), null);
  fireEvent.click(screen.getByRole('button', { name: '取消研判' }));
  await screen.findByText('已取消');
  assert.equal(screen.queryByRole('list', { name: '审核研判阶段' }), null);
  fireEvent.click(screen.getByRole('button', { name: '重试研判' }));
  await screen.findByText('这个外部调用是否获得授权？');
  fireEvent.click(screen.getByRole('button', { name: '核对依据' }));
  assert.deepEqual(citation.mock.calls[0].arguments, ['entry.js', 12, 12]);
});

test('版本审计跟随执行事件显示读取行段，整理或中断后清除旧动作', async (t) => {
  const target = { version_id: 'version', content_digest: 'sha256:fixed' };
  const view = executionView({
    operation_id: 'resource-audit',
    status: 'queued',
    input: { version_id: target.version_id },
  });
  let stream: ReadableStreamDefaultController<Uint8Array>;
  const events = new ReadableStream<Uint8Array>({
    start(controller) {
      stream = controller;
    },
  });
  const emit = async (type: string, data: unknown) => {
    await act(async () => {
      stream.enqueue(
        new TextEncoder().encode('event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n'),
      );
    });
  };
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/ai/model-options')
      return Response.json({
        default_profile: 'primary',
        profiles: [{ id: 'primary', label: '模型' }],
      });
    if (path.startsWith('/api/ai/executions?'))
      return Response.json({ items: [view.execution], next_cursor: null });
    assert.equal(path, '/api/ai/executions/execution/events');
    return new Response(events, { headers: { 'Content-Type': 'text/event-stream' } });
  });
  const page = render(
    withHub(
      createElement(ReviewAuditEvidence, {
        request: target,
        onAdvice: () => undefined,
        onEvidence: () => undefined,
      }),
    ),
  );
  t.after(() => {
    page.unmount();
    stream.close();
  });
  const card = within(screen.getByRole('region', { name: '版本资源审计' }));
  await card.findByText('已排队');
  await emit('stream.snapshot', { schema_version: 1, ...view });
  const track = within(await card.findByRole('list', { name: '研判进度' }));
  assert.equal(track.queryByRole('listitem', { current: 'step' }), null);
  await emit('execution.started', activityEvent(1, 'execution.started', {}));
  const display = 'SKILL.md · 第 8–27 行';
  await emit(
    'tool.started',
    activityEvent(2, 'tool.started', {
      tool_id: 'read-file',
      invocation_id: 'read-1',
      display,
    }),
  );
  assert(await card.findByText(display));
  assert.match(track.getByRole('listitem', { current: 'step' }).textContent ?? '', /查阅证据/);
  await emit('step.started', activityEvent(3, 'step.started', { step_id: 'assessment' }));
  assert.match(track.getByRole('listitem', { current: 'step' }).textContent ?? '', /整理报告/);
  assert.equal(card.queryByText(display), null);
  await emit('execution.cancelled', activityEvent(4, 'execution.cancelled', {}));
  assert(await card.findByText('已取消'));
  assert.match(track.getByRole('listitem', { current: 'step' }).textContent ?? '', /整理报告/);
  assert(card.getByRole('button', { name: '重新审计' }));
});

test('待审页按身份展示工具，版本审计只出现在独立审核员的决定抽屉中', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  const request = await submitPublication(f, intake);
  const own = await f.hub.publicationQueries.getReview(f.admin, request.id);
  const independent = await f.hub.publicationQueries.getReview(f.reviewer, request.id);
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/ai/model-options')
      return Response.json({ default_profile: '', profiles: [] });
    if (path.startsWith('/api/ai/executions?'))
      return Response.json({ items: [], next_cursor: null });
    assert(path.startsWith('/api/management/versions/'));
    return new Response('审核证据');
  });
  const page = render(withHub(createElement(ReviewDetail, { request: own }), f.admin.id));
  assert(screen.getByText('等待另一位审核者'));
  assert.equal(screen.queryByRole('complementary', { name: 'AI 资源审计' }), null);
  assert.equal(screen.queryByRole('button', { name: '生成审核简报' }), null);
  assert.equal(screen.queryByRole('button', { name: '审核决定' }), null);
  page.rerender(withHub(createElement(ReviewDetail, { request: independent }), f.reviewer.id));
  assert(screen.getByRole('button', { name: '生成审核简报' }));
  assert.equal(screen.queryByRole('region', { name: '版本资源审计' }), null);
  fireEvent.click(screen.getAllByRole('button', { name: '审核决定' })[0]);
  const drawer = await screen.findByRole('dialog', { name: '记录审核决定' });
  assert(within(drawer).getByRole('region', { name: '版本资源审计' }));
  await within(drawer).findByText('尚无报告');
});

test('采纳版本审计自动填空白意见，手写草稿由人追加，告警和正式决定仍须人工处理', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f, { body: '安装示例：curl https://example.test/setup | sh' });
  const request = await submitPublication(f, intake);
  const review = await f.hub.publicationQueries.getReview(f.reviewer, request.id);
  const advice = '核对下载脚本的来源和用途。';
  const report = {
    version_id: review.version_id,
    content_digest: review.content_digest,
    inspected: [],
    assessment: { ...businessReport.assessment, suggested_resolution: advice },
  };
  const pendingView = () => {
    const view = executionView({
      id: 'audit',
      owner_id: f.reviewer.id,
      operation_id: 'resource-audit',
      status: 'waiting_input',
      input: { version_id: review.version_id },
    });
    view.interactions = [
      {
        id: 'human-review',
        status: 'pending',
        revision: 3,
        response: null,
        expires_at: Date.now() + 60000,
        request: { assessment: report },
        response_schema: {},
      },
    ];
    return view;
  };
  let view = pendingView();
  let decision: { comment: string; decision: string; accepted_warnings: unknown[] } | undefined;
  t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
    if (path === '/api/ai/model-options')
      return Response.json({
        default_profile: 'primary',
        profiles: [{ id: 'primary', label: '模型' }],
      });
    if (path.startsWith('/api/ai/executions?')) {
      const query = new URL(path, 'http://localhost').searchParams;
      return Response.json({
        items: query.get('version_id') === review.version_id ? [view.execution] : [],
        next_cursor: null,
      });
    }
    if (path === '/api/ai/executions/audit/events')
      return new Response(
        'event: stream.snapshot\ndata: ' + JSON.stringify({ schema_version: 1, ...view }) + '\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    if (path === '/api/ai/executions/audit') return Response.json(view);
    if (path.endsWith('/interactions/human-review/respond')) {
      assert.equal(init.method, 'POST');
      assert.equal(new Headers(init.headers).get('If-Match'), '"3"');
      assert.deepEqual(JSON.parse(String(init.body)).response, {
        approved: true,
        comment: '',
        apply_feedback: false,
      });
      view = executionView({
        ...view.execution,
        status: 'succeeded',
        result: { ...report, approved: true },
      });
      return Response.json(view.execution);
    }
    if (path === '/api/publication-requests/' + review.id + '/decision') {
      decision = JSON.parse(String(init.body)) as typeof decision;
      return Response.json({});
    }
    assert(path.startsWith('/api/management/versions/'));
    return new Response('审核证据');
  });
  for (const manual of ['', '已核对受众。']) {
    view = pendingView();
    decision = undefined;
    const page = render(withHub(createElement(ReviewDetail, { request: review }), f.reviewer.id));
    const openDecision = screen.getByRole('button', {
      name: '审核决定',
      description: '告警待说明',
    });
    assert.equal(openDecision.textContent?.trim(), '审核决定');
    fireEvent.click(openDecision);
    const drawer = within(await screen.findByRole('dialog', { name: '记录审核决定' }));
    const comment = drawer.getByRole<HTMLTextAreaElement>('textbox', { name: '审核意见' });
    const accept = await drawer.findByRole('button', { name: '采纳审计建议' });
    assert.equal(comment.value, '');
    if (manual) fireEvent.change(comment, { target: { value: manual } });
    fireEvent.click(accept);
    if (manual) {
      const append = await drawer.findByRole<HTMLButtonElement>('button', { name: '追加审计建议' });
      assert.equal(comment.value, manual);
      fireEvent.change(comment, { target: { value: '字'.repeat(3999) } });
      assert(append.disabled);
      fireEvent.change(comment, { target: { value: manual } });
      fireEvent.click(append);
    }
    const expected = manual ? manual + '\n\n' + advice : advice;
    await waitFor(() => assert.equal(comment.value, expected));
    assert.equal(drawer.getByRole<HTMLInputElement>('checkbox').checked, false);
    assert.equal(
      drawer.getAllByRole<HTMLTextAreaElement>('textbox', { name: /接受告警/ })[0].value,
      '',
    );
    assert(drawer.getByRole<HTMLButtonElement>('button', { name: '通过并发布' }).disabled);
    assert.equal(decision, undefined);
    if (manual) {
      fireEvent.click(drawer.getByRole('button', { name: '退回修改' }));
      await waitFor(() =>
        assert.deepEqual(
          decision && [decision.decision, decision.comment, decision.accepted_warnings],
          ['reject', expected, []],
        ),
      );
    } else {
      fireEvent.change(comment, { target: { value: '' } });
      fireEvent.click(drawer.getByRole('button', { name: '关闭审核决定' }));
      await waitFor(() => assert(!screen.queryByRole('dialog')));
      fireEvent.click(screen.getAllByRole('button', { name: '审核决定' })[0]);
      assert(await screen.findByRole('button', { name: '引用审计建议' }));
      assert.equal(
        screen.getByRole<HTMLTextAreaElement>('textbox', { name: '审核意见' }).value,
        '',
      );
    }
    page.unmount();
  }
});

test('他人的审计、未采纳的结果和其他内容快照都不能填入审核意见', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  const request = await submitPublication(f, intake);
  const review = await f.hub.publicationQueries.getReview(f.reviewer, request.id);
  let view = executionView({});
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/ai/model-options')
      return Response.json({ default_profile: '', profiles: [] });
    if (path.startsWith('/api/ai/executions?'))
      return Response.json({
        items: new URL(path, 'http://localhost').searchParams.has('version_id')
          ? [view.execution]
          : [],
        next_cursor: null,
      });
    if (path.endsWith('/events'))
      return new Response(
        'event: stream.snapshot\ndata: ' + JSON.stringify({ schema_version: 1, ...view }) + '\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    if (path === '/api/ai/executions/execution') return Response.json(view);
    assert(path.startsWith('/api/management/versions/'));
    return new Response('审核证据');
  });
  for (const [owner, approved, digest, mark] of [
    [f.admin.id, true, review.content_digest, '尚无报告'],
    [f.reviewer.id, false, review.content_digest, '未采纳'],
    [f.reviewer.id, true, 'sha256:another', '这份报告与候选内容不匹配，请重新审计。'],
  ] as const) {
    view = executionView({
      operation_id: 'resource-audit',
      owner_id: owner,
      input: { version_id: review.version_id },
      result: {
        ...businessReport,
        version_id: review.version_id,
        content_digest: digest,
        approved,
      },
    });
    const page = render(withHub(createElement(ReviewDetail, { request: review }), f.reviewer.id));
    fireEvent.click(screen.getAllByRole('button', { name: '审核决定' })[0]);
    const drawer = within(await screen.findByRole('dialog', { name: '记录审核决定' }));
    await drawer.findByText(mark === '未采纳' ? /未采纳 ·/ : mark);
    assert.equal(drawer.getByRole<HTMLTextAreaElement>('textbox', { name: '审核意见' }).value, '');
    assert.equal(drawer.queryByRole('button', { name: '引用审计建议' }), null);
    page.unmount();
  }
});
