import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test, type TestContext } from 'node:test';
import { createElement, useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { userEvent, type UserEvent } from '@testing-library/user-event';
import type { HubFeedbackCreateRequest } from '@capability-hub/contracts';
import HubFeedbackAssistant from '../../apps/web/src/features/feedback/HubFeedbackAssistant.js';
import { HubFeedbackFiles } from '../../apps/web/src/features/feedback/HubFeedbackFiles.js';
import { HubFeedbackHints } from '../../apps/web/src/features/feedback/HubFeedbackHints.js';
import { api } from '../../apps/web/src/shared/api/client.js';
import { HubCtx, type HubState } from '../../apps/web/src/shared/context/HubContext.js';
import type { HubFeedbackSeed } from '../../apps/web/src/shared/hub-feedback-events.js';

const hub: HubState = {
  me: {
    id: 'feedback-reader',
    username: 'reader',
    display_name: '目录成员',
    auth_provider: 'local',
    groups: [],
    csrf_token: 'test-csrf',
    features: { git_hosts: [] },
    capabilities: {
      can_ai: false,
      can_ai_console: false,
      can_admin: false,
      can_audit: false,
      can_manage_feedback: false,
      can_publish: false,
      can_review: false,
    },
  },
  refresh: 0,
  reviewCount: 0,
  reload: () => {},
  openPalette: () => {},
  logout: async () => {},
};

const seed: HubFeedbackSeed = {
  request: {
    at: '2026-11-20T00:00:00Z',
    method: 'GET',
    path: '/api/catalog',
    status: 503,
    code: 'TEST_UNAVAILABLE',
    request_id: '00000000-0000-4000-8000-000000000001',
  },
};

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.removeItem('capability-hub:feedback-hints');
});

function mountAssistant({
  me = hub.me,
  seed,
}: { me?: HubState['me']; seed?: HubFeedbackSeed } = {}) {
  function Harness() {
    const [open, setOpen] = useState(true);
    useEffect(() => {
      const reopen = () => setOpen(true);
      window.addEventListener('hub:feedback', reopen);
      return () => window.removeEventListener('hub:feedback', reopen);
    }, []);
    return createElement(HubFeedbackAssistant, {
      open,
      route: { page: 'discover', query: '' },
      seed,
      unread: 0,
      onClose: () => setOpen(false),
    });
  }
  render(createElement(HubCtx.Provider, { value: { ...hub, me } }, createElement(Harness)));
}

function captureFailedSubmissions(context: TestContext) {
  const requests: { key: string | null; metadata: HubFeedbackCreateRequest }[] = [];
  context.mock.method(globalThis, 'fetch', (path: string, options: RequestInit) => {
    assert.equal(path, '/api/hub-feedback');
    assert.equal(options.method, 'POST');
    assert(options.body instanceof FormData);
    const metadata = options.body.get('metadata');
    assert(typeof metadata === 'string');
    requests.push({
      key: new Headers(options.headers).get('Idempotency-Key'),
      metadata: JSON.parse(metadata),
    });
    return Promise.resolve(
      Response.json(
        { error: { message: `反馈暂时无法提交（${requests.length}）` } },
        { status: 503 },
      ),
    );
  });
  return requests;
}

async function fillFeedback(user: UserEvent) {
  await user.type(screen.getByRole('textbox', { name: '标题' }), '目录没有加载');
  await user.type(screen.getByRole('textbox', { name: '描述' }), '打开目录后未显示资源。');
}

test('取消勾选的失败请求不进入反馈，仍发送保留的页面诊断', async (context) => {
  const requests = captureFailedSubmissions(context);
  const user = userEvent.setup();
  mountAssistant({ seed });
  await fillFeedback(user);
  const failedRequest = screen.getByRole<HTMLInputElement>('checkbox', { name: '最近失败的请求' });
  assert(failedRequest.checked);
  await user.click(failedRequest);
  await user.click(screen.getByRole('button', { name: '提交反馈' }));
  await screen.findByText('反馈暂时无法提交（1）');

  const diagnostics = requests[0]?.metadata.diagnostics?.client;
  assert(diagnostics?.kind === 'web');
  assert.equal(diagnostics.page, 'discover');
  assert.equal(diagnostics.failed_requests, undefined);
});

test('失败后提交未改动的反馈，复用相同的幂等键', async (context) => {
  const requests = captureFailedSubmissions(context);
  const user = userEvent.setup();
  mountAssistant();
  await fillFeedback(user);
  await user.click(screen.getByRole('button', { name: '提交反馈' }));
  await screen.findByText('反馈暂时无法提交（1）');
  await user.click(screen.getByRole('button', { name: '提交反馈' }));
  await screen.findByText('反馈暂时无法提交（2）');

  assert.equal(requests.length, 2);
  assert(requests[0].key);
  assert.equal(requests[1].key, requests[0].key);
  assert.equal(requests[0].metadata.title, '目录没有加载');
  assert.equal(requests[0].metadata.description, '打开目录后未显示资源。');
  assert.deepEqual(requests[1].metadata, requests[0].metadata);
});

test('收起后通过草稿胶囊恢复填写的反馈', async () => {
  const user = userEvent.setup();
  mountAssistant();
  await fillFeedback(user);
  await user.click(screen.getByRole('button', { name: '收起' }));
  const draft = await screen.findByRole('button', { name: '草稿 · 继续反馈' });
  assert.equal(screen.queryByRole('textbox', { name: '标题' }), null);
  await user.click(draft);

  const title = await screen.findByRole<HTMLInputElement>('textbox', { name: '标题' });
  assert.equal(title.value, '目录没有加载');
  assert.equal(
    screen.getByRole<HTMLTextAreaElement>('textbox', { name: '描述' }).value,
    '打开目录后未显示资源。',
  );
});

test('未登录时提示登录且无法提交反馈', async (context) => {
  const fetch = context.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(Response.json({ error: { message: '需要登录' } }, { status: 401 })),
  );
  mountAssistant({ me: null });

  assert(await screen.findByText(/需要登录/));
  const login = screen.getByRole<HTMLAnchorElement>('link', { name: /登录/ });
  assert.equal(new URL(login.href).pathname, '/login');
  assert.equal(screen.queryByRole('textbox', { name: '标题' }), null);
  assert.equal(screen.queryByRole('button', { name: '提交反馈' }), null);
  assert.equal(fetch.mock.callCount(), 0);
});

const triggerLabel = { name: '反馈此问题' };

function failFeedbackRequests(context: TestContext, status: number) {
  context.mock.method(globalThis, 'fetch', (path: string) =>
    Promise.resolve(Response.json({ error: { code: path.split('/').at(-1) } }, { status })),
  );
  return async (code: string) => {
    await act(async () => assert.rejects(api('/api/assets/' + code)));
  };
}

test('关闭这次提示后，同一页面不再提示相同错误码', async (context) => {
  const fail = failFeedbackRequests(context, 503);
  render(createElement(HubFeedbackHints));

  await fail('CATALOG_UNAVAILABLE');
  fireEvent.click(screen.getByRole('button', triggerLabel));
  assert.equal(screen.queryByRole('button', triggerLabel), null);
  await fail('CATALOG_UNAVAILABLE');
  assert.equal(screen.queryByRole('button', triggerLabel), null);
  await fail('STORAGE_UNAVAILABLE');
  assert(screen.getByRole('button', triggerLabel));
});

test('客户端请求失败不打扰用户', async (context) => {
  const fail = failFeedbackRequests(context, 403);
  render(createElement(HubFeedbackHints));

  await fail('FORBIDDEN');
  assert.equal(screen.queryByRole('button', triggerLabel), null);
});

test('选择不再提示后，下次挂载也不显示其他服务端错误的提示', async (context) => {
  const fail = failFeedbackRequests(context, 503);
  const view = render(createElement(HubFeedbackHints));

  await fail('MODEL_BUSY');
  fireEvent.click(screen.getByRole('button', { name: '不再提示' }));
  assert.equal(screen.queryByRole('button', triggerLabel), null);
  assert.equal(window.localStorage.getItem('capability-hub:feedback-hints'), 'off');
  view.unmount();
  render(createElement(HubFeedbackHints));
  await fail('SOURCE_UNAVAILABLE');
  assert.equal(screen.queryByRole('button', triggerLabel), null);
});

test('文本附件预览只在超过 200 行时提示截断，末尾换行不算一行', async (context) => {
  let body = '';
  context.mock.method(globalThis, 'fetch', () => Promise.resolve(new Response(body)));
  for (const [text, summary] of [
    ['记录\n'.repeat(200), /· 200 行$/],
    ['记录\n'.repeat(201), /· 201 行，仅预览前 200 行$/],
  ] as const) {
    body = text;
    render(
      createElement(HubFeedbackFiles, {
        files: [
          {
            id: 'report',
            event_id: null,
            kind: 'text',
            media_type: 'text/plain',
            name: 'report.md',
            size: Buffer.byteLength(text),
            width: null,
            height: null,
            removed_at: null,
            can_remove: false,
          },
        ],
        path: '/api/hub-feedback/1',
        disabled: false,
        onRemove: () => {},
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: '查看文本' }));
    assert.match((await screen.findByText(/\d+ 行/)).textContent ?? '', summary);
    cleanup();
  }
});
