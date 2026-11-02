import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useCallback, useState } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { SourceResponse } from '@capability-hub/contracts/http';
import SourcesPanel from '../../apps/web/src/features/sources/SourcesPanel.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';
import { deferred } from '../support/store.js';
import { createTestHub, receiveSkill } from '../support/application.js';

afterEach(cleanup);

function source(id: string, overrides: Partial<SourceResponse> = {}): SourceResponse {
  return {
    id,
    kind: 'git',
    provider: 'generic-git',
    state: 'active',
    branch: 'main',
    revision: 3,
    generation: 0,
    created_at: '2026-01-01T00:00:00Z',
    next_poll_at: 0,
    owner_group_id: 'team',
    repository_identity: `git.example.test/group/subgroup/${id}`,
    canonical_url: `https://git.example.test/group/subgroup/${id}.git`,
    credential_ref: 'credential',
    targets: [
      {
        id: `target-${id}`,
        source_id: id,
        asset_id: `asset-${id}`,
        slug: `use-${id}`,
        kind: 'skill',
        path: `skills/use-${id}`,
        enabled: true,
        retired_at: null,
        created_at: '2026-01-01T00:00:00Z',
        category: 'uncategorized',
        scenario_ids: [],
        applies_to: {},
        distribution: { mode: 'approved_audience', audience: ['group:team'] },
      },
    ],
    ...overrides,
  };
}

function Page() {
  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((n) => n + 1), []);
  return createElement(
    HubCtx.Provider,
    {
      value: {
        refresh,
        reload,
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
          features: { git_hosts: ['git.example.test'] },
        },
        reviewCount: 0,
        openPalette: () => {},
        logout: async () => {},
      },
    },
    createElement(SourcesPanel),
  );
}

test('认证失败的来源按实际协议提供处理指引和凭据入口', async (context) => {
  const sources = [
    source('https-repo', { state: 'auth_error', last_error_code: 'GIT_AUTH_ERROR' }),
    source('ssh-repo', {
      state: 'auth_error',
      last_error_code: 'GIT_AUTH_ERROR',
      canonical_url: 'git@git.example.test:group/ssh-repo.git',
    }),
  ];
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, '/api/sources');
    return Response.json(sources);
  });
  render(createElement(Page));
  const https = within(await screen.findByRole('article', { name: 'https-repo' }));
  const ssh = within(screen.getByRole('article', { name: 'ssh-repo' }));
  assert.match(https.getByRole('note').textContent ?? '', /HTTPS.*令牌/);
  assert.doesNotMatch(https.getByRole('note').textContent ?? '', /公钥/);
  assert.match(ssh.getByRole('note').textContent ?? '', /SSH.*主机公钥/);
  assert.equal(
    https.getByRole('link', { name: '管理凭据' }).getAttribute('href'),
    '/account?tab=credentials',
  );
  assert.ok(https.getByText('git.example.test/group/subgroup'));
  assert.ok(https.getByText('skills/use-https-repo'));
});

test('暂停、阻断或没有启用目标的仓库说明原因并禁用同步', async (context) => {
  const empty = source('disabled-targets');
  empty.targets[0].enabled = false;
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, '/api/sources');
    return Response.json([
      source('paused-repo', { state: 'paused' }),
      source('blocked-repo', { state: 'blocked' }),
      empty,
    ]);
  });
  render(createElement(Page));
  const paused = within(await screen.findByRole('article', { name: 'paused-repo' }));
  const blocked = within(screen.getByRole('article', { name: 'blocked-repo' }));
  const inactive = within(screen.getByRole('article', { name: 'disabled-targets' }));
  assert.ok(inactive.getByText(/至少一个启用的读取目标/));
  assert.equal((paused.getByRole('button', { name: '恢复' }) as HTMLButtonElement).disabled, false);
  assert.equal((blocked.getByRole('button', { name: '暂停' }) as HTMLButtonElement).disabled, true);
  for (const card of [paused, blocked, inactive])
    assert.equal((card.getByRole('button', { name: '同步' }) as HTMLButtonElement).disabled, true);
});

test('同时同步两个仓库时，每个仓库保留自己的进度、目标结果和接收入口', async (context) => {
  const fixture = await createTestHub(context);
  const intake = await receiveSkill(fixture, { slug: 'use-alpha' });
  const alpha = deferred<Response>();
  const sources = [source('alpha'), source('beta')];
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/sources') return Response.json(sources);
    if (path === '/api/sources/alpha/sync') return Response.json({ job_id: 'a' });
    if (path === '/api/sources/beta/sync') return Response.json({ job_id: 'b' });
    if (path === '/api/sources/alpha/sync-jobs/a') return alpha.promise;
    if (path === '/api/sources/beta/sync-jobs/b')
      return Response.json({
        id: 'b',
        state: 'succeeded',
        result: {
          origin_commit: 'b'.repeat(40),
          targets: [
            {
              binding_id: 'target-beta',
              intake_id: 'beta-intake',
              state: 'failed',
              error_code: 'TARGET_MISSING',
            },
          ],
        },
      });
    if (path === '/api/intakes/' + intake.id)
      return Response.json(await fixture.hub.intakeQueries.getDetail(fixture.admin, intake.id));
    assert.fail('Unexpected fetch: ' + path);
  });
  const user = userEvent.setup();
  render(createElement(Page));
  const first = within(await screen.findByRole('article', { name: 'alpha' }));
  const second = within(screen.getByRole('article', { name: 'beta' }));
  await user.click(first.getByRole('button', { name: '同步' }));
  await user.click(second.getByRole('button', { name: '同步' }));
  assert.ok(await second.findByText('TARGET_MISSING'));
  assert.match(second.getByRole('status').textContent ?? '', /0\/1 个目标通过校验 · 1 个需处理/);
  assert.ok(first.getByRole('button', { name: '同步中' }));
  assert.equal(first.queryByText('TARGET_MISSING'), null);
  await act(async () =>
    alpha.resolve(
      Response.json({
        id: 'a',
        state: 'succeeded',
        last_error_code: 'GIT_AUTH_ERROR',
        error_message: '前一次尝试失败',
        result: {
          origin_commit: 'a'.repeat(40),
          targets: [
            {
              binding_id: 'target-alpha',
              intake_id: intake.id,
              state: 'ready',
              reused: true,
            },
          ],
        },
      }),
    ),
  );
  assert.ok(await first.findByText('复用已有接收'));
  assert.match(first.getByRole('status').textContent ?? '', /1\/1/);
  assert.equal(first.queryByText('前一次尝试失败'), null);
  await user.click(first.getByRole('button', { name: '查看 use-alpha 的接收结果' }));
  const detail = within(await screen.findByRole('dialog', { name: '接收详情' }));
  assert.ok(await detail.findByRole('heading', { name: /use-alpha/ }));
});

test('批次状态加载失败后可重读原批次，不必重新发起同步', async (context) => {
  let readable = false;
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    if (path === '/api/sources') return Response.json([source('retry')]);
    if (path === '/api/sources/retry/sync')
      return Response.json({ job_id: readable ? 'different' : 'original' });
    if (path === '/api/sources/retry/sync-jobs/original')
      return readable
        ? Response.json({
            id: 'original',
            state: 'succeeded',
            result: { origin_commit: 'c'.repeat(40), targets: [] },
          })
        : Response.json({ error: { message: '进度暂时不可用' } }, { status: 503 });
    assert.fail('Unexpected fetch: ' + path);
  });
  render(createElement(Page));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '同步' }));
  const retry = await screen.findByRole('button', { name: '刷新进度' });
  assert.equal(
    (screen.getByRole('button', { name: '进度待确认' }) as HTMLButtonElement).disabled,
    true,
  );
  readable = true;
  await user.click(retry);
  assert.ok(await screen.findByText('c'.repeat(40)));
  assert.equal(screen.queryByRole('button', { name: '刷新进度' }), null);
});

test('展开多目标仓库后能看到其余路径和接收入口，收起后仍显示目标总数', async (context) => {
  const repo = source('monorepo');
  repo.targets = ['one', 'two', 'three', 'four'].map((name) => ({
    ...repo.targets[0],
    id: name,
    asset_id: 'asset-' + name,
    slug: name,
    path: 'skills/' + name,
    last_intake_id: 'intake-' + name,
  }));
  context.mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, '/api/sources');
    return Response.json([repo]);
  });
  const user = userEvent.setup();
  render(createElement(Page));
  const card = within(await screen.findByRole('article', { name: 'monorepo' }));
  assert.equal(card.queryByText('skills/four'), null);
  await user.click(card.getByRole('button', { name: '查看全部 4 个目标' }));
  assert.ok(card.getByText('skills/four'));
  assert.ok(card.getByRole('button', { name: '查看 four 的上次接收' }));
  await user.click(card.getByRole('button', { name: '收起目标' }));
  assert.equal(card.queryByText('skills/four'), null);
  assert.ok(card.getByRole('button', { name: '查看全部 4 个目标' }));
});

test('编辑期间刷新凭据保留输入，保存受阻来源时保留目标绑定与原修订', async (context) => {
  const repo = source('config', { state: 'blocked' });
  let renamed = false;
  let patch:
    { method?: string; revision: string | null; data: Record<string, unknown> } | undefined;
  context.mock.method(globalThis, 'fetch', async (path: string, options: RequestInit) => {
    if (path === '/api/sources') return Response.json([repo]);
    if (path === '/api/git-credentials')
      return Response.json([
        {
          id: 'credential',
          name: renamed ? '新名称' : '只读令牌',
          host: 'git.example.test',
          kind: 'token',
          auth_method: 'basic',
          revoked_at: null,
          expires_at: null,
        },
      ]);
    if (path === '/api/sources/config') {
      patch = {
        method: options.method,
        revision: new Headers(options.headers).get('If-Match'),
        data: JSON.parse(String(options.body)),
      };
      return Response.json(
        { error: { code: 'REVISION_CONFLICT', message: '修订已变化' } },
        { status: 412 },
      );
    }
    assert.fail('Unexpected fetch: ' + path);
  });
  const user = userEvent.setup();
  render(createElement(Page));
  await user.click(await screen.findByRole('button', { name: '编辑配置' }));
  const editor = within(await screen.findByRole('dialog', { name: '编辑 Git 来源' }));
  assert.equal(editor.queryByText('同步状态'), null);
  const branch = editor.getByRole('textbox', { name: '分支' }) as HTMLInputElement;
  await user.clear(branch);
  await user.type(branch, 'release');
  assert.equal(
    editor.getByRole('link', { name: /管理 Git 凭据/ }).getAttribute('target'),
    '_blank',
  );
  await editor.findByRole('button', { name: /只读令牌 · HTTPS Basic/ });
  renamed = true;
  await user.click(editor.getByRole('button', { name: '刷新凭据' }));
  await editor.findByRole('button', { name: /新名称 · HTTPS Basic/ });
  assert.equal(branch.value, 'release');
  await user.click(editor.getByRole('button', { name: '保存来源配置' }));
  assert.ok(await editor.findByRole('alert'));
  assert.match(editor.getByRole('alert').textContent ?? '', /修订已变化/);
  assert.equal(patch?.method, 'PATCH');
  assert.equal(patch?.revision, '"3"');
  assert.equal(patch?.data.branch, 'release');
  assert.equal(patch?.data.credential_ref, 'credential');
  assert.equal(patch?.data.state, undefined);
  assert.deepEqual(
    patch?.data.targets,
    repo.targets.map((target) => ({
      slug: target.slug,
      kind: target.kind,
      path: target.path,
      category: target.category,
      scenario_ids: target.scenario_ids,
      distribution: target.distribution,
      applies_to: target.applies_to,
      binding_id: target.id,
      asset_id: target.asset_id,
      enabled: target.enabled,
    })),
  );
});
