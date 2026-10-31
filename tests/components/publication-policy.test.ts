import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { Policy } from '@capability-hub/contracts';
import { HubCtx, type HubState } from '../../apps/web/src/shared/context/HubContext.js';
import { PublicationPolicyFields } from '../../apps/web/src/features/publishing/PublicationPolicyFields.js';

afterEach(cleanup);

const teams = [
  { id: '00000000-0000-4000-8000-000000000001', name: '研发团队' },
  { id: '00000000-0000-4000-8000-000000000002', name: '运维团队' },
];
const state: HubState = {
  me: {
    id: 'owner',
    username: 'owner',
    display_name: '维护者',
    groups: teams,
    csrf_token: '',
    features: { git_hosts: [] },
    capabilities: { can_admin: false, can_audit: false, can_publish: true, can_review: false },
  },
  refresh: 0,
  reviewCount: 0,
  reload: () => {},
  openPalette: () => {},
  logout: () => Promise.resolve(),
};

test('发布表单显示并保留全部指定受众，移除一个团队不会静默覆盖其他团队', async (context) => {
  context.mock.method(globalThis, 'fetch', () => Promise.resolve(Response.json([])));
  let latest: Policy;
  function Form() {
    const [policy, setPolicy] = useState<Policy>({
      category: 'uncategorized',
      scenario_ids: [],
      distribution: {
        mode: 'approved_audience',
        audience: teams.map((team) => 'group:' + team.id),
      },
    });
    latest = policy;
    return createElement(
      HubCtx.Provider,
      { value: state },
      createElement(PublicationPolicyFields, { value: policy, onChange: setPolicy }),
    );
  }
  const user = userEvent.setup();
  render(createElement(Form));
  const first = screen.getByRole('checkbox', { name: teams[0].name });
  const second = screen.getByRole('checkbox', { name: teams[1].name });
  assert(first instanceof HTMLInputElement && first.checked);
  assert(second instanceof HTMLInputElement && second.checked);
  await user.click(first);
  assert.deepEqual(latest!.distribution.audience, ['group:' + teams[1].id]);
  assert(second.checked);
  await user.click(screen.getByRole('button', { name: /可见范围$/ }));
  await user.click(await screen.findByRole('option', { name: '公开 · 无需登录' }));
  assert.deepEqual(latest!.distribution.audience, ['public']);
  assert.equal(screen.queryByRole('checkbox', { name: teams[1].name }), null);
});

test('场景读取失败显示具体错误，不能误导为尚未登记场景', async (context) => {
  context.mock.method(globalThis, 'fetch', () =>
    Promise.resolve(
      Response.json({ error: { code: 'READ_FAILED', message: '场景读取失败' } }, { status: 503 }),
    ),
  );
  render(
    createElement(
      HubCtx.Provider,
      { value: state },
      createElement(PublicationPolicyFields, {
        value: {
          category: 'scenario',
          scenario_ids: [],
          distribution: { mode: 'approved_audience', audience: ['public'] },
        },
        onChange: () => {},
      }),
    ),
  );
  await waitFor(() => assert(screen.getByRole('alert').textContent?.includes('场景读取失败')));
  assert.equal(screen.queryByText('请管理员先在账号管理中登记场景。'), null);
});
