import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { OperationsAnalytics } from '../../apps/web/src/features/identity/OperationsAnalytics.js';
import type { OperationsResponse } from '@capability-hub/contracts/http';
import { OperationsPanel } from '../../apps/web/src/features/identity/OperationsPanel.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';

afterEach(cleanup);

function OperationsView() {
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
    createElement(OperationsPanel),
  );
}

test('刷新恢复的存储和 Agent 统计时，页面区分采样失败和没有执行', async (t) => {
  const time = '2026-10-31T10:00:00Z';
  const snapshot: OperationsResponse = {
    observed_at: time,
    memory_rss_bytes: 1024,
    last_backup_at: null,
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
  t.mock.method(globalThis, 'fetch', (path: string) => {
    assert.equal(path, '/api/admin/operations');
    return Promise.resolve(Response.json(snapshot));
  });
  render(createElement(OperationsView));
  const objects = within(await screen.findByRole('region', { name: '对象存储' }));
  assert(objects.getByText('探测失败'));
  assert(within(screen.getByRole('region', { name: '数据库' })).getByText('探测正常'));
  const agents = within(screen.getByRole('region', { name: 'AI Agents' }));
  assert(agents.getByText('执行统计暂不可用'));
  assert(agents.getByText(/尚未配置模型/));
  assert(screen.getByText('作业统计暂不可用'));
  assert(screen.getByText('≤ 25 ms'));
  assert(screen.getByText(/趋势统计暂不可用/));

  snapshot.object_storage.available = true;
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
  fireEvent.click(screen.getByRole('button', { name: '刷新' }));
  assert(await objects.findByText('探测正常'));
  assert(screen.getByText('> 30000 ms'));
  assert(screen.getByText('所选范围暂无执行记录。'));
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
