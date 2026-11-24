import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState, type ReactNode } from 'react';
import { cleanup, render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { EvaluationResponse } from '@capability-hub/contracts';
import type {
  AssetResponse,
  AssetVersionResponse,
  ClientConfigurationResponse,
  MeResponse,
} from '@capability-hub/contracts/http';
import { deferred } from '../support/store.js';
import { useAppRoute } from '../../apps/web/src/app/use-app-route.js';
import AssetSheet from '../../apps/web/src/features/catalog/AssetSheet.js';
import type { AssetDetail, AssetRelease } from '../../apps/web/src/features/catalog/asset-view.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';
import {
  appRoute,
  closeAsset,
  navigate,
} from '../../apps/web/src/shared/navigation/history-navigation.js';
import {
  assetHref,
  loginHref,
  loginReturnPath,
  parseHistoryRoute,
  type AssetDrawer,
} from '../../apps/web/src/shared/navigation/history-route.js';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/discover');
});

function Background({ href }: { href: string }) {
  const [filter, setFilter] = useState('');
  return createElement(
    'div',
    null,
    createElement('input', {
      'aria-label': '资产筛选',
      value: filter,
      onChange: (event) => setFilter(event.currentTarget.value),
    }),
    createElement('a', { href }, '查看详情'),
  );
}

function NavigationFixture({ href = '/asset/example?tab=feedback' }: { href?: string }) {
  const route = useAppRoute();
  return createElement(
    'main',
    null,
    createElement('output', null, route.page + '?' + route.query),
    createElement('output', { 'aria-label': '抽屉参数' }, JSON.stringify(route.drawer ?? null)),
    createElement(Background, { key: route.page, href }),
    route.asset && createElement('button', { onClick: closeAsset }, '关闭详情'),
  );
}

function drawerShown(): AssetDrawer | null {
  return JSON.parse(screen.getByLabelText('抽屉参数').textContent ?? 'null') as AssetDrawer | null;
}

test('维护页打开详情保留页面与筛选，历史导航恢复正确入口', async () => {
  window.history.replaceState(null, '', '/publish?tab=manage');
  render(createElement(NavigationFixture));
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), 'example');
  fireEvent.click(screen.getByRole('link', { name: '查看详情' }));
  assert.equal(window.location.pathname, '/asset/example');
  assert(screen.getByText('publish?tab=manage'));
  assert.equal((screen.getByRole('textbox') as HTMLInputElement).value, 'example');
  const detailState: unknown = window.history.state;
  act(() => {
    window.history.replaceState(null, '', '/publish?tab=manage');
    window.dispatchEvent(new Event('popstate'));
  });
  assert.equal(screen.queryByRole('button', { name: '关闭详情' }), null);
  assert.equal((screen.getByRole('textbox') as HTMLInputElement).value, 'example');
  act(() => {
    window.history.replaceState(detailState, '', '/asset/example?tab=feedback');
    window.dispatchEvent(new Event('popstate'));
  });
  assert(screen.getByRole('button', { name: '关闭详情' }));
  assert(screen.getByText('publish?tab=manage'));
});

test('直接详情链接与不可信来源状态均使用发现页，关闭不离开站点', async () => {
  assert.equal(
    appRoute('/asset/example', '', { asset_background: '//external.test' }).page,
    'discover',
  );
  assert.equal(
    appRoute('/asset/example', '', { asset_background: '/api/assets' }).page,
    'discover',
  );
  assert.equal(
    appRoute('/asset/example', '', { asset_background: '/asset/other' }).page,
    'discover',
  );
  window.history.replaceState(null, '', '/asset/example');
  render(createElement(NavigationFixture));
  fireEvent.click(screen.getByRole('button', { name: '关闭详情' }));
  assert.equal(window.location.pathname, '/discover');
});

const oldVersion = '11111111-1111-4111-8111-111111111111';
const newVersion = '22222222-2222-4222-8222-222222222222';
const fixedHref = `/asset/example?version_id=${oldVersion}&tab=installation`;
const noEvaluation: EvaluationResponse = {
  current_rubric_version: '2026-11-24.3',
  updating: false,
  comparison_status: 'none',
  can_view_details: false,
  can_request: false,
  evaluation: null,
  baseline: null,
};

test('替换登录页返回固定版本，关闭抽屉不会回到同一资源', () => {
  history.replaceState(null, '', fixedHref);
  render(createElement(NavigationFixture));
  act(() => navigate(loginHref(fixedHref)));
  act(() => navigate(loginReturnPath(location.search), { replace: true }));
  assert.equal(location.pathname + location.search, fixedHref);
  assert.deepEqual(drawerShown(), { slug: 'example', versionId: oldVersion, tab: 'installation' });
  fireEvent.click(screen.getByRole('button', { name: '关闭详情' }));
  assert.equal(location.pathname, '/discover');
  assert.equal(drawerShown(), null);
});

test('资源链接按固定顺序拼接版本与页签，抽屉参数只取当前地址', () => {
  assert.equal(assetHref('example'), '/asset/example');
  assert.equal(assetHref('a b'), '/asset/a%20b');
  assert.equal(assetHref('example', { tab: 'installation', versionId: oldVersion }), fixedHref);
  assert.equal(assetHref('example', { tab: 'feedback' }), '/asset/example?tab=feedback');
  assert.deepEqual(
    appRoute('/asset/example', '', {
      asset_background: `/discover?version_id=${newVersion}&tab=feedback`,
    }).drawer,
    { slug: 'example' },
  );
  assert.deepEqual(parseHistoryRoute('/asset/example', '?feedback=f1').drawer, {
    slug: 'example',
    feedbackId: 'f1',
    tab: 'feedback',
  });
  assert.equal(parseHistoryRoute('/asset/example', '?version_id=1').drawer?.invalid, 'version');
  assert.equal(
    parseHistoryRoute('/asset/example', `?version_id=${oldVersion}&version_id=${newVersion}`).drawer
      ?.invalid,
    'version',
  );
  assert.equal(parseHistoryRoute('/asset/example', '?tab=files').drawer?.invalid, 'tab');
});

test('后台页面打开固定版本，点击、前进后退、直接打开与刷新得到同一抽屉参数', () => {
  const expected = { slug: 'example', versionId: oldVersion, tab: 'installation' };
  window.history.replaceState(null, '', '/publish?tab=manage');
  const view = render(createElement(NavigationFixture, { href: fixedHref }));
  fireEvent.click(screen.getByRole('link', { name: '查看详情' }));
  assert.equal(window.location.pathname + window.location.search, fixedHref);
  assert(screen.getByText('publish?tab=manage'));
  assert.deepEqual(drawerShown(), expected);
  const detailState: unknown = window.history.state;
  act(() => {
    window.history.replaceState(null, '', '/publish?tab=manage');
    window.dispatchEvent(new Event('popstate'));
  });
  assert.equal(drawerShown(), null);
  act(() => {
    window.history.replaceState(detailState, '', fixedHref);
    window.dispatchEvent(new Event('popstate'));
  });
  assert(screen.getByText('publish?tab=manage'));
  assert.deepEqual(drawerShown(), expected);
  view.unmount();

  window.history.replaceState(detailState, '', fixedHref);
  const refreshed = render(createElement(NavigationFixture));
  assert(screen.getByText('publish?tab=manage'));
  assert.deepEqual(drawerShown(), expected);
  refreshed.unmount();

  window.history.replaceState(null, '', fixedHref);
  render(createElement(NavigationFixture));
  assert(screen.getByText(/^discover\?/));
  assert.deepEqual(drawerShown(), expected);
});

const me: MeResponse = {
  id: 'user',
  username: 'owner',
  auth_provider: 'local',
  display_name: '维护者',
  csrf_token: '',
  groups: [],
  capabilities: {
    can_ai: false,
    can_ai_console: false,
    can_admin: false,
    can_audit: false,
    can_manage_feedback: false,
    can_publish: true,
    can_review: false,
  },
  features: { git_hosts: [] },
};

function page(child: ReactNode, user: MeResponse | null = me) {
  return createElement(
    HubCtx.Provider,
    {
      value: {
        me: user,
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

function release(versionId: string, label: string): AssetRelease {
  return {
    visibility_label: '公开',
    release_id: versionId.replace(/^.{8}/, 'aaaaaaaa'),
    version_id: versionId,
    version_label: label,
    category: 'general',
    scenario_ids: [],
    scenarios: [],
    distribution: { mode: 'approved_audience', audience: ['public'] },
    published_at: '2026-11-01T00:00:00.000Z',
    has_scripts: false,
  };
}

function detail(kind: 'skill' | 'mcp'): AssetDetail {
  return {
    asset_id: '33333333-3333-4333-8333-333333333333',
    slug: 'example',
    kind,
    requires_api_key: false,
    lifecycle: 'active',
    description: '示例资源',
    owner: { id: 'team', name: '工程团队' },
    source: { kind: 'upload' },
    applies_to: {},
    content_digest: 'a'.repeat(64),
    artifact_digest: 'b'.repeat(64),
    files:
      kind === 'skill'
        ? [{ path: 'SKILL.md', size: 10, sha256: 'c'.repeat(64), executable: false }]
        : [{ path: 'server.json', size: 10, sha256: 'c'.repeat(64), executable: false }],
    installation_options:
      kind === 'mcp'
        ? [
            {
              option_id: 'remote-0',
              kind: 'remote',
              supported: true,
              type: 'streamable-http',
              url: 'https://mcp.example.test/mcp',
              has_shared_key: false,
            },
          ]
        : [],
    metadata: {},
    permissions: { can_download: true, can_submit: true, can_lifecycle: true, can_revoke: true },
    community: { recommendation_count: 0, recommended: false, nomination: null },
    revision: 1,
    deprecation_reason: '',
    replacement_asset_slug: null,
  };
}

/** 公开受众的历史发布若服务端判定不再匿名可读，就不能给公开对话安装入口。 */
function fixedVersion(kind: 'skill' | 'mcp'): AssetVersionResponse {
  return {
    ...detail(kind),
    release: release(oldVersion, 'v1.0.0'),
    latest_release: {
      version_id: newVersion,
      version_label: 'v2.0.0',
      published_at: '2026-11-10T00:00:00.000Z',
    },
    is_latest: false,
    current_readable: false,
    public_readable: false,
  };
}

function sheet(drawer: AssetDrawer) {
  return createElement(AssetSheet, {
    slug: drawer.slug,
    versionId: drawer.versionId,
    tab: drawer.tab,
    invalid: drawer.invalid,
  });
}

test('非法版本参数和不可读固定版本只提示不可用，不改读当前发布', async (context) => {
  const requested: string[] = [];
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    requested.push(path);
    if (path === `/api/assets/example/versions/${oldVersion}`)
      return Response.json(
        { error: { code: 'NOT_FOUND', message: '资源不存在' } },
        { status: 404 },
      );
    assert.fail('Unexpected fetch: ' + path);
  });
  const malformed = parseHistoryRoute('/asset/example', '?version_id=latest&tab=installation');
  assert(malformed.drawer);
  const first = render(page(sheet(malformed.drawer)));
  assert(await screen.findByText('此版本已不可用或你无权查看'));
  assert.deepEqual(requested, []);
  first.unmount();

  window.history.replaceState(null, '', fixedHref);
  const opened = parseHistoryRoute(window.location.pathname, window.location.search);
  assert(opened.drawer);
  render(page(sheet(opened.drawer), null));
  assert(await screen.findByText('此版本已不可用或你无权查看'));
  assert.equal(
    screen.getByRole('link', { name: '登录后重试' }).getAttribute('href'),
    '/login?return_to=' + encodeURIComponent(fixedHref),
  );
  assert.deepEqual(requested, [`/api/assets/example/versions/${oldVersion}`]);
});

test('固定版的服务错误保留实际原因和重试，不误报为访问受限', async (context) => {
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, `/api/assets/example/versions/${oldVersion}`);
    return Response.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: '目录服务暂时不可用' } },
      { status: 503 },
    );
  });
  render(page(sheet({ slug: 'example', versionId: oldVersion }), null));
  assert(await screen.findByText('目录服务暂时不可用'));
  assert(screen.getByRole('button', { name: '重新加载' }));
  assert.equal(screen.queryByText('此版本已不可用或你无权查看'), null);
  assert.equal(screen.queryByRole('link', { name: '登录后重试' }), null);
});

test('匿名打开旧版评测深链接时等待该版结果，紧凑入口返回同一版评测', async (context) => {
  const proceed = deferred();
  let unavailable = true;
  const asset = { ...fixedVersion('skill'), public_readable: true };
  const unexpected: string[] = [];
  const evaluation: EvaluationResponse = {
    ...noEvaluation,
    evaluation: {
      id: 'old-result',
      version_id: oldVersion,
      version_label: asset.release.version_label,
      rubric_version: noEvaluation.current_rubric_version,
      scan_ruleset: '2026-11-12.1',
      comparable_key: 'sha256:' + 'd'.repeat(64),
      state: 'succeeded',
      evaluated_at: '2026-11-12T00:00:00.000Z',
      limitations: ['static_only'],
      dimensions: [
        {
          id: 'structure',
          label: '结构规范',
          status: 'scored',
          score: 81,
          band: 'good',
          confidence: 'high',
          checks: [],
        },
      ],
    },
  };
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === `/api/assets/example/versions/${oldVersion}`) return Response.json(asset);
    if (path === `/api/versions/${oldVersion}/files?path=SKILL.md`)
      return new Response('# 固定版本使用说明');
    if (path === '/api/assets/example/versions?latest_readable=1') return Response.json([]);
    if (path === `/api/assets/${asset.asset_id}/versions/${oldVersion}/evaluation`) {
      await proceed.promise;
      if (unavailable)
        return Response.json(
          { error: { code: 'BUSY', message: '评测暂时不可用' } },
          { status: 503 },
        );
      return Response.json(evaluation);
    }
    unexpected.push(path);
    return new Response(null, { status: 404 });
  });
  const route = parseHistoryRoute('/asset/example', `?version_id=${oldVersion}&tab=evaluation`);
  assert(route.drawer);
  function assertFixedScore() {
    const list = within(screen.getByRole('list', { name: '评测维度' }));
    const row = list.getByText('结构规范').closest('li');
    assert(row);
    assert(within(row).getByText('81'));
    assert(!within(row).queryByRole('button'));
  }
  render(page(sheet(route.drawer), null));
  await screen.findByText(/正在加载质量评测/);
  assert(!screen.queryByRole('tabpanel', { name: '内容说明' }));
  assert(screen.getByRole('tab', { name: '内容说明' }));
  assert(screen.getByRole('link', { name: '下载固定版本' }));
  await act(async () => proceed.resolve());
  const panel = await screen.findByRole('tabpanel', { name: '质量评测' });
  assert(await within(panel).findByText('评测暂时不可用'));
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: '内容说明' }));
  assert(await screen.findByRole('heading', { name: '固定版本使用说明' }));
  await user.click(screen.getByRole('button', { name: '返回上一步' }));
  unavailable = false;
  await user.click(screen.getByRole('button', { name: '重新加载' }));
  await screen.findByText(/扫描规则 2026-11-12\.1/);
  await screen.findByRole('tab', { name: '质量评测', selected: true });
  assertFixedScore();
  await user.click(screen.getByRole('tab', { name: '内容说明' }));
  await screen.findByRole('heading', { name: '固定版本使用说明' });
  await user.click(screen.getByRole('button', { name: '质量评测' }));
  assert(screen.getByRole('tab', { name: '质量评测', selected: true }));
  assertFixedScore();
  assert.deepEqual(unexpected, []);
});

test('首轮评测进行中且手动额度已用完，资源详情仍保留评测入口和进度', async (t) => {
  const asset = fixedVersion('skill');
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === `/api/assets/example/versions/${oldVersion}`) return Response.json(asset);
    if (path === `/api/versions/${oldVersion}/files?path=SKILL.md`) return new Response('# 说明');
    if (path === '/api/assets/example/versions?latest_readable=1') return Response.json([]);
    if (path === `/api/assets/${asset.asset_id}/versions/${oldVersion}/evaluation`)
      return Response.json({
        ...noEvaluation,
        can_view_details: true,
        updating: true,
        latest_attempt_id: 'first',
      });
    if (path === `/api/management/versions/${oldVersion}/evaluations`)
      return Response.json({
        items: [],
        current_rubric_version: noEvaluation.current_rubric_version,
        model_enabled: true,
        can_request: false,
        next_window_at: null,
      });
    assert.fail('Unexpected fetch: ' + path);
  });
  render(page(sheet({ slug: 'example', versionId: oldVersion, tab: 'evaluation' })));
  assert(await screen.findByText('正在更新'));
  assert(screen.getByRole('tab', { name: '质量评测', selected: true }));
  assert(screen.getByRole('button', { name: '质量评测' }));
  assert(!screen.queryByText('尚未评测'));
  assert(!screen.queryByRole('button', { name: '评测此版本' }));
});

test('文件阅读历史在前进和后退时恢复每个 Markdown 位置的阅读方式', async (t) => {
  const asset = fixedVersion('skill');
  asset.files.push({ ...asset.files[0], path: 'guide.md' });
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === `/api/assets/example/versions/${oldVersion}`) return Response.json(asset);
    if (path === `/api/versions/${oldVersion}/files?path=SKILL.md`) return new Response('# 主文档');
    if (path === `/api/versions/${oldVersion}/files?path=guide.md`)
      return new Response('# 使用指南');
    if (path === '/api/assets/example/versions?latest_readable=1') return Response.json([]);
    if (path === `/api/assets/${asset.asset_id}/versions/${oldVersion}/evaluation`)
      return Response.json(noEvaluation);
    assert.fail('Unexpected fetch: ' + path);
  });
  const user = userEvent.setup();
  render(page(sheet({ slug: 'example', versionId: oldVersion })));
  await user.click(await screen.findByRole('tab', { name: /文件清单/ }));
  assert(await screen.findByRole('heading', { name: '主文档' }));
  await user.click(screen.getByRole('button', { name: '预览文件 guide.md' }));
  await user.click(screen.getByRole('button', { name: '源码' }));
  await user.click(screen.getByRole('button', { name: '返回上一步' }));
  assert(await screen.findByRole('heading', { name: '主文档' }));
  await user.click(screen.getByRole('button', { name: '前进一步' }));
  assert.equal(screen.getByRole('button', { name: '源码' }).getAttribute('aria-pressed'), 'true');
});

test('较旧的固定版本保留自身标签、文件与安装命令，并提供最新版本入口', async (context) => {
  const requested: string[] = [];
  const asset = fixedVersion('skill');
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    requested.push(path);
    if (path === `/api/assets/example/versions/${oldVersion}`) return Response.json(asset);
    if (path === `/api/assets/${asset.asset_id}/versions/${oldVersion}/evaluation`)
      return Response.json(noEvaluation);
    if (path === `/api/versions/${oldVersion}/files?path=SKILL.md`)
      return new Response('---\nname: example\n---\n旧版说明');
    if (path === `/api/assets/${asset.asset_id}/feedback?page=1&limit=10`)
      return Response.json({ items: [], total: 0, page: 1, limit: 10 });
    if (
      path === '/api/assets/example/versions?latest_readable=1' ||
      path === `/api/assets/${asset.asset_id}/versions?latest_readable=1`
    )
      return Response.json([
        {
          version_id: newVersion,
          version_label: 'v2.0.0',
          content_digest: 'd'.repeat(64),
          created_at: '2026-11-10T00:00:00.000Z',
        },
        {
          version_id: oldVersion,
          version_label: 'v1.0.0',
          content_digest: 'a'.repeat(64),
          created_at: '2026-11-01T00:00:00.000Z',
        },
      ]);
    assert.fail('Unexpected fetch: ' + path);
  });
  const user = userEvent.setup();
  render(page(sheet({ slug: 'example', versionId: oldVersion })));

  assert(await screen.findByText('旧版说明'));
  assert.equal(
    screen.getByRole('heading', { name: 'example', level: 2 }).nextElementSibling?.textContent,
    '固定版本 v1.0.0',
  );
  assert.equal(
    screen.getByRole('link', { name: '查看最新可读版本' }).getAttribute('href'),
    `/asset/example?version_id=${newVersion}`,
  );
  assert.equal(
    screen.getByRole('link', { name: '下载固定版本' }).getAttribute('href'),
    `/api/versions/${oldVersion}/archive`,
  );
  assert.equal(screen.queryByText('资产维护与分发控制'), null);
  assert.equal(screen.queryByRole('region', { name: '资源推荐与通用提名' }), null);
  assert(!screen.queryByRole('tab', { name: '质量评测' }));
  assert(!screen.queryByRole('button', { name: '质量评测' }));

  await user.click(screen.getByRole('tab', { name: '使用与安装' }));
  assert.equal(screen.queryByRole('region', { name: '公开资源对话安装' }), null);
  const installation = screen.getByRole('region', { name: '受限 Skill 安装' });
  assert.match(installation.textContent ?? '', /--version 'v1\.0\.0'/);
  assert.match(installation.textContent ?? '', /example@v1\.0\.0/);
  assert(!installation.textContent?.includes('example@v2.0.0'));
  assert(!installation.textContent?.includes(oldVersion));

  await user.click(screen.getByRole('tab', { name: '版本历史' }));
  const rowText = (label: string) =>
    screen.getByText(label, { selector: 'strong span' }).closest('div')?.parentElement
      ?.textContent ?? '';
  await screen.findByText('v1.0.0', { selector: 'strong span' });
  assert.match(rowText('v1.0.0'), /正在查看/);
  assert.doesNotMatch(rowText('v1.0.0'), /当前版本/);
  assert.match(rowText('v2.0.0'), /最新可读版本/);

  await user.click(screen.getByRole('tab', { name: '问题与建议' }));
  await user.click(await screen.findByRole('button', { name: '提交问题或建议' }));
  await user.click(screen.getByRole('button', { name: /反馈版本/ }));
  const selected = await screen.findByRole('option', { name: 'v1.0.0' });
  assert.equal(selected.getAttribute('aria-selected'), 'true');
  assert(screen.getByRole('option', { name: 'v2.0.0' }));
  assert(!requested.includes('/api/assets/example'));
});

test('MCP 固定页只在当前发布可读时提供 CLI，撤回后仍可按所选 UUID 获取配置', async (context) => {
  const requested: string[] = [];
  const asset = { ...fixedVersion('mcp'), current_readable: true };
  const configuration: ClientConfigurationResponse = {
    version_id: oldVersion,
    installation_option_id: 'remote-0',
    client: 'codex',
    scope: 'project',
    config: {},
    text: '[mcp_servers.example]',
    target_file: '.codex/config.toml',
    required_variables: [],
    notes: [],
    runtime_client_verification: false,
  };
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    requested.push(path);
    if (path === `/api/assets/example/versions/${oldVersion}`) return Response.json(asset);
    if (path === `/api/versions/${oldVersion}/files?path=server.json`) return new Response('{}');
    if (path === '/api/assets/example/versions?latest_readable=1') return Response.json([]);
    if (path.startsWith(`/api/versions/${oldVersion}/mcp-config?`))
      return Response.json(configuration);
    assert.fail('Unexpected fetch: ' + path);
  });
  const user = userEvent.setup();
  const drawer = sheet({ slug: 'example', versionId: oldVersion, tab: 'installation' });
  const first = render(page(drawer));

  const form = await screen.findByRole('region', { name: '受限 MCP 配置方式' });
  assert.match(form.textContent ?? '', new RegExp(`"version_id": "${oldVersion}"`));
  assert.match(form.textContent ?? '', /--version 'v1\.0\.0'/);
  assert(requested.every((path) => !/mcp-config|install-tickets|shared-keys/.test(path)));

  first.unmount();
  asset.current_readable = false;
  render(page(drawer));
  const historical = await screen.findByRole('region', { name: '受限 MCP 配置方式' });
  assert.doesNotMatch(historical.textContent ?? '', /capability-hub mcp-config/);
  assert.match(historical.textContent ?? '', new RegExp(`"version_id": "${oldVersion}"`));
  assert(requested.every((path) => !/mcp-config|install-tickets|shared-keys/.test(path)));

  await user.click(screen.getByText('预览客户端配置'));
  await user.click(screen.getByRole('button', { name: '生成配置预览' }));
  assert(await screen.findByText('[mcp_servers.example]'));
  assert.deepEqual(
    requested.filter((path) => path.includes('mcp-config')),
    [
      `/api/versions/${oldVersion}/mcp-config?installation_option_id=remote-0&client=codex&scope=project`,
    ],
  );
  assert(requested.every((path) => !path.includes('install-tickets')));
});

test('当前发布视图沿用资产详情接口，并保留推荐与维护入口', async (context) => {
  const requested: string[] = [];
  const asset: AssetResponse = {
    ...detail('skill'),
    current_release: release(newVersion, 'v2.0.0'),
  };
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    requested.push(path);
    if (path === '/api/assets/example') return Response.json(asset);
    if (path === `/api/versions/${newVersion}/files?path=SKILL.md`)
      return new Response('---\nname: example\n---\n新版说明');
    if (path === '/api/assets/example/versions') return Response.json([]);
    assert.fail('Unexpected fetch: ' + path);
  });
  render(page(sheet({ slug: 'example' })));
  assert(await screen.findByRole('region', { name: '资源推荐与通用提名' }));
  assert(screen.getByText('资产维护与分发控制'));
  assert.equal(screen.queryByRole('link', { name: '查看最新可读版本' }), null);
  await waitFor(() => assert(requested.includes('/api/assets/example')));
});
