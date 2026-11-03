import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { deferred } from '../support/store.js';
import { OperationsAnalytics } from '../../apps/web/src/features/operations/agents/OperationsAnalytics.js';
import { TokenUsagePanel } from '../../apps/web/src/features/operations/usage/TokenUsagePanel.js';
import type { TokenUsageResponse } from '@capability-hub/contracts';
import type { AuditLogResponse, OperationsResponse } from '@capability-hub/contracts/http';
import { OperationsPanel } from '../../apps/web/src/features/operations/OperationsPanel.js';
import OperationsCenter from '../../apps/web/src/features/operations/OperationsCenter.js';
import {
  loginReturnPath,
  parseHistoryRoute,
} from '../../apps/web/src/shared/navigation/history-route.js';
import {
  assetBackground,
  internalPageHref,
} from '../../apps/web/src/shared/navigation/history-navigation.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';

afterEach(cleanup);

function renderCenter(query: string, audit: boolean, inspect: boolean) {
  return render(
    createElement(
      HubCtx.Provider,
      {
        value: {
          me: {
            id: 'viewer',
            username: 'viewer',
            display_name: '运营用户',
            auth_provider: 'local',
            groups: [],
            csrf_token: '',
            features: { git_hosts: [] },
            capabilities: {
              can_audit: audit,
              can_ai_console: inspect,
              can_ai: false,
              can_admin: false,
              can_publish: false,
              can_review: false,
            },
          },
          refresh: 0,
          reviewCount: 0,
          openPalette() {},
          reload() {},
          logout: async () => {},
        },
      },
      createElement(OperationsCenter, { query }),
    ),
  );
}

function resourceSample(days: number) {
  return {
    observed_at: '2026-11-02T08:00:00Z',
    daily: Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.UTC(2026, 10, 3 - days + i)).toISOString().slice(0, 10),
      first_releases: 0,
      repeat_releases: 0,
      downloads: 0,
      skill_loads: 0,
      install_requests: 0,
      feedback_pending: 0,
      feedback_in_progress: 0,
      feedback_resolved: 0,
      feedback_declined: 0,
    })),
  };
}

test('运营首页优先展示发布、使用和反馈趋势，切换范围重读对应明细', async (t) => {
  const user = userEvent.setup();
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    const url = new URL(path, 'http://localhost');
    assert.equal(url.pathname, '/api/admin/resource-activity');
    const days = Number(url.searchParams.get('days'));
    const sample = resourceSample(days);
    Object.assign(sample.daily[days - 1], {
      first_releases: 1,
      repeat_releases: 2,
      downloads: days === 7 ? 5 : 15,
      skill_loads: 2,
      install_requests: 1,
      feedback_pending: 3,
      feedback_in_progress: 2,
      feedback_resolved: 1,
    });
    return Response.json(sample);
  });
  renderCenter('', true, false);
  assert(screen.getByRole('heading', { level: 1, name: '运营中心' }));
  const nav = within(screen.getByRole('navigation', { name: '运营中心导航' }));
  assert.equal(nav.getByRole('link', { name: '运营总览' }).getAttribute('aria-current'), 'page');
  assert.equal(
    nav.getByRole('link', { name: 'Agent' }).getAttribute('href'),
    '/operations?tab=agents',
  );
  assert.equal(
    nav.getByRole('link', { name: 'Token 用量' }).getAttribute('href'),
    '/operations?tab=usage',
  );
  assert(await screen.findByRole('region', { name: '反馈处理状态' }));
  await user.click(screen.getByText('查看逐日明细'));
  const table = screen.getByRole('table', { name: '资源运营逐日明细' });
  assert(within(table).getByRole('row', { name: '2026-11-02 3 5 2 1 6' }));
  await user.click(screen.getByRole('radio', { name: '近 30 天' }));
  assert(await screen.findByText('15', { selector: 'dd' }));
});

test('运营趋势缺少日期时允许重试，只有成功读取完整窗口才显示无活动', async (t) => {
  const user = userEvent.setup();
  let sample = resourceSample(0);
  t.mock.method(globalThis, 'fetch', async () => Response.json(sample));
  renderCenter('', true, false);
  assert(await screen.findByText('资源趋势数据格式无效'));
  assert.equal(screen.queryByRole('figure'), null);
  sample = resourceSample(7);
  await user.click(screen.getByRole('button', { name: '重新加载' }));
  assert(await screen.findByText('所选期间没有资源发布、使用请求或新增反馈。'));
  assert.equal(screen.getAllByRole('figure').length, 3);
});

test('刷新时保留展开的逐日明细，切换范围后不显示迟到的旧采样', async (t) => {
  const user = userEvent.setup();
  let seven = deferred();
  const thirty = deferred();
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    const days = Number(new URL(path, 'http://localhost').searchParams.get('days'));
    await (days === 7 ? seven : thirty).promise;
    const sample = resourceSample(days);
    sample.daily[0].downloads = days;
    return Response.json(sample);
  });
  renderCenter('', true, false);
  const result = within(await screen.findByRole('region', { name: '资源趋势结果', busy: true }));
  assert(result.getByText('正在读取资源趋势…'));
  assert.equal(result.queryByRole('figure'), null);
  await act(async () => seven.resolve());
  await user.click(await result.findByText('查看逐日明细'));
  const table = result.getByRole('table', { name: '资源运营逐日明细' });

  seven = deferred();
  await user.click(screen.getByRole('button', { name: '刷新' }));
  assert(screen.getByRole('region', { name: '资源趋势结果', busy: true }));
  assert.equal(result.getByRole('table', { name: '资源运营逐日明细' }), table);
  assert.equal(result.queryByText('正在读取资源趋势…'), null);
  await user.click(screen.getByRole('radio', { name: '近 30 天' }));
  await act(async () => seven.resolve());
  assert(result.getByText('正在读取资源趋势…'));
  assert.equal(result.queryByRole('table'), null);
  assert.equal(result.queryByText('7', { selector: 'dd' }), null);
  await act(async () => thirty.resolve());
  assert(result.getByText('30', { selector: 'dd' }));
});

for (const [query, audit, inspect, message] of [
  ['tab=agents&execution=private', true, false, '当前账号无权访问 Agent 执行记录。'],
  ['tab=usage', false, true, '当前账号无法访问此运营栏目。'],
  ['tab=agents&view=analytics', false, true, '当前账号无权查看 Agent 运行分析。'],
] as const)
  test(`直接访问未获授权的运营子页 ${query} 不读取数据`, (t) => {
    const requests: string[] = [];
    t.mock.method(globalThis, 'fetch', async (path: string) => {
      requests.push(path);
      return Response.json({});
    });
    renderCenter(query, audit, inspect);
    assert(screen.getByText(message));
    assert.deepEqual(requests, []);
  });

test('运营链接保留任务参数，导航、登录回跳与详情来源都只接受有效页面', () => {
  const base = 'http://localhost/discover';
  for (const query of ['tab=agents&execution=run-1', 'tab=agents&new=1']) {
    const href = '/operations?' + query;
    assert.deepEqual(parseHistoryRoute('/operations', query), { page: 'operations', query });
    assert.equal(internalPageHref(href, base), href);
    assert.equal(loginReturnPath(new URLSearchParams({ return_to: href }).toString()), href);
    assert.equal(assetBackground({ asset_background: href }), href);
  }
  for (const href of ['/unknown', '/account?tab=unknown', '/account?tab=profile&tab=roles']) {
    assert.equal(internalPageHref(href, base), undefined);
    assert.equal(loginReturnPath(new URLSearchParams({ return_to: href }).toString()), '/discover');
    assert.equal(assetBackground({ asset_background: href }), undefined);
  }
});

test('审计翻页时标明旧结果并冻结详情入口，失败后收起旧记录和统计', async (t) => {
  const first = deferred<Response>();
  const next = deferred<Response>();
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    const url = new URL(path, 'http://localhost');
    assert.equal(url.pathname, '/api/admin/audit');
    return (url.searchParams.get('page') === '1' ? first : next).promise;
  });
  renderCenter('tab=audit', true, false);
  const results = within(await screen.findByRole('region', { name: '审计查询结果', busy: true }));
  assert(screen.getByText('正在加载审计统计…'));
  assert(results.getByText('正在加载审计事件…'));
  assert.equal(screen.queryByText('尚无审计事件'), null);
  const page: AuditLogResponse = {
    items: [
      {
        id: 'login-1',
        occurred_at: '2026-11-02T05:00:00.000Z',
        action: 'login',
        action_label: '账号登录',
        category: 'identity',
        result: 'success',
        recorded_result: 'success',
        reason: '',
        changes: [],
        facts: [],
        actor: { kind: 'user', id: 'owner', name: '审计用户', name_source: 'event' },
        subject: {
          kind: 'session',
          id: 'session',
          name: '登录会话',
          detail: '',
          name_source: 'event',
          href: null,
        },
      },
    ],
    page: 1,
    page_size: 10,
    total: 11,
    summary: { failures: 0, identity: 11, publication: 0, downloads: 0 },
  };
  await act(async () => first.resolve(Response.json(page)));
  const row = results.getByText('账号登录');
  await userEvent.setup().click(results.getByRole('button', { name: '审计事件下一页' }));
  assert(screen.getByText('正在更新，当前显示上一次查询结果'));
  assert(row.closest('[inert]'));
  assert.equal(results.queryByText('正在加载审计事件…'), null);
  await act(async () =>
    next.resolve(Response.json({ error: { message: '查询暂不可用' } }, { status: 503 })),
  );
  assert(results.getByText('查询暂不可用'));
  assert.equal(results.queryByText('账号登录'), null);
  assert.equal(screen.queryByText('匹配事件'), null);
});

test('Token 用量切换归属和范围，部分回传与尚无请求分别显示', async (t) => {
  const user = userEvent.setup();
  const totals = {
    requests: 3,
    input_tokens: 80,
    output_tokens: 20,
    unknown_requests: 1,
    pending_requests: 1,
    partial_input_tokens: 7,
    partial_output_tokens: 0,
  };
  const snapshot: TokenUsageResponse = {
    period: 'all',
    granularity: 'month',
    from: null,
    observed_at: '2026-11-02T05:00:00.000Z',
    totals,
    trend: [{ bucket: '2026-11', ...totals }],
    by_agent: [{ id: 'assistant', label: '基础助手', ...totals }],
    by_profile: [{ id: 'primary', label: '主模型', ...totals }],
    by_user: [{ id: 'owner', label: '负责人甲', ...totals }],
  };
  let usageRead = Promise.resolve();
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    await usageRead;
    if (path === '/api/admin/token-usage?period=all') return Response.json(snapshot);
    assert.equal(path, '/api/admin/token-usage?period=7d');
    return Response.json({
      ...snapshot,
      period: '7d',
      from: '2026-10-26T16:00:00.000Z',
      granularity: 'day',
      totals: {
        requests: 0,
        input_tokens: 0,
        output_tokens: 0,
        unknown_requests: 0,
        pending_requests: 0,
        partial_input_tokens: 0,
        partial_output_tokens: 0,
      },
      trend: [],
      by_agent: [],
      by_profile: [],
      by_user: [],
    });
  });
  render(createElement(TokenUsagePanel));
  const overview = within(screen.getByRole('region', { name: '项目 Token 用量' }));
  assert(await overview.findByText('100'));
  assert(overview.getByText(/不完整请求已回传输入 7/));
  const groups = within(screen.getByRole('region', { name: 'Token 用量分布' }));
  assert(groups.getByText('基础助手'));
  await user.click(groups.getByRole('radio', { name: '模型档案' }));
  assert(groups.getByText('主模型'));
  await user.click(groups.getByRole('radio', { name: '用户' }));
  assert(groups.getByText('负责人甲'));
  assert(groups.getByText('100.0%'));
  const refresh = deferred();
  usageRead = refresh.promise;
  await user.click(overview.getByRole('button', { name: '刷新' }));
  assert(screen.getByRole('region', { name: 'Token 用量结果', busy: true }));
  assert(groups.getByRole('radio', { name: '用户', checked: true }));
  assert(groups.getByText('负责人甲'));
  await act(async () => refresh.resolve());
  assert(groups.getByRole('radio', { name: '用户', checked: true }));
  const nextPeriod = deferred();
  usageRead = nextPeriod.promise;
  await user.click(overview.getByRole('radio', { name: '近 7 天' }));
  assert(overview.getByText('正在读取 Token 用量…'));
  assert.equal(overview.queryByText('100'), null);
  assert.equal(screen.queryByText('负责人甲'), null);
  assert.equal(overview.queryByText('所选范围没有模型请求。'), null);
  await act(async () => nextPeriod.resolve());
  assert(await overview.findByText('所选范围没有模型请求。'));
  assert.equal(screen.queryByRole('region', { name: 'Token 用量分布' }), null);
});

function OperationsView({ section }: { section: 'runtime' | 'agents' }) {
  const [refresh, setRefresh] = useState(0);
  return createElement(
    HubCtx.Provider,
    {
      value: {
        refresh,
        reload: () => setRefresh(refresh + 1),
        me: null,
        reviewCount: 0,
        openPalette() {},
        logout: async () => {},
      },
    },
    createElement(OperationsPanel, { section }),
  );
}

test('刷新恢复的存储和 Agent 统计时，页面区分采样失败和没有执行', async (t) => {
  const time = '2026-10-31T10:00:00Z';
  const snapshot: OperationsResponse = {
    observed_at: time,
    memory_rss_bytes: 1024,
    last_backup_at: null,
    backup_record_count: 0,
    worker_state: 'stopped',
    database: {
      driver: 'sqlite',
      available: true,
      duration_ms: 1,
      size_bytes: 1024,
      pool_limit: null,
    },
    object_storage: { driver: 'filesystem', available: false, duration_ms: 20 },
    agents: {
      default_profile: '',
      profiles: [],
      daily_activity: null,
      operations: [{ id: 'resource-audit', title: '资源审计', version: '1', activity: null }],
    },
    http: {
      since: time,
      requests: 20,
      active: 0,
      aborted: 0,
      by_status: {},
      errors: {},
      mean_duration_ms: null,
      duration_buckets: [
        { upper_ms: 25, count: 19, cumulative: 19 },
        { upper_ms: 30000, count: 0, cumulative: 19 },
        { upper_ms: null, count: 1, cumulative: 20 },
      ],
    },
    jobs: null,
    scans: null,
    disk: { available: false },
  };
  let snapshotReady = Promise.resolve();
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, '/api/admin/operations');
    await snapshotReady;
    return Response.json(snapshot);
  });
  const runtime = render(createElement(OperationsView, { section: 'runtime' }));
  const objects = within(await screen.findByRole('region', { name: '对象存储' }));
  assert(objects.getByText('探测失败'));
  assert(within(screen.getByRole('region', { name: '数据库' })).getByText('探测正常'));
  const metric = (label: string) =>
    within(runtime.container).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;
  assert.equal(metric('成功备份记录'), '0 条');
  assert.equal(metric('本实例 Worker'), '未运行');
  assert.equal(metric('已取消作业'), '—');
  assert.equal(metric('扫描通过'), '—');
  const analysis = render(createElement(OperationsView, { section: 'agents' }));
  const agents = within(await screen.findByRole('region', { name: 'AI Agents' }));
  assert(agents.getByText('执行统计暂不可用'));
  assert(agents.getByText(/尚未配置模型/));
  assert(screen.getByText('作业统计暂不可用'));
  assert(screen.getByText('≤ 25 ms'));
  assert(screen.getByText(/趋势统计暂不可用/));

  snapshot.object_storage.available = true;
  delete snapshot.last_backup_at;
  delete snapshot.backup_record_count;
  snapshot.worker_state = 'busy';
  snapshot.jobs = {
    by_state: { cancelled: 2 },
    oldest_wait_seconds: 0,
    retrying: 0,
    expired_leases: 0,
    recent_failures: [],
  };
  snapshot.scans = { by_state: {}, ruleset: 'test' };
  snapshot.http.requests++;
  snapshot.http.duration_buckets[2] = { upper_ms: null, count: 2, cumulative: 21 };
  snapshot.agents.daily_activity = [];
  snapshot.agents.operations[0].activity = { by_status: {}, last_activity_at: null };
  snapshot.agents.operations.push({
    id: 'assistant',
    title: '基础助手',
    version: '2',
    activity: { by_status: { waiting_input: 3 }, last_activity_at: time },
  });
  const refresh = deferred();
  snapshotReady = refresh.promise;
  fireEvent.click(within(runtime.container).getByRole('button', { name: '刷新' }));
  fireEvent.click(within(analysis.container).getByRole('button', { name: '刷新' }));
  assert(within(runtime.container).getByRole('region', { name: '实例采样结果', busy: true }));
  assert(objects.getByText('探测失败'));
  assert(agents.getByText('执行统计暂不可用'));
  await act(async () => refresh.resolve());
  assert(await objects.findByText('探测正常'));
  assert.equal(metric('成功备份记录'), '无法读取');
  assert.equal(metric('本实例 Worker'), '工作中');
  assert.equal(metric('已取消作业'), '2');
  assert.equal(metric('扫描通过'), '0');
  assert(screen.getByText('> 30000 ms'));
  assert(await screen.findByText('所选范围暂无执行记录。'));
  assert(agents.getByText('暂无执行记录'));
  assert(agents.getByText('待确认 3'));
  assert.equal(agents.queryByText('执行统计暂不可用'), null);
});

test('时间和 Agent 筛选同步更新成功率、逐日数据与错误分布，等待和取消不稀释成功率', async () => {
  const user = userEvent.setup();
  const days = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    counts: [] as NonNullable<OperationsResponse['agents']['daily_activity']>[number]['counts'],
  }));
  days[0].counts.push({
    operation_id: 'assistant',
    status: 'succeeded',
    count: 2,
    error_code: null,
  });
  days[29].counts.push(
    { operation_id: 'assistant', status: 'succeeded', count: 2, error_code: null },
    { operation_id: 'assistant', status: 'failed', count: 1, error_code: 'AI_OUTPUT_INVALID' },
    { operation_id: 'assistant', status: 'timed_out', count: 1, error_code: null },
    { operation_id: 'assistant', status: 'cancelled', count: 3, error_code: null },
    { operation_id: 'resource-audit', status: 'waiting_input', count: 5, error_code: null },
  );
  render(
    createElement(OperationsAnalytics, {
      agents: {
        default_profile: '',
        profiles: [],
        daily_activity: days,
        operations: [{ id: 'resource-audit', title: '资源审计', version: '1', activity: null }],
      },
    }),
  );
  assert(screen.getByText('50.0%'));
  assert(screen.getByText('AI_OUTPUT_INVALID'));
  assert(screen.getByText('未记录错误码'));
  await user.click(screen.getByRole('radio', { name: '近 30 天' }));
  assert(screen.getByText('66.7%'));
  await user.click(screen.getByText('查看逐日数据'));
  const table = screen.getByRole('table', { name: '每日执行明细' });
  assert.equal(within(table).getAllByRole('row').length, 31);
  assert(within(table).getByRole('row', { name: '2026-10-30 12 2' }));
  await user.click(screen.getByRole('button', { name: /全部 Agent 分析对象/ }));
  await user.click(screen.getByRole('option', { name: '资源审计' }));
  assert(screen.getByText('尚无完成、失败或超时的执行'));
  assert.equal(screen.queryByText('AI_OUTPUT_INVALID'), null);
  assert(within(table).getByRole('row', { name: '2026-10-30 5 0' }));
});
