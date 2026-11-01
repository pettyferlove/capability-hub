import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { recentTrail } from '../../apps/web/src/features/ai/agent-brief.js';
import { InteractionForm } from '../../apps/web/src/features/ai/InteractionForm.js';
import { BusinessAgentPanel } from '../../apps/web/src/features/ai/BusinessAgentPanel.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';

afterEach(cleanup);

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
    if (path === '/api/ai/catalog')
      return Response.json({
        default_profile: 'primary',
        profiles: [{ id: 'primary', label: '模型', format: 'openai', model: 'fixture' }],
        operations: [],
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
  render(
    createElement(
      HubCtx.Provider,
      {
        value: {
          me: {
            id: 'owner',
            username: 'owner',
            display_name: '维护者',
            csrf_token: '',
            groups: [],
            features: { git_hosts: [] },
            capabilities: {
              can_ai: true,
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
      createElement(BusinessAgentPanel, { versionId: 'version', title: '测试资源' }),
    ),
  );
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
