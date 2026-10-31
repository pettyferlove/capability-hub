import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import {
  aiExecutionViewResponseSchema,
  aiEventResponseSchema,
  type AiExecutionResponse,
} from '@capability-hub/contracts';
import { ExecutionPanel } from '../../apps/web/src/features/ai/ExecutionPanel.js';
import { ExecutionResult } from '../../apps/web/src/features/ai/ExecutionResult.js';
import { ActivityFeed } from '../../apps/web/src/features/ai/ActivityFeed.js';
import { activityItems } from '../../apps/web/src/features/ai/activity.js';
import { advanceStreamCursor } from '../../apps/web/src/features/ai/stream-text.js';
import { StreamingText } from '../../apps/web/src/features/ai/StreamingText.js';

afterEach(cleanup);
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

test('活动流仅在底部跟随，阅读历史时保持位置并支持回到最新', () => {
  let execution = executionView({
    status: 'running',
    operation_id: 'assistant',
    input: { prompt: '解释这个问题' },
    message_blocks: [
      { id: 'block', message_id: 'assistant:one', text: '第一段回答', complete: false },
    ],
  }).execution;
  const { rerender } = render(
    createElement(ActivityFeed, {
      canManage: true,
      view: { ...executionView(), execution },
      active: true,
      onRefresh: () => undefined,
      focusRequest: 0,
    }),
  );
  const region = screen.getByRole('region', { name: '任务活动' });
  // 仅模拟滚动输入与位置；jsdom 不提供布局，实际高度由用户浏览器验收。
  Object.defineProperty(region, 'scrollHeight', { value: 1200, writable: true });
  Object.defineProperty(region, 'clientHeight', { value: 400 });
  region.scrollTop = 800;
  fireEvent.scroll(region);
  Object.defineProperty(region, 'scrollHeight', { value: 1800 });
  execution = {
    ...execution,
    message_blocks: [{ ...execution.message_blocks[0], text: '第一段回答，继续生成内容。' }],
  };
  rerender(
    createElement(ActivityFeed, {
      canManage: true,
      view: { ...executionView(), execution },
      active: true,
      onRefresh: () => undefined,
      focusRequest: 0,
    }),
  );
  assert.equal(region.scrollTop, 1800);
  region.scrollTop = 200;
  fireEvent.scroll(region);
  Object.defineProperty(region, 'scrollHeight', { value: 2200 });
  execution = {
    ...execution,
    message_blocks: [
      { ...execution.message_blocks[0], text: '第一段回答，继续生成内容。新增一段回答。' },
    ],
  };
  rerender(
    createElement(ActivityFeed, {
      canManage: true,
      view: { ...executionView(), execution },
      active: true,
      onRefresh: () => undefined,
      focusRequest: 0,
    }),
  );
  assert.equal(region.scrollTop, 200);
  fireEvent.click(screen.getByRole('button', { name: '回到最新' }));
  assert.equal(region.scrollTop, 2200);
  assert.equal(screen.queryByRole('button', { name: '回到最新' }), null);
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

test('人工回答后在协作过程留下决策记录，角色概览区分规划和两类审查', () => {
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
  const roster = screen.getByRole('region', { name: '协作角色' });
  for (const role of ['规划助手', '表达审查', '风险审查'])
    assert.ok(within(roster).getByText(role));
});

test('文字动画保持字素完整，减少动态效果时直接显示完整 Markdown', () => {
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
  const { rerender } = render(createElement(StreamingText, { text: '**历史内容**', live: true }));
  assert.ok(screen.getByText('历史内容'));
  rerender(createElement(StreamingText, { text: '**历史内容**\n\n完整的新内容👨‍👩‍👧‍👦', live: true }));
  assert.ok(screen.getByText('完整的新内容👨‍👩‍👧‍👦'));
});
