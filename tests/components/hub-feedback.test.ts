import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test, type TestContext } from 'node:test';
import { createElement, useEffect, useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent, type UserEvent } from '@testing-library/user-event';
import type { HubFeedbackCreateRequest } from '@capability-hub/contracts';
import HubFeedbackAssistant from '../../apps/web/src/features/feedback/HubFeedbackAssistant.js';
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
