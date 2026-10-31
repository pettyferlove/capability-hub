import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, type ReactNode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { IntakeDetail } from '../../apps/web/src/features/publishing/IntakeDetail.js';
import ManagementPanel from '../../apps/web/src/features/catalog/ManagementPanel.js';
import { VersionComparison } from '../../apps/web/src/shared/components/VersionComparison.js';
import { UploadPanel } from '../../apps/web/src/features/publishing/UploadPanel.js';
import { ReviewDetail } from '../../apps/web/src/features/review/ReviewDetail.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';
import {
  createTestHub,
  receiveSkill,
  submitPublication,
  publishSkill,
} from '../support/application.js';

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
            can_ai: false,
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

test('维护资产显示版本与审核入口，更新链接预选原资产', async (context) => {
  const f = await createTestHub(context);
  const first = await publishSkill(f);
  const next = await receiveSkill(f, { assetId: first.intake.asset_id, version: '1.0.1' });
  const request = await submitPublication(f, next);
  const managed = await f.hub.assetManagement.list(f.admin);
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/management/assets') return Response.json(managed);
    if (path.endsWith('/version-plan'))
      return Response.json(await f.hub.intakeQueries.versionPlan(f.admin, first.intake.asset_id));
    if (path.startsWith('/api/intakes?'))
      return Response.json({
        items: [],
        total: 0,
        page: 1,
        page_size: 5,
        counts: {},
        processing_total: 0,
      });
    assert.fail('Unexpected fetch: ' + path);
  });
  const view = render(page(createElement(ManagementPanel)));
  const update = await screen.findByRole('link', { name: '更新版本' });
  assert.equal(
    new URL(update.getAttribute('href')!, 'https://hub.test').searchParams.get('asset'),
    first.intake.asset_id,
  );
  assert.equal(
    screen.getByRole('link', { name: '1.0.1' }).getAttribute('href'),
    '/review?request=' + request.id,
  );
  assert(screen.getByText('1.0.0'));
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox', { name: '搜索维护资产' }), 'missing');
  assert(screen.getByText('没有匹配的资产'));
  view.unmount();
  render(page(createElement(UploadPanel, { initialAssetId: first.intake.asset_id })));
  await screen.findByText(/正在更新/);
  await waitFor(() =>
    assert.equal(
      (screen.getByRole('textbox', { name: /^发布版本/ }) as HTMLInputElement).value,
      '1.0.2',
    ),
  );
  assert.equal(
    screen.getByRole('radio', { name: '已有资产新版本' }).getAttribute('aria-checked'),
    'true',
  );
});

test('版本点阵区分首次发布、相同内容与内容更新', () => {
  const previous = { version_label: '1.0.0', content_digest: 'sha256:' + 'a'.repeat(64) };
  const candidate = { version_label: '1.0.1', content_digest: 'sha256:' + 'b'.repeat(64) };
  const view = render(createElement(VersionComparison, { kind: 'mcp', previous: null, candidate }));
  assert(screen.getByText('首次发布'));
  view.rerender(createElement(VersionComparison, { kind: 'mcp', previous, candidate: previous }));
  assert(screen.getByText('内容未变化'));
  view.rerender(createElement(VersionComparison, { kind: 'mcp', previous, candidate }));
  assert(screen.getByText('内容更新'));
  assert.equal(screen.getAllByRole('img').length, 2);
  assert(screen.getAllByRole('img')[1].querySelector('rect[stroke="var(--danger)"]'));
});

test('提交审核沿用已展示基线，成功后链接新申请', async (context) => {
  const f = await createTestHub(context);
  const first = await publishSkill(f);
  const next = await receiveSkill(f, { assetId: first.intake.asset_id, version: '1.0.1' });
  let submitted: Record<string, unknown> | undefined;
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path === '/api/scenarios') return Response.json([]);
    if (path === '/api/publication-requests') {
      submitted = JSON.parse(String(options.body)) as Record<string, unknown>;
      return Response.json({ id: 'new-review-id' });
    }
    assert.fail('Unexpected fetch: ' + path);
  });
  render(page(createElement(IntakeDetail, { intake: next })));
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: '共享目的与授权确认' }), '核对新版本并共享');
  await user.click(screen.getByRole('button', { name: '确认内容并提交审核' }));
  assert.equal(
    (await screen.findByRole('link', { name: '查看审核' })).getAttribute('href'),
    '/review?request=new-review-id',
  );
  assert.equal(submitted?.base_release_id, next.current_release_id);
});
