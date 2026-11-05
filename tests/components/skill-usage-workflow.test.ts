import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { managementAssetListQuerySchema } from '@capability-hub/contracts';
import type { IntakeContributorResponse } from '@capability-hub/contracts/http';
import { createElement, type ReactNode } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { IntakeDetail } from '../../apps/web/src/features/publishing/IntakeDetail.js';
import { IntakeHistoryRow } from '../../apps/web/src/features/publishing/IntakeHistoryRow.js';
import { AssetCommunity } from '../../apps/web/src/features/catalog/AssetCommunity.js';
import DiscoverPage from '../../apps/web/src/features/catalog/DiscoverPage.js';
import ManagementPanel from '../../apps/web/src/features/catalog/ManagementPanel.js';
import { assetCardPixelRevealStyles } from '../../apps/web/src/features/catalog/styles.js';
import { cells, Glyph } from '../../apps/web/src/shared/components/Glyph.js';
import { VersionComparison } from '../../apps/web/src/shared/components/VersionComparison.js';
import { UploadPanel } from '../../apps/web/src/features/publishing/UploadPanel.js';
import { ReviewDetail } from '../../apps/web/src/features/review/ReviewDetail.js';
import { FileWorkbench } from '../../apps/web/src/features/review/FileWorkbench.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';
import {
  createTestHub,
  receiveSkill,
  submitPublication,
  publishSkill,
  testPassword,
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
          auth_provider: 'local',
          display_name: '维护者',
          csrf_token: '',
          groups: [{ id: 'team', name: '工程团队' }],
          capabilities: {
            can_ai: false,
            can_ai_console: false,
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
    if (path === '/api/management/assets/options') return Response.json([]);
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

test('新 MCP 的团队 Bearer Token 仅在确认领取范围后随接收请求提交', async (context) => {
  const posted: Record<string, unknown>[] = [];
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path === '/api/management/assets/options') return Response.json([]);
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
      posted.push(JSON.parse(String(options.body.get('metadata'))));
      return Response.json({ error: { message: '接收测试结束' } }, { status: 503 });
    }
    assert.fail('Unexpected fetch: ' + path);
  });
  const user = userEvent.setup();
  render(page(createElement(UploadPanel)));
  await user.click(screen.getByRole('radio', { name: 'MCP 服务' }));
  const url = 'https://example.test/mcp';
  await user.type(screen.getByRole('textbox', { name: 'MCP 服务地址' }), url);
  await user.type(screen.getByRole('textbox', { name: 'MCP 用途' }), '团队服务');
  await user.click(screen.getByRole('radio', { name: 'Bearer Token' }));
  assert(screen.getByRole('textbox', { name: /Token 环境变量名/ }));
  await user.click(screen.getByRole('radio', { name: 'Hub 共享凭据' }));
  const token = 'test-team-token';
  await user.type(screen.getByLabelText(/共享 Bearer Token/), token);
  const submit = screen.getByRole('button', { name: '添加并校验' });
  await user.click(submit);
  const dialog = screen.getByRole('dialog', { name: '确认共享凭据' });
  assert(within(dialog).getByText(url));
  assert(within(dialog).getByText('Authorization'));
  assert(within(dialog).getByText(/已登录且有该版本读取权限的人.+复制真实凭据/));
  assert(!dialog.textContent?.includes(token));
  assert.equal(posted.length, 0);
  await user.click(within(dialog).getByRole('button', { name: '取消' }));
  assert.equal(posted.length, 0);
  await user.click(submit);
  await user.click(screen.getByRole('button', { name: '确认共享并提交校验' }));
  await screen.findByText('接收测试结束');
  assert.equal(posted.length, 1);
  assert.equal(posted[0].shared_mcp_key, token);
  assert.equal(posted[0].confirm_sharing, true);
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
    if (path === '/api/ai/model-options')
      return Response.json({
        default_profile: 'primary',
        profiles: [{ id: 'primary', label: '模型' }],
      });
    if (path.startsWith('/api/ai/executions?'))
      return Response.json({ items: [], next_cursor: null });
    assert(path.startsWith('/api/management/versions/'));
    return new Response(path.endsWith('AUTH.md') ? '独立认证步骤' : 'Skill 使用说明');
  });
  const user = userEvent.setup();
  const view = render(page(createElement(ReviewDetail, { request: review })));
  const generate = within(
    screen.getByRole('region', { name: '发布审核助手' }),
  ).getByRole<HTMLButtonElement>('button', { name: '生成审核简报' });
  await waitFor(() => assert(!generate.disabled));
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

test('接收记录隐藏自动 Git 标签，详情缩写且保留完整快照标识', async (context) => {
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  assert(intake.version);
  const label =
    'git.7e1ca32e3252699a6344675b54cbd6ba0e5d803e.s88c84e92-7566-411e-993e-a257754af657.r1';
  const item = {
    id: intake.id,
    asset_id: intake.asset_id,
    asset_slug: intake.asset_slug,
    kind: 'skill' as const,
    version_label: label,
    created_at: intake.created_at,
    status: 'ready' as const,
    phase: intake.phase,
    source_kind: 'git' as const,
    content_digest: intake.content_digest!,
    file_count: 1,
    error_message: null,
  };
  let selected = '';
  const onSelect = (id: string) => {
    selected = id;
  };
  const view = render(createElement(IntakeHistoryRow, { item, onSelect }));
  assert.equal(screen.queryByText(label), null);
  assert(!screen.getByRole('button').getAttribute('aria-label')?.includes(label));
  assert(screen.getByText('Git 同步'));
  const user = userEvent.setup();
  await user.click(screen.getByRole('button'));
  assert.equal(selected, intake.id);
  view.rerender(
    createElement(IntakeHistoryRow, {
      item: { ...item, version_label: '1.2.3', source_kind: 'upload' },
      onSelect,
    }),
  );
  assert(screen.getByText('1.2.3'));
  view.unmount();
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/scenarios') return Response.json([]);
    assert.fail('Unexpected fetch: ' + path);
  });
  render(
    page(
      createElement(IntakeDetail, {
        intake: {
          ...intake,
          version_label: label,
          version: { ...intake.version, version_label: label },
        },
      }),
    ),
  );
  await user.click(screen.getByRole('tab', { name: '01 校验与证据' }));
  const progress = screen.getByRole('region', { name: '处理进度' });
  assert(within(progress).getByText('Git 7e1ca32e · r1'));
  assert.equal(within(progress).queryByText(label), null);
  assert.equal(within(progress).getByText('Git 7e1ca32e · r1').getAttribute('title'), label);
  await user.click(screen.getByText('Git 7e1ca32e · r1', { selector: 'summary span[title]' }));
  assert(screen.getByText('完整版本标识'));
  assert(screen.getByText(label, { selector: 'code' }));
});

test('维护资产显示版本与审核入口，更新链接预选原资产', async (context) => {
  const f = await createTestHub(context);
  const first = await publishSkill(f);
  const next = await receiveSkill(f, { assetId: first.intake.asset_id, version: '1.0.1' });
  const request = await submitPublication(f, next);
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path.startsWith('/api/management/assets?'))
      return Response.json(
        await f.hub.assetManagement.list(
          f.admin,
          managementAssetListQuerySchema.parse(
            Object.fromEntries(new URL(path, 'http://hub.test').searchParams),
          ),
        ),
      );
    if (path === '/api/management/assets/options')
      return Response.json(await f.hub.assetManagement.options(f.admin));
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
    screen.getByRole('link', { name: '查看 1.0.1 的待审核申请' }).getAttribute('href'),
    '/review?request=' + request.id,
  );
  assert(screen.getByText('1.0.0'));
  const table = within(screen.getByRole('table', { name: '维护资产' }));
  assert.equal(table.getAllByText('1.0.1').length, 1);
  assert.equal(table.getAllByText(/待审核/).length, 1);
  assert(table.getByText('待审核'));
  const user = userEvent.setup();
  await user.type(screen.getByRole('searchbox', { name: '搜索维护资产' }), 'missing');
  assert(await screen.findByText('没有匹配的资产'));
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

test('维护列表保留较早版本的待审入口，不混淆最新接收状态', async (context) => {
  for (const versions of [['1.0.1'], ['1.0.1', '1.0.2']]) {
    const f = await createTestHub(context);
    const first = await publishSkill(f);
    const pending = [];
    for (const version of versions) {
      const intake = await receiveSkill(f, { assetId: first.intake.asset_id, version });
      pending.push({ version, request: await submitPublication(f, intake) });
    }
    await receiveSkill(f, { assetId: first.intake.asset_id, version: '1.0.3' });
    context.mock.method(globalThis, 'fetch', async (path: string) => {
      assert(path.startsWith('/api/management/assets?'));
      return Response.json(await f.hub.assetManagement.list(f.admin));
    });
    const view = render(page(createElement(ManagementPanel)));
    const table = within(await screen.findByRole('table', { name: '维护资产' }));
    assert(table.getByRole('link', { name: '查看接收 1.0.3' }));
    assert(table.getByText('待提交审核'));
    for (const { version, request } of pending) {
      const link = table.getByRole('link', { name: `查看 ${version} 的待审核申请` });
      assert.equal(link.textContent, `待审核 · ${version}`);
      assert.equal(link.getAttribute('href'), '/review?request=' + request.id);
    }
    view.unmount();
  }
});

test('维护列表和版本记录展示上传人、Git 同步发起人及系统任务', async (context) => {
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  const assets = await f.hub.assetManagement.list(f.admin);
  const versions = await f.hub.assetManagement.versions(f.admin, intake.asset_id);
  const person = { kind: 'user' as const, name: '张三', username: 'zhangsan' };
  const cases: { contributor: IntakeContributorResponse; identity: string; label: string }[] = [
    {
      contributor: { source_kind: 'upload', actor: person },
      identity: '张三（@zhangsan）',
      label: '上传人：张三（@zhangsan）',
    },
    {
      contributor: { source_kind: 'git', actor: person },
      identity: '张三（@zhangsan）',
      label: '同步发起人：张三（@zhangsan）',
    },
    {
      contributor: { source_kind: 'git', actor: { kind: 'system', name: '系统任务' } },
      identity: '系统任务',
      label: '同步：系统任务',
    },
    {
      contributor: {
        source_kind: 'upload',
        actor: { kind: 'user', name: 'admin', username: 'admin' },
      },
      identity: 'admin',
      label: '上传人：admin',
    },
    {
      contributor: {
        source_kind: 'upload',
        actor: {
          kind: 'user',
          name: '这是一位显示名称较长的资源维护者',
          username: 'long-account-name-for-resource-maintenance',
        },
      },
      identity: '这是一位显示名称较长的资源维护者（@long-account-name-for-resource-maintenance）',
      label:
        '上传人：这是一位显示名称较长的资源维护者（@long-account-name-for-resource-maintenance）',
    },
  ];
  let contributor = cases[0].contributor;
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path.startsWith('/api/management/assets?'))
      return Response.json({
        ...assets,
        items: assets.items.map((asset) => ({
          ...asset,
          source_kind: contributor.source_kind,
          latest_contributor: contributor,
        })),
      });
    assert.equal(path, '/api/management/assets/' + intake.asset_id + '/versions');
    return Response.json(versions.map((version) => ({ ...version, contributor })));
  });
  const user = userEvent.setup();
  for (const entry of cases) {
    contributor = entry.contributor;
    const view = render(page(createElement(ManagementPanel)));
    const table = within(await screen.findByRole('table', { name: '维护资产' }));
    assert(table.getByRole('columnheader', { name: '最近上传 / 同步' }));
    assert.equal(table.getByText(entry.identity).getAttribute('title'), entry.label);
    await user.click(table.getByRole('button', { name: '版本与管理' }));
    const dialog = within(screen.getByRole('dialog', { name: '维护资产' }));
    assert(await dialog.findByText(entry.label));
    view.unmount();
  }
});

test('维护列表翻页与页大小请求服务端，搜索和状态筛选重置页码', async (context) => {
  const f = await createTestHub(context);
  for (let index = 1; index <= 6; index++) {
    const receipt = await f.hub.intakes.receive(
      f.admin,
      Buffer.from('invalid ZIP'),
      'skill.zip',
      {
        target: 'new',
        kind: 'skill',
        slug: `asset-${index}`,
        owner_group_id: f.teamId,
        version_label: '1.0.0',
      },
      randomUUID(),
    );
    if (index === 6)
      await f.hub.lifecycle.updateState(
        f.admin,
        receipt.asset_id,
        { lifecycle: 'blocked', reason: '待调查' },
        '"1"',
      );
  }
  const requests: URLSearchParams[] = [];
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    const url = new URL(path, 'http://hub.test');
    assert.equal(url.pathname, '/api/management/assets');
    requests.push(url.searchParams);
    return Response.json(
      await f.hub.assetManagement.list(
        f.admin,
        managementAssetListQuerySchema.parse(Object.fromEntries(url.searchParams)),
      ),
    );
  });
  const user = userEvent.setup();
  render(page(createElement(ManagementPanel)));
  await screen.findByRole('table', { name: '维护资产' });
  await user.click(screen.getByRole('button', { name: /资产维护每页条数/ }));
  await user.click(screen.getByRole('option', { name: '5 条 / 页' }));
  await screen.findByText(/第 1–5 条，共 6 条/);
  assert(!screen.queryByText('asset-6'));
  await user.click(screen.getByRole('button', { name: '资产维护下一页' }));
  await screen.findByText('asset-6');
  assert(!screen.queryByText('asset-1'));
  assert.equal(requests.at(-1)?.get('page'), '2');
  assert.equal(requests.at(-1)?.get('page_size'), '5');
  const search = screen.getByRole('searchbox', { name: '搜索维护资产' });
  await user.type(search, 'asset-1');
  await screen.findByText('asset-1');
  assert.equal(requests.at(-1)?.get('page'), '1');
  assert.equal(requests.at(-1)?.get('q'), 'asset-1');
  await user.click(screen.getByRole('button', { name: /维护资产状态/ }));
  await user.click(screen.getByRole('option', { name: '已封禁' }));
  await screen.findByText('没有匹配的资产');
  assert.equal(requests.at(-1)?.get('state'), 'blocked');
  await user.clear(search);
  await screen.findByText('asset-6');
  assert(!screen.queryByText('asset-1'));
  await screen.findByText(/第 1–1 条，共 1 条/);
});

test('错误资源删除提供前缀图标，二次确认可取消且保留原因，最终确认才发送请求', async (context) => {
  const f = await createTestHub(context);
  const receipt = await f.hub.intakes.receive(
    f.admin,
    Buffer.from('invalid ZIP'),
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'broken-skill',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  await f.worker.tick();
  const managed = await f.hub.assetManagement.list(f.admin);
  const submitted: unknown[] = [];
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path.startsWith('/api/management/assets?')) return Response.json(managed);
    if (path === '/api/management/assets/' + receipt.asset_id + '/versions')
      return Response.json([]);
    assert.equal(path, '/api/assets/' + receipt.asset_id);
    assert.equal(options.method, 'DELETE');
    assert.equal(new Headers(options.headers).get('If-Match'), '"1"');
    assert(new Headers(options.headers).get('Idempotency-Key'));
    submitted.push(JSON.parse(String(options.body)));
    return Response.json({ ok: true });
  });
  const user = userEvent.setup();
  render(page(createElement(ManagementPanel)));
  await user.click(await screen.findByRole('button', { name: '版本与管理' }));
  await user.click(screen.getByRole('tab', { name: '维护设置' }));
  await user.click(screen.getByRole('button', { name: /操作/ }));
  const option = screen.getByRole('option', { name: '删除资源' });
  assert(option.querySelector('svg[aria-hidden="true"]'));
  await user.click(option);
  assert(screen.getByText(/将永久删除「broken-skill」.*操作不可恢复/));
  assert.deepEqual(submitted, []);
  await user.click(screen.getByRole('button', { name: '删除资源' }));
  assert.deepEqual(submitted, []);
  await user.type(screen.getByRole('textbox', { name: '操作原因' }), '资源名称填写错误');
  await user.click(screen.getByRole('button', { name: '删除资源' }));
  const confirmation = await screen.findByRole('dialog', { name: '确认删除资源' });
  assert(within(confirmation).getByText('broken-skill'));
  assert(within(confirmation).getByText(/操作不可恢复/));
  assert(within(confirmation).getByText(/资源名称填写错误/));
  assert.deepEqual(submitted, []);
  await user.click(within(confirmation).getByRole('button', { name: '取消' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog', { name: '确认删除资源' }), null));
  assert.equal(
    screen.getByRole<HTMLTextAreaElement>('textbox', { name: '操作原因' }).value,
    '资源名称填写错误',
  );
  await user.click(screen.getByRole('button', { name: '删除资源' }));
  await screen.findByRole('dialog', { name: '确认删除资源' });
  await user.keyboard('{Escape}');
  await waitFor(() => assert.equal(screen.queryByRole('dialog', { name: '确认删除资源' }), null));
  assert.deepEqual(submitted, []);
  assert(screen.getByRole('dialog', { name: '维护资产' }));
  await user.click(screen.getByRole('button', { name: '删除资源' }));
  const finalConfirmation = await screen.findByRole('dialog', { name: '确认删除资源' });
  await user.click(within(finalConfirmation).getByRole('button', { name: '确认永久删除' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog', { name: '维护资产' }), null));
  assert.deepEqual(submitted, [{ reason: '资源名称填写错误' }]);
});

test('删除响应丢失后再次确认可恢复成功结果，且只保留一次删除审计', async (context) => {
  const f = await createTestHub(context);
  const receipt = await f.hub.intakes.receive(
    f.admin,
    Buffer.from('invalid ZIP'),
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'broken-skill',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  await f.worker.tick();
  let responseLost = false;
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path.startsWith('/api/management/assets?'))
      return Response.json(await f.hub.assetManagement.list(f.admin));
    if (path === '/api/management/assets/' + receipt.asset_id + '/versions')
      return Response.json([]);
    assert.equal(path, '/api/assets/' + receipt.asset_id);
    assert.equal(options.method, 'DELETE');
    const headers = new Headers(options.headers);
    const result = await f.hub.lifecycle.deleteAsset(
      f.admin,
      receipt.asset_id,
      JSON.parse(String(options.body)),
      headers.get('If-Match') ?? undefined,
      headers.get('Idempotency-Key') ?? undefined,
    );
    if (!responseLost) {
      responseLost = true;
      throw new TypeError('删除响应丢失');
    }
    return Response.json(result);
  });
  const user = userEvent.setup();
  render(page(createElement(ManagementPanel)));
  await user.click(await screen.findByRole('button', { name: '版本与管理' }));
  await user.click(screen.getByRole('tab', { name: '维护设置' }));
  await user.click(screen.getByRole('button', { name: /操作/ }));
  await user.click(screen.getByRole('option', { name: '删除资源' }));
  await user.type(screen.getByRole('textbox', { name: '操作原因' }), '资源名称填写错误');
  await user.click(screen.getByRole('button', { name: '删除资源' }));
  const confirmation = await screen.findByRole('dialog', { name: '确认删除资源' });
  await user.click(within(confirmation).getByRole('button', { name: '确认永久删除' }));
  assert(await within(confirmation).findByText('删除响应丢失'));
  assert.equal(await f.store.get('assets', receipt.asset_id), undefined);
  await user.click(within(confirmation).getByRole('button', { name: '确认永久删除' }));
  await waitFor(() => assert(!screen.queryByRole('dialog', { name: '维护资产' })));
  assert.equal((await f.store.where('audit', 'action', 'asset.deleted')).length, 1);
});

test('版本删除显示范围并要求原因和二次确认，取消不删除，确认后保留资源和其他版本', async (context) => {
  const f = await createTestHub(context);
  const published = await publishSkill(f);
  const draft = await receiveSkill(f, { assetId: published.intake.asset_id, version: '1.0.1' });
  const pending = await receiveSkill(f, { assetId: published.intake.asset_id, version: '1.0.2' });
  await submitPublication(f, pending);
  const submitted: string[] = [];
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path.startsWith('/api/management/assets?'))
      return Response.json(await f.hub.assetManagement.list(f.admin));
    if (path === '/api/management/assets/' + draft.asset_id + '/versions')
      return Response.json(await f.hub.assetManagement.versions(f.admin, draft.asset_id));
    assert.equal(path, '/api/versions/' + draft.version_id);
    assert.equal(options.method, 'DELETE');
    const headers = new Headers(options.headers);
    assert(headers.get('Idempotency-Key'));
    submitted.push(path);
    return Response.json(
      await f.hub.lifecycle.deleteVersion(
        f.admin,
        draft.version_id,
        JSON.parse(String(options.body)),
        headers.get('If-Match') ?? undefined,
        headers.get('Idempotency-Key') ?? undefined,
      ),
    );
  });
  const user = userEvent.setup();
  render(page(createElement(ManagementPanel)));
  await user.click(await screen.findByRole('button', { name: '版本与管理' }));
  const remove = await screen.findByRole('button', { name: '删除版本 1.0.1' });
  assert(screen.getByRole<HTMLButtonElement>('button', { name: '删除版本 1.0.0' }).disabled);
  assert(screen.getByRole<HTMLButtonElement>('button', { name: '删除版本 1.0.2' }).disabled);
  assert(screen.getByText('该版本曾正式发布，只允许撤销'));
  assert(screen.getByText('请先撤回待审核申请'));
  await user.click(remove);
  const confirmation = await screen.findByRole('dialog', { name: '确认删除版本' });
  assert(within(confirmation).getByText('1.0.1'));
  assert(within(confirmation).getByText('资源和其他版本会保留，审计记录会保留。'));
  assert(within(confirmation).getByText(/反馈记录会保留.*修复版本关联将解除/));
  assert(
    within(confirmation).getByRole<HTMLButtonElement>('button', { name: '确认永久删除' }).disabled,
  );
  await user.type(within(confirmation).getByRole('textbox', { name: '删除原因' }), '放弃这个草稿');
  await user.click(within(confirmation).getByRole('button', { name: '取消' }));
  await waitFor(() => assert(!screen.queryByRole('dialog', { name: '确认删除版本' })));
  assert.deepEqual(submitted, []);
  assert(await f.store.get('versions', draft.version_id));
  await user.click(remove);
  const confirmed = await screen.findByRole('dialog', { name: '确认删除版本' });
  await user.type(within(confirmed).getByRole('textbox', { name: '删除原因' }), '放弃这个草稿');
  await user.click(within(confirmed).getByRole('button', { name: '确认永久删除' }));
  await waitFor(() => assert(!screen.queryByRole('dialog', { name: '维护资产' })));
  assert.deepEqual(submitted, ['/api/versions/' + draft.version_id]);
  assert.equal(await f.store.get('versions', draft.version_id), undefined);
  assert(await f.store.get('assets', draft.asset_id));
  assert(await f.store.get('versions', published.intake.version_id));
  assert(await f.store.get('versions', pending.version_id));
});

test('目录只将维护组受众简写为团队可见，同名个人保留实际可见范围', async (context) => {
  const fixture = await createTestHub(context);
  const team = await fixture.store.get('groups', fixture.teamId);
  assert(team);
  const member = await fixture.hub.administration.createUser(fixture.admin, {
    username: 'namesake',
    display_name: team.name,
    password: testPassword,
    group_ids: [team.id],
  });
  for (const [slug, audience] of [
    ['team-skill', `group:${team.id}`],
    ['member-skill', `principal:${member.id}`],
  ] as const) {
    await publishSkill(fixture, {
      slug,
      distribution: { mode: 'approved_audience', audience: [audience] },
    });
  }
  const memberPrincipal = await fixture.hub.identity.principal(member.id);
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/scenarios') return Response.json([]);
    if (path.startsWith('/api/assets/keywords?')) return Response.json({ items: [] });
    assert(path.startsWith('/api/assets?'));
    return Response.json(await fixture.hub.catalog.search(memberPrincipal, {}));
  });
  render(page(createElement(DiscoverPage)));
  const teamCard = await screen.findByRole('link', { name: /team-skill/ });
  const memberCard = screen.getByRole('link', { name: /member-skill/ });
  assert(within(teamCard).getByText('团队可见'));
  assert(
    within(memberCard)
      .getByTitle('可见范围：' + team.name)
      .textContent?.includes(team.name),
  );
  assert.equal(within(memberCard).queryByText('团队可见'), null);
});

test('通用提名按输入状态显示一条提示，扣除首尾空白后满十字才能提交', async (context) => {
  const fixture = await createTestHub(context);
  const { intake } = await publishSkill(fixture);
  const asset = await fixture.hub.catalog.getDetail(fixture.reader, intake.asset_id);
  const submitted: unknown[] = [];
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    assert.equal(path, '/api/nominations');
    submitted.push(JSON.parse(String(options.body)));
    return Response.json({ id: 'nomination' });
  });
  const user = userEvent.setup();
  render(page(createElement(AssetCommunity, { asset })));
  await user.click(screen.getByRole('button', { name: '提名为通用' }));
  assert(within(screen.getByText('本次提名版本：')).getByText(asset.current_release.version_label));
  const reason = screen.getByRole('textbox', {
    name: '为什么值得成为通用能力？',
    description: /\b10\D+2000\b/,
  });
  const submit = screen.getByRole<HTMLButtonElement>('button', { name: '提交通用提名' });
  assert(submit.disabled);
  await user.type(reason, '   通用技能   ');
  assert(screen.getByRole('textbox', { description: /^\D*6\D*$/ }));
  assert(submit.disabled);
  await user.clear(reason);
  await user.type(reason, '跨团队复用提交信息');
  assert(screen.getByRole('textbox', { description: /^\D*1\D*$/ }));
  assert(submit.disabled);
  await user.type(reason, '。');
  assert(
    screen.getByRole('textbox', {
      description: (hint) => !/\d/.test(hint) && /已填好|达标|可(?:以)?提交|完成/.test(hint),
    }),
  );
  assert.equal(submit.disabled, false);
  await user.click(submit);
  assert(await screen.findByText('通用提名审核中'));
  assert.deepEqual(submitted, [
    {
      release_id: asset.current_release.release_id,
      reason: '跨团队复用提交信息。',
    },
  ]);
});

test('卡片点阵按阅读顺序错开点亮格的显现，切回静态时清除延迟', () => {
  const seed = 'sha256:' + 'a'.repeat(64);
  const view = render(
    createElement(Glyph, { kind: 'skill', seed, pixelRevealClassName: assetCardPixelRevealStyles }),
  );
  const pixels = screen.getByRole('img').querySelectorAll('rect');
  let previousDelay = -1;
  cells(seed).forEach((lit, index) => {
    const delay = pixels[index].style.animationDelay;
    if (lit) {
      const currentDelay = Number.parseFloat(delay);
      assert(currentDelay > previousDelay);
      previousDelay = currentDelay;
    } else {
      assert.equal(delay, '');
    }
  });
  view.rerender(createElement(Glyph, { kind: 'skill', seed }));
  assert(
    [...screen.getByRole('img').querySelectorAll('rect')].every(
      (pixel) => !pixel.style.animationDelay,
    ),
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
  await user.click(screen.getByRole('tab', { name: '02 发布申请' }));
  await user.type(screen.getByRole('textbox', { name: '共享目的与授权确认' }), '核对新版本并共享');
  await user.click(screen.getByRole('button', { name: '确认内容并提交审核' }));
  assert.equal(
    (await screen.findByRole('link', { name: '查看审核' })).getAttribute('href'),
    '/review?request=new-review-id',
  );
  assert.equal(submitted?.base_release_id, next.current_release_id);
});

test('采纳结果仅填同版本草稿，保留先前输入，显式替换后按现有人工提交路径发布', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  const fields = {
    category: 'general' as const,
    scenario_ids: [],
    keywords: ['Git', '提交规范'],
    purpose: '供研发团队统一提交信息。',
  };
  const suggestion = {
    notices: [
      { title: '请核对入口权限', explanation: '入口文件引用了脚本', evidence: ['SKILL.md:2–4'] },
    ],
    executionId: 'task',
    versionId: intake.version_id,
    digest: intake.content_digest!,
    fields,
  };
  let submitted: Record<string, unknown> | undefined;
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path === '/api/scenarios') return Response.json([]);
    assert.equal(path, '/api/publication-requests');
    submitted = JSON.parse(String(options.body)) as Record<string, unknown>;
    return Response.json({ id: 'request' });
  });
  const view = render(
    page(
      createElement(IntakeDetail, { intake, suggestion: { ...suggestion, versionId: 'other' } }),
    ),
  );
  assert.equal(screen.queryByLabelText('分类的 AI 建议'), null);
  const user = userEvent.setup();
  const purpose = screen.getByRole('textbox', {
    name: '共享目的与授权确认',
  }) as HTMLTextAreaElement;
  await user.type(purpose, '自己的用途');
  view.rerender(
    page(createElement(IntakeDetail, { intake, suggestion: { ...suggestion, pending: true } })),
  );
  assert(within(screen.getByLabelText('关键词的 AI 建议')).getByText('Git · 提交规范'));
  assert.equal(screen.queryByRole('button', { name: '移除关键词 Git' }), null);
  assert.equal(screen.queryByRole('button', { name: '使用共享目的建议' }), null);
  await user.click(screen.getByRole('tab', { name: '01 校验与证据' }));
  view.rerender(
    page(
      createElement(IntakeDetail, {
        intake,
        suggestion,
        origin: { executionId: 'task', x: 10, y: 10 },
      }),
    ),
  );
  await screen.findByText('共享目的 · 保留手动填写');
  assert(screen.getByText('关键词 · 已填入'));
  await screen.findByRole('button', { name: '移除关键词 Git' });
  assert.equal(purpose.value, '自己的用途');
  await user.click(screen.getByRole('button', { name: '使用共享目的建议' }));
  assert.equal(purpose.value, fields.purpose);
  await user.click(screen.getByRole('button', { name: /项待核对/ }));
  await user.click(screen.getByRole('button', { name: /请核对入口权限/ }));
  assert.match(document.activeElement?.textContent ?? '', /SKILL.md:2–4/);
  await user.click(screen.getByRole('button', { name: '填写发布申请' }));
  assert.equal(submitted, undefined);
  await user.click(screen.getByRole('button', { name: '确认内容并提交审核' }));
  await screen.findByRole('link', { name: '查看审核' });
  assert.deepEqual(submitted, {
    source_intake_id: intake.id,
    version_id: intake.version_id,
    ...intake.proposed_policy,
    category: 'general',
    applies_to: { ...intake.proposed_applies_to, keywords: fields.keywords },
    requires_api_key: intake.proposed_requires_api_key,
    purpose: fields.purpose,
    base_release_id: intake.current_release_id,
  });
});

test('维护者可将 AI 新场景改为已有条目，再补充自己的定义后提交', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  const existing = {
    id: '00000000-0000-4000-8000-000000000001',
    name: '代码评审',
    description: '审查合并请求',
    active: true,
  };
  const fields = {
    category: 'scenario' as const,
    scenario_ids: [],
    proposed_scenarios: [{ name: '合并请求审查', description: '审查待合并的改动。' }],
    keywords: ['GitLab'],
    purpose: '团队共享评审流程',
  };
  let submitted: Record<string, unknown> | undefined;
  t.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path === '/api/scenarios') return Response.json([existing]);
    assert.equal(path, '/api/publication-requests');
    submitted = JSON.parse(String(options.body)) as Record<string, unknown>;
    return Response.json({ id: 'request' });
  });
  const user = userEvent.setup();
  render(
    page(
      createElement(IntakeDetail, {
        intake,
        suggestion: {
          fields,
          versionId: intake.version_id,
          digest: intake.content_digest!,
          executionId: 'audit',
        },
      }),
    ),
  );
  const draft = await screen.findByRole('textbox', { name: '新场景名称' });
  assert.equal((draft as HTMLInputElement).value, '合并请求审查');
  await user.clear(draft);
  await user.type(draft, existing.name);
  await user.click(await screen.findByRole('button', { name: '使用已有场景「代码评审」' }));
  assert.equal(
    (screen.getByRole('checkbox', { name: existing.name }) as HTMLInputElement).checked,
    true,
  );
  await user.click(screen.getByRole('button', { name: '添加新场景' }));
  await user.type(screen.getByRole('textbox', { name: '新场景名称' }), '数据库迁移演练');
  await user.type(screen.getByRole('textbox', { name: '适用说明' }), '验证回退步骤。');
  await user.click(screen.getByRole('button', { name: '确认内容并提交审核' }));
  await screen.findByRole('link', { name: '查看审核' });
  assert.deepEqual(submitted?.scenario_ids, [existing.id]);
  assert.deepEqual(submitted?.proposed_scenarios, [
    { name: '数据库迁移演练', description: '验证回退步骤。' },
  ]);
});

test('简报可定位到第 800 行以后的候选证据，基线文件不可读时仍可核对', async (context) => {
  const f = await createTestHub(context);
  const first = await publishSkill(f);
  const next = await receiveSkill(f, { assetId: first.intake.asset_id, version: '1.0.1' });
  const request = await submitPublication(f, next);
  const review = await f.hub.publicationQueries.getReview(f.reviewer, request.id);
  const lines = Array.from({ length: 1000 }, (_, i) => '候选证据行 ' + (i + 1)).join('\n');
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path.includes(first.intake.version_id)) return new Response(null, { status: 403 });
    return new Response(lines);
  });
  render(
    page(
      createElement(FileWorkbench, {
        request: review,
        focus: { path: 'SKILL.md', start: 903, end: 905 },
      }),
    ),
  );
  await screen.findByText('候选证据行 903');
  await waitFor(() => assert(document.activeElement?.textContent?.includes('候选证据行 903')));
  assert(screen.getByText('候选证据行 905'));
});
