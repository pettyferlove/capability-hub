import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, type ReactNode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { UploadPanel } from '../../apps/web/src/features/publishing/UploadPanel.js';
import { ReviewDetail } from '../../apps/web/src/features/review/ReviewDetail.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';
import { createTestHub, receiveSkill, submitPublication } from '../support/application.js';

afterEach(cleanup);

function page(child: ReactNode) {
  return createElement(
    HubCtx.Provider,
    {
      value: {
        me: {
          id: 'user',
          username: 'owner',
          display_name: '维护者',
          csrf_token: '',
          groups: [{ id: 'team', name: '工程团队' }],
          capabilities: {
            can_admin: false,
            can_audit: false,
            can_publish: true,
            can_review: false,
          },
          features: { git_hosts: [] },
        },
        reviewCount: 0,
        refresh: 0,
        reload: () => {},
        openPalette: () => {},
        logout: async () => {},
      },
    },
    child,
  );
}

test('上传入口提供 API Key 选项并随文件提交，切换 MCP 后隐藏且重置', async (context) => {
  const submitted: Record<string, unknown>[] = [];
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path === '/api/management/assets') return Response.json([]);
    if (path.startsWith('/api/intakes?'))
      return Response.json({
        items: [],
        total: 0,
        page: 1,
        page_size: 5,
        counts: {},
        processing_total: 0,
      });
    if (path === '/api/intakes') {
      assert(options.body instanceof FormData);
      submitted.push(JSON.parse(String(options.body.get('metadata'))));
      return Response.json({ error: { message: '上传重试测试' } }, { status: 503 });
    }
    assert.fail('Unexpected fetch: ' + path);
  });
  const user = userEvent.setup();
  render(page(createElement(UploadPanel)));
  await user.upload(
    screen.getByLabelText('选择上传文件'),
    new window.File(['zip'], 'auth-skill.zip', { type: 'application/zip' }),
  );
  const field = screen.getByRole('checkbox', { name: '使用时需要 API Key' });
  assert.equal((field as HTMLInputElement).checked, false);
  await user.click(field);
  await user.click(screen.getByRole('button', { name: '上传并校验' }));
  await screen.findByText('上传重试测试');
  assert.equal(submitted[0].requires_api_key, true);
  assert.equal(submitted[0].kind, 'skill');
  await user.click(screen.getByRole('radio', { name: 'MCP 服务' }));
  assert.equal(screen.queryByRole('checkbox', { name: '使用时需要 API Key' }), null);
  await user.click(screen.getByRole('radio', { name: 'Skill ZIP' }));
  assert.equal(
    (screen.getByRole('checkbox', { name: '使用时需要 API Key' }) as HTMLInputElement).checked,
    false,
  );
});

test('审核详情可重复定位 Skill 文件，未声明不推断无需认证', async (context) => {
  const scrollTargets: string[] = [];
  context.mock.method(
    HTMLElement.prototype,
    'scrollIntoView',
    function (this: HTMLElement, options: ScrollIntoViewOptions) {
      scrollTargets.push(this.getAttribute('aria-label') ?? '');
      assert.equal(options.behavior, 'auto');
    },
  );
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  const submitted = await submitPublication(f, intake);
  const review = {
    ...(await f.hub.publicationQueries.getReview(f.reviewer, submitted.id)),
    requires_api_key: true,
  };
  const otherFile = { ...review.candidate.manifest.files[0], path: 'AUTH.md' };
  review.candidate.manifest.files.push(otherFile);
  review.diff.push({ ...otherFile, status: 'added' });
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    assert(path.startsWith('/api/management/versions/'));
    return new Response(path.endsWith('AUTH.md') ? '独立认证步骤' : 'Skill 使用说明');
  });
  const user = userEvent.setup();
  const view = render(page(createElement(ReviewDetail, { request: review })));
  const usage = screen.getByRole('region', { name: '认证与使用要求' });
  assert(within(usage).getByText('需 API Key'));
  assert.match(usage.textContent ?? '', /不代表没有登录、OAuth/);
  await user.click(screen.getByRole('tab', { name: '发布信息与授权' }));
  await user.click(within(usage).getByRole('button', { name: '定位到 SKILL.md 文件预览' }));
  await waitFor(() =>
    assert.equal(
      screen.getByRole('tab', { name: /变更审查/ }).getAttribute('aria-selected'),
      'true',
    ),
  );
  await screen.findByText('Skill 使用说明');
  await waitFor(() =>
    assert.equal(document.activeElement?.getAttribute('aria-label'), '文件预览：SKILL.md'),
  );
  assert.equal(
    screen.getByRole('group', { name: '文件预览：SKILL.md' }).getAttribute('data-highlighted'),
    'true',
  );
  await user.click(screen.getByRole('button', { name: '查看文件 AUTH.md' }));
  await screen.findByText('独立认证步骤');
  await user.click(within(usage).getByRole('button', { name: '定位到 SKILL.md 文件预览' }));
  await screen.findByText('Skill 使用说明');
  await waitFor(() =>
    assert.equal(scrollTargets.filter((label) => label === '文件预览：SKILL.md').length, 2),
  );
  assert.equal(document.activeElement?.getAttribute('aria-label'), '文件预览：SKILL.md');
  assert.equal(
    screen.getByRole('button', { name: '查看文件 SKILL.md' }).getAttribute('aria-current'),
    'true',
  );
  view.unmount();
  render(page(createElement(ReviewDetail, { request: { ...review, requires_api_key: false } })));
  assert(
    within(screen.getByRole('region', { name: '认证与使用要求' })).getByText(/未声明需要 API Key/),
  );
  assert.equal(screen.queryByText('无需 API Key'), null);
});
