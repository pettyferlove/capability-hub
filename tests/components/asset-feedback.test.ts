import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FeedbackForm } from '../../apps/web/src/features/catalog/FeedbackForm.js';
import { FeedbackDetail } from '../../apps/web/src/features/catalog/FeedbackDetail.js';
import { AssetFeedback } from '../../apps/web/src/features/catalog/AssetFeedback.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';
import type { AssetFeedbackResponse } from '@capability-hub/contracts/http';

afterEach(cleanup);
const feedback: AssetFeedbackResponse = {
  id: 'feedback-1',
  asset_id: 'asset-1',
  version_id: 'version-1',
  version_label: '1.0.0',
  submitted_by: 'reader',
  kind: 'defect',
  title: '导入失败',
  scenario: '处理空数据',
  expected: '显示提示',
  actual: '<script>alert(1)</script>',
  location: '',
  reproduction: '',
  evidence: '',
  suggestion: '',
  blocking: false,
  status: 'pending',
  resolution: '',
  fixed_version_id: null,
  fixed_version_label: null,
  updated_by: null,
  created_at: '2026-10-30T00:00:00Z',
  updated_at: '2026-10-30T00:00:00Z',
  revision: 1,
  can_manage: false,
  detail_url: '/asset/example?feedback=feedback-1',
};

test('反馈表单要求授权，失败保留内容和幂等键，修改内容后生成新键', async (context) => {
  const requests: Record<string, unknown>[] = [];
  let submitted = 0;
  context.mock.method(globalThis, 'fetch', (path: string, options: RequestInit) => {
    if (path.endsWith('/versions'))
      return Promise.resolve(Response.json([{ version_id: 'version-1', version_label: '1.0.0' }]));
    assert.equal(path, '/api/feedback');
    requests.push(JSON.parse(String(options.body)));
    return Promise.resolve(
      requests.length < 3
        ? Response.json({ error: { message: '暂时失败' } }, { status: 503 })
        : Response.json(feedback),
    );
  });
  const user = userEvent.setup();
  render(
    createElement(FeedbackForm, {
      assetId: 'asset-1',
      versionId: 'version-1',
      onSubmitted: () => {
        submitted++;
      },
    }),
  );
  await user.type(screen.getByRole('textbox', { name: '反馈标题（必填）' }), '导入失败');
  await user.type(screen.getByRole('textbox', { name: '业务场景与目标（必填）' }), '处理空数据');
  await user.type(screen.getByRole('textbox', { name: '预期行为（必填）' }), '显示提示');
  await user.type(screen.getByRole('textbox', { name: '实际观察到的现象（必填）' }), '异常退出');
  await user.click(screen.getByRole('button', { name: '提交反馈' }));
  assert.equal(requests.length, 0);
  await user.click(
    screen.getByRole('checkbox', { name: '我已检查并脱敏内容，同意提交给资产维护者' }),
  );
  await user.click(screen.getByRole('button', { name: '提交反馈' }));
  await screen.findByText('暂时失败');
  await user.click(screen.getByRole('button', { name: '提交反馈' }));
  await waitFor(() => assert.equal(requests.length, 2));
  assert.equal(requests[0].idempotency_key, requests[1].idempotency_key);
  await user.type(screen.getByRole('textbox', { name: '反馈标题（必填）' }), '（补充）');
  await user.click(screen.getByRole('button', { name: '提交反馈' }));
  await waitFor(() => assert.equal(submitted, 1));
  assert.notEqual(requests[1].idempotency_key, requests[2].idempotency_key);
  assert.equal(requests[2].consent, true);
});

test('反馈内容以普通文本展示，普通提交者没有处理控件', () => {
  render(
    createElement(
      HubCtx.Provider,
      {
        value: {
          me: null,
          refresh: 0,
          reviewCount: 0,
          reload: () => {},
          openPalette: () => {},
          logout: async () => {},
        },
      },
      createElement(FeedbackDetail, { feedback, onRefresh: () => {} }),
    ),
  );
  assert(screen.getByText('<script>alert(1)</script>'));
  assert.equal(document.querySelector('script'), null);
  assert.equal(screen.queryByRole('button', { name: '保存处理结果' }), null);
});

test('维护者保存时携带所见修订，冲突保留处理说明并提示刷新', async (context) => {
  const requests: unknown[] = [];
  context.mock.method(globalThis, 'fetch', (path: string, options: RequestInit) => {
    if (path.endsWith('/versions')) return Promise.resolve(Response.json([]));
    assert.equal(options.method, 'PATCH');
    requests.push(JSON.parse(String(options.body)));
    return Promise.resolve(
      Response.json(
        { error: { code: 'REVISION_CONFLICT', message: '反馈已被更新，请刷新后重试' } },
        { status: 409 },
      ),
    );
  });
  const user = userEvent.setup();
  render(
    createElement(
      HubCtx.Provider,
      {
        value: {
          me: null,
          refresh: 0,
          reviewCount: 0,
          reload: () => {},
          openPalette: () => {},
          logout: async () => {},
        },
      },
      createElement(FeedbackDetail, {
        feedback: { ...feedback, can_manage: true },
        onRefresh: () => assert.fail('冲突不能视为成功'),
      }),
    ),
  );
  await user.type(screen.getByRole('textbox', { name: '处理说明' }), '待确认复现');
  await user.click(screen.getByRole('button', { name: '保存处理结果' }));
  await screen.findByText('反馈已被更新，请刷新后重试');
  assert.deepEqual(requests, [
    { revision: 1, status: 'pending', resolution: '待确认复现', fixed_version_id: null },
  ]);
  assert.equal(
    (screen.getByRole('textbox', { name: '处理说明' }) as HTMLTextAreaElement).value,
    '待确认复现',
  );
});

test('匿名访问不请求反馈接口，只展示登录说明', (context) => {
  context.mock.method(globalThis, 'fetch', () => assert.fail('匿名不能加载私有反馈'));
  render(
    createElement(
      HubCtx.Provider,
      {
        value: {
          me: null,
          refresh: 0,
          reviewCount: 0,
          reload: () => {},
          openPalette: () => {},
          logout: async () => {},
        },
      },
      createElement(AssetFeedback, { assetId: 'asset-1', versionId: 'version-1' }),
    ),
  );
  assert(screen.getByText('登录后可提交和查看反馈。'));
});

function feedbackPage(canAi = false) {
  return createElement(
    HubCtx.Provider,
    {
      value: {
        me: {
          id: 'reader',
          username: 'reader',
          display_name: '读者',
          csrf_token: '',
          groups: [],
          capabilities: {
            can_ai: canAi,
            can_admin: false,
            can_publish: false,
            can_review: false,
            can_audit: false,
          },
          features: { git_hosts: [] },
        },
        refresh: 0,
        reviewCount: 0,
        reload: () => {},
        openPalette: () => {},
        logout: async () => {},
      },
    },
    createElement(AssetFeedback, { assetId: 'asset-1', versionId: 'version-1' }),
  );
}

test('反馈列表与详情切换，表单返回保留草稿，成功后打开新记录', async (context) => {
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path.includes('/feedback?page=')) return Response.json({ items: [feedback], total: 1 });
    if (path.endsWith('/versions'))
      return Response.json([{ version_id: 'version-1', version_label: '1.0.0' }]);
    if (path === '/api/feedback/feedback-1') return Response.json(feedback);
    if (path === '/api/feedback' && options.method === 'POST') return Response.json(feedback);
    assert.fail('Unexpected fetch: ' + path);
  });
  const user = userEvent.setup();
  render(feedbackPage());
  await user.click(await screen.findByRole('button', { name: /导入失败/ }));
  assert(await screen.findByRole('article', { name: '反馈详情：导入失败' }));
  assert.equal(screen.queryByRole('button', { name: '上一页' }), null);
  await user.click(screen.getByRole('button', { name: '返回反馈列表' }));
  await user.click(screen.getByRole('button', { name: '提交问题或建议' }));
  await user.type(screen.getByRole('textbox', { name: '反馈标题（必填）' }), '草稿问题');
  await user.click(screen.getByRole('button', { name: '返回反馈列表（保留草稿）' }));
  await user.click(screen.getByRole('button', { name: '继续填写反馈' }));
  assert.equal(
    (screen.getByRole('textbox', { name: '反馈标题（必填）' }) as HTMLInputElement).value,
    '草稿问题',
  );
  await user.type(screen.getByRole('textbox', { name: '业务场景与目标（必填）' }), '处理空数据');
  await user.type(screen.getByRole('textbox', { name: '预期行为（必填）' }), '显示提示');
  await user.type(screen.getByRole('textbox', { name: '实际观察到的现象（必填）' }), '异常退出');
  await user.click(
    screen.getByRole('checkbox', { name: '我已检查并脱敏内容，同意提交给资产维护者' }),
  );
  await user.click(screen.getByRole('button', { name: '提交反馈' }));
  assert(await screen.findByText('反馈已提交，可在此查看后续处理结果。'));
  assert(await screen.findByRole('article', { name: '反馈详情：导入失败' }));
});

test('处理说明保存后立即在详情顶部展示，返回列表后仍可识别该结果', async (context) => {
  let current = { ...feedback, can_manage: true };
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path.includes('/feedback?page=')) return Response.json({ items: [current], total: 1 });
    if (path.endsWith('/versions')) return Response.json([]);
    assert.equal(path, '/api/feedback/feedback-1');
    if (options.method === 'PATCH') {
      const update = JSON.parse(String(options.body)) as { resolution: string };
      current = {
        ...current,
        resolution: update.resolution.trim(),
        updated_by: 'reader',
        revision: 2,
      };
    }
    return Response.json(current);
  });
  const user = userEvent.setup();
  render(feedbackPage());
  await user.click(await screen.findByRole('button', { name: /导入失败/ }));
  const result = await screen.findByRole('region', { name: '处理结果' });
  assert(within(result).getByText('尚无处理记录。'));
  assert.equal(screen.queryByText('处理结果已保存。'), null);
  await user.type(screen.getByRole('textbox', { name: '处理说明' }), '已记录复现步骤');
  await user.click(screen.getByRole('button', { name: '保存处理结果' }));
  assert(await within(result).findByText('已记录复现步骤'));
  assert(within(result).getByText('处理结果已保存。'));
  assert.equal(document.activeElement, result);
  await user.click(screen.getByRole('button', { name: '返回反馈列表' }));
  const row = await screen.findByRole('button', { name: /导入失败.*处理说明 · 已记录复现步骤/ });
  await user.click(row);
  assert(
    await within(await screen.findByRole('region', { name: '处理结果' })).findByText(
      '已记录复现步骤',
    ),
  );
  assert.equal(screen.queryByText('处理结果已保存。'), null);
});

test('已采纳研判填入空白草稿，保留手工修改，尚未保存时不显示保存回执', async (context) => {
  const record = { ...feedback, can_manage: true };
  const execution = {
    id: 'triage',
    owner_id: 'reader',
    operation_id: 'feedback-triage',
    model_profile: 'primary',
    status: 'succeeded',
    revision: 1,
    attempt: 1,
    continuation: 0,
    input: { feedback_id: record.id, version_id: record.version_id },
    result: {
      approved: true,
      feedback_applied: false,
      feedback_id: record.id,
      version_id: record.version_id,
      feedback_revision: record.revision,
      assessment: { suggested_resolution: '核对导入格式' },
    },
    created_at: record.created_at,
    updated_at: record.updated_at,
    deadline: 1800000000000,
    last_seq: 0,
    message_text: '',
    message_blocks: [],
    error: null,
    usage: { requests: 1, tools: 1, input_tokens: 20, output_tokens: 8, unknown_requests: 0 },
  };
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    assert.equal(options.method ?? 'GET', 'GET');
    if (path.includes('/feedback?page=')) return Response.json({ items: [record], total: 1 });
    if (path === '/api/feedback/' + record.id) return Response.json(record);
    if (path.endsWith('/versions')) return Response.json([]);
    if (path === '/api/ai/catalog')
      return Response.json({
        default_profile: 'primary',
        profiles: [{ id: 'primary', label: '模型', format: 'openai', model: 'fixture' }],
        operations: [],
      });
    if (path.includes('/ai/executions?'))
      return Response.json({ items: [execution], next_cursor: null });
    if (path.endsWith('/events'))
      return new Response('', { headers: { 'Content-Type': 'text/event-stream' } });
    assert.equal(path, '/api/ai/executions/triage');
    return Response.json({
      execution,
      artifacts: [],
      interactions: [],
      activity: [],
      activity_truncated: false,
      watermark: 0,
    });
  });
  const user = userEvent.setup();
  render(feedbackPage(true));
  await user.click(await screen.findByRole('button', { name: /导入失败/ }));
  await user.click(await screen.findByRole('button', { name: '研判已采纳 · 查看处理说明草稿' }));
  const editor = screen.getByRole('textbox', { name: '处理说明' }) as HTMLTextAreaElement;
  assert.equal(editor.value, '核对导入格式');
  assert(screen.getByText('尚无处理记录。'));
  assert.equal(screen.queryByText('处理结果已保存。'), null);
  await user.clear(editor);
  await user.type(editor, '我的说明');
  assert.equal(editor.value, '我的说明');
  await user.click(screen.getByRole('button', { name: '使用研判建议替换当前说明' }));
  assert.equal(editor.value, '核对导入格式');
});
