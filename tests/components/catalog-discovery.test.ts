import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { DiscoveryTurnResponse } from '@capability-hub/contracts/http';
import DiscoverPage from '../../apps/web/src/features/catalog/DiscoverPage.js';
import { HubCtx } from '../../apps/web/src/shared/context/HubContext.js';
import { createTestHub, publishSkill } from '../support/application.js';
import { deferred } from '../support/store.js';

afterEach(cleanup);

const page = (child: React.ReactNode, refresh = 0) =>
  createElement(
    HubCtx.Provider,
    {
      value: {
        me: undefined,
        reviewCount: 0,
        refresh,
        reload: () => {},
        openPalette: () => {},
        logout: async () => {},
      } as unknown as React.ContextType<typeof HubCtx>,
    },
    child,
  );

const result = {
  asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  slug: 'http-regression-kit',
  kind: 'skill' as const,
  version_id: '11111111-1111-4111-8111-111111111111',
  version_label: '1.0.0',
  category: 'scenario' as const,
  owner_name: '研发团队',
  visibility_label: '公开',
  published_at: '2026-11-20T10:00:00.000Z',
  description: '对关键 HTTP 接口做回归测试。',
  has_scripts: false,
  match_reasons: [
    {
      field: 'description' as const,
      text: '对关键 HTTP 接口做回归测试。',
      requirement: '接口回归测试',
    },
  ],
  unverified: [],
};

const secondSkill = {
  ...result,
  asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  version_id: '22222222-2222-4222-8222-222222222222',
  version_label:
    'git.0011223344556677889900112233445566778899.s11111111-1111-4111-8111-111111111111.r1',
  slug: 'release-notes',
  has_scripts: true,
};

const mcp = {
  ...result,
  asset_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
  version_id: '33333333-3333-4333-8333-333333333333',
  kind: 'mcp' as const,
  slug: 'service-mcp',
};

const guide: DiscoveryTurnResponse = {
  mode: 'dialogue',
  type: 'guide',
  reply: '你更担心变更没记清楚，还是改动影响了关键接口？',
  goal: '每次发版都不太放心',
  criteria: {
    keywords: [],
    requirements: [],
    kind: null,
    category: null,
    scenario_id: null,
    audience: 'readable',
    has_scripts: null,
    sort: 'relevance',
  },
  directions: [
    {
      label: '确认关键接口没被改坏',
      intent: '发版前回归关键接口',
      example: { slug: 'http-regression-kit', kind: 'skill' },
      criteria: {
        keywords: ['接口'],
        requirements: ['接口回归测试'],
        kind: null,
        category: null,
        scenario_id: null,
        audience: 'readable',
        has_scripts: null,
        sort: 'relevance',
      },
    },
  ],
  items: [],
  context: 'v1.ctx.mac',
};

const suggestionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const eventHeaders = { 'Content-Type': 'text/event-stream; charset=utf-8' };
const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const catalogFrame = frame('stage', { stage: 'catalog', resources: 3, complete: true });

function streamResult(result: DiscoveryTurnResponse) {
  return new Response(
    catalogFrame + frame('stage', { stage: 'verify' }) + frame('result', result),
    {
      headers: eventHeaders,
    },
  );
}

/** 入口与目录接口的最小替身；`turns` 决定对话接口返回什么，`catalog` 决定目录总数与常见主题。 */
function mockApi(
  entry: {
    mode: 'dialogue' | 'keywords';
    viewer_key: string;
    suggestions?: { label: string; text: string; suggestion_ref: string }[];
  },
  turns: (DiscoveryTurnResponse | Response | Promise<Response>)[],
  catalog: { total: number; keywords: string[] } = { total: 0, keywords: [] },
) {
  const posted: { path: string; body: Record<string, unknown> }[] = [];
  const entryPath = '/api/catalog/discovery';
  const mock = async (path: string, options?: RequestInit) => {
    if (path === entryPath) return Response.json({ suggestions: [], ...entry });
    if (path === '/api/catalog/discovery/turn') {
      const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
      posted.push({ path, body });
      const reply = await (turns.shift() ?? guide);
      if (reply instanceof Response) return reply;
      if (body.action === 'message' && body.expected_mode === 'dialogue') {
        assert.equal(new Headers(options?.headers).get('Accept'), 'text/event-stream');
        return streamResult(reply);
      }
      return Response.json(reply);
    }
    if (path === '/api/scenarios') return Response.json([]);
    if (path.startsWith('/api/assets/keywords?'))
      return Response.json({
        items: catalog.keywords.map((keyword) => ({ keyword, asset_count: 1, reason: 'popular' })),
      });
    if (path.startsWith('/api/assets?'))
      return Response.json({ items: [], total: catalog.total, counts: {}, next_cursor: null });
    throw new Error('unexpected fetch ' + path);
  };
  return { mock, posted };
}

test('示例只填入不发送，显式提交才带上提示标识，输入法组合期间不提交', async (context) => {
  const entry = {
    mode: 'dialogue' as const,
    viewer_key: 'anonymous',
    suggestions: [
      { label: '补接口回归', text: '怎样给接口补回归测试？', suggestion_ref: suggestionId },
    ],
  };
  const { mock, posted } = mockApi(entry, []);
  context.mock.method(globalThis, 'fetch', mock);
  const user = userEvent.setup();
  const view = render(page(createElement(DiscoverPage)));
  await user.click(await screen.findByRole('button', { name: '补接口回归' }));
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '你想完成什么？' });
  assert.equal(input.value, '怎样给接口补回归测试？');
  assert.equal(posted.length, 0);
  assert.equal(document.activeElement, input);

  fireEvent.keyDown(input, { key: 'Enter', metaKey: true, isComposing: true });
  assert.equal(posted.length, 0);
  await user.keyboard('{Control>}{Enter}{/Control}');
  await waitFor(() => assert.equal(posted.length, 1));
  assert.deepEqual(posted[0].body, {
    action: 'message',
    expected_mode: 'dialogue',
    viewer_key: 'anonymous',
    text: '怎样给接口补回归测试？',
    suggestion_ref: suggestionId,
  });
  await screen.findByText(guide.reply);
  view.unmount();
  render(page(createElement(DiscoverPage)));
  await user.click(await screen.findByRole('button', { name: '补接口回归' }));
  const nextInput = screen.getByRole('textbox', { name: '你想完成什么？' });
  await user.clear(nextInput);
  await user.type(nextInput, '代码格式怎么统一？');
  await user.keyboard('{Meta>}{Enter}{/Meta}');
  await waitFor(() => assert.equal(posted.length, 2));
  assert.equal(posted[1].body.text, '代码格式怎么统一？');
  assert.equal(Object.hasOwn(posted[1].body, 'suggestion_ref'), false);
});

test('草稿到达 500 字上限时向读屏播报，删回上限以下即撤销', async (context) => {
  const { mock } = mockApi({ mode: 'dialogue', viewer_key: 'anonymous' }, []);
  context.mock.method(globalThis, 'fetch', mock);
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  const input = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: '你想完成什么？' });
  await user.click(input);
  await user.paste('测'.repeat(520));
  assert.equal(input.value.length, 500);
  assert.equal(screen.getByRole('status').textContent, '已达到 500 字上限');
  await user.keyboard('{Backspace}');
  assert.equal(screen.getByRole('status').textContent, '');
});

test('入口读取失败后仍可编辑草稿，重取成功也不自动发送', async (context) => {
  const entry = { mode: 'dialogue' as const, viewer_key: 'fresh-key', suggestions: [] };
  const { mock, posted } = mockApi(entry, []);
  const reload = deferred<Response>();
  let attempts = 0;
  context.mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => {
    if (path !== '/api/catalog/discovery') return mock(path, options);
    if (++attempts === 1)
      return Response.json({ error: { message: '入口暂不可用' } }, { status: 503 });
    return reload.promise;
  });
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  await screen.findByText('入口暂不可用');
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '你想完成什么？' });
  await user.type(input, '找回归测试');
  assert(screen.getByRole<HTMLButtonElement>('button', { name: '搜索' }).disabled);
  await user.keyboard('{Control>}{Enter}{/Control}');
  await user.click(screen.getByRole('button', { name: '重新加载' }));
  assert.equal(posted.length, 0);
  assert.equal(input.value, '找回归测试');
  await act(async () => reload.resolve(Response.json(entry)));
  const submit = await screen.findByRole('button', { name: '帮我找' });
  assert.equal(posted.length, 0);
  await user.click(submit);
  await screen.findByText(guide.reply);
  assert.equal(posted[0].body.viewer_key, entry.viewer_key);
  assert.equal(posted[0].body.text, '找回归测试');
});

test('访客键失效立即清除旧提示与草稿，新入口只允许用新键手动发送', async (context) => {
  const entry = {
    mode: 'dialogue' as const,
    viewer_key: 'old-key',
    suggestions: [{ label: '旧提示', text: '团队怎么做回归？', suggestion_ref: suggestionId }],
  };
  const { mock, posted } = mockApi(entry, [
    Response.json(
      { error: { code: 'DISCOVERY_VIEWER_CHANGED', message: '访问身份已变化' } },
      { status: 409 },
    ),
    guide,
  ]);
  const reload = deferred<Response>();
  context.mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => {
    if (path === '/api/catalog/discovery' && posted.length) return reload.promise;
    return mock(path, options);
  });
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  await user.click(await screen.findByRole('button', { name: '旧提示' }));
  await user.click(screen.getByRole('button', { name: '帮我找' }));
  await screen.findByText('访问身份已变化');
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '你想完成什么？' });
  assert.equal(input.value, '');
  assert.equal(screen.queryByRole('button', { name: '旧提示' }), null);
  await user.type(input, '找文档工具');
  assert(screen.getByRole<HTMLButtonElement>('button', { name: '搜索' }).disabled);
  await act(async () =>
    reload.resolve(Response.json({ ...entry, viewer_key: 'new-key', suggestions: [] })),
  );
  const submit = await screen.findByRole('button', { name: '帮我找' });
  assert.equal(posted.length, 1);
  await user.click(submit);
  await screen.findByText(guide.reply);
  assert.deepEqual(posted[1].body, {
    action: 'message',
    expected_mode: 'dialogue',
    viewer_key: 'new-key',
    text: '找文档工具',
  });
});

test('配置改为关键词模式后保留草稿，旧方向不能再操作，新提问须手动确认', async (context) => {
  const posted: { path: string; body: Record<string, unknown> }[] = [];
  let mode: 'dialogue' | 'keywords' = 'dialogue';
  context.mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => {
    if (path === '/api/catalog/discovery')
      return Response.json({ mode, viewer_key: 'anonymous', suggestions: [] });
    if (path === '/api/scenarios') return Response.json([]);
    if (path.startsWith('/api/assets?'))
      return Response.json({ items: [], total: 0, counts: {}, next_cursor: null });
    posted.push({ path, body: JSON.parse(String(options?.body)) });
    if (mode === 'keywords' && posted.at(-1)?.body.expected_mode === 'dialogue')
      return Response.json(
        {
          error: {
            code: 'DISCOVERY_MODE_CHANGED',
            message: '本站当前没有可用模型，已改为关键词匹配，请确认后重新发送',
          },
        },
        { status: 409 },
      );
    if (mode === 'dialogue') return streamResult(guide);
    return Response.json({ mode: 'keywords', type: 'matches', total: 0, items: [] });
  });
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  await user.type(await screen.findByRole('textbox', { name: '你想完成什么？' }), '回归测试');
  await user.click(screen.getByRole('button', { name: '帮我找' }));
  await screen.findByRole('button', { name: /确认关键接口没被改坏/ });

  // 服务端先改模式：旧模式发送被拒，页面保留草稿并提示，不自动重发。
  mode = 'keywords';
  const before = posted.length;
  await user.click(screen.getByRole('button', { name: '帮我找' }));
  await waitFor(() => assert(screen.getByText(/再次发送时改为关键词匹配/)));
  assert.equal(screen.queryByRole('button', { name: /确认关键接口没被改坏/ }), null);
  assert.equal(screen.queryByRole('textbox', { name: '继续追问' }), null);
  assert.equal(posted.length, before + 1);
  assert.equal(posted.at(-1)?.body.expected_mode, 'dialogue');
  assert.equal(
    screen.getByRole<HTMLTextAreaElement>('textbox', { name: '你想完成什么？' }).value,
    '回归测试',
  );
  // 入口模式已变：第一次点击只确认，第二次才按新模式发送。
  const confirmed = posted.length;
  await user.click(screen.getByRole('button', { name: '搜索' }));
  await waitFor(() => assert(screen.getAllByText(/关键词匹配|不会询问模型/).length >= 1));
  assert.equal(posted.length, confirmed);
  await user.click(screen.getByRole('button', { name: '搜索' }));
  await waitFor(() => assert.equal(posted.at(-1)?.body.expected_mode, 'keywords'));
  assert.equal(Object.hasOwn(posted.at(-1)!.body, 'context'), false);
});

test('键盘查找与停止共用同一个焦点，停止后丢弃迟到的结果', async (context) => {
  const entry = { mode: 'dialogue' as const, viewer_key: 'anonymous' };
  const { mock } = mockApi(entry, []);
  const late = deferred<Response>();
  context.mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => {
    if (path === '/api/catalog/discovery/turn') return late.promise;
    return mock(path, options);
  });
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  await user.type(await screen.findByRole('textbox', { name: '你想完成什么？' }), '回归测试');
  const button = screen.getByRole('button', { name: '帮我找' });
  await user.tab();
  assert.equal(document.activeElement, button);
  await user.keyboard('{Enter}');
  await screen.findByText('正在理解问题并在目录中查找…');
  assert.equal(screen.getByRole('button', { name: '停止' }), button);
  assert.equal(document.activeElement, button);
  await user.keyboard('{Enter}');
  assert.equal(screen.getByRole('button', { name: '帮我找' }), button);
  assert.equal(document.activeElement, button);
  await act(async () => late.resolve(streamResult(guide)));
  await waitFor(() => assert.match(screen.getByText(/已停止本轮/).textContent ?? '', /已停止/));
  assert.equal(screen.queryByText(guide.reply), null);
});

test('入口换成另一访客会取消在途提问，迟到的结果不显示给新访客', async (context) => {
  const entry = { mode: 'dialogue' as const, viewer_key: 'first' };
  const late = deferred<Response>();
  const { mock } = mockApi(entry, [late.promise]);
  let signal: AbortSignal | null | undefined;
  context.mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => {
    if (path === '/api/catalog/discovery/turn') signal = options?.signal;
    return mock(path, options);
  });
  const user = userEvent.setup();
  const view = render(page(createElement(DiscoverPage)));
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '你想完成什么？' });
  await user.type(input, '上一位访客的问题');
  await user.click(screen.getByRole('button', { name: '帮我找' }));
  await screen.findByRole('button', { name: '停止' });
  entry.viewer_key = 'second';
  view.rerender(page(createElement(DiscoverPage), 1));
  await screen.findByText(/登录状态已变化/);
  assert.equal(signal?.aborted, true);
  assert.equal(input.value, '');
  await act(async () => late.resolve(streamResult(guide)));
  assert.equal(screen.queryByText(guide.reply), null);
});

test('对话只读事件流：展示真实阶段，失败、缺失终帧或非流成功都须手动重试', async (context) => {
  let writer!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      writer = controller;
    },
  });
  const { mock, posted } = mockApi({ mode: 'dialogue', viewer_key: 'anonymous' }, [
    new Response(stream, { headers: eventHeaders }),
    new Response(catalogFrame, { headers: eventHeaders }),
    Response.json(guide),
    guide,
  ]);
  context.mock.method(globalThis, 'fetch', mock);
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '你想完成什么？' });
  await user.type(input, '找发布工具');
  await user.click(screen.getByRole('button', { name: '帮我找' }));
  const encoder = new TextEncoder();
  await act(async () => {
    writer.enqueue(encoder.encode(catalogFrame.slice(0, 9)));
    writer.enqueue(encoder.encode(catalogFrame.slice(9)));
  });
  await screen.findByText('已读取 3 个可见资源');
  await act(async () =>
    writer.enqueue(encoder.encode(frame('stage', { stage: 'writing', characters: 24 }))),
  );
  await screen.findByText('正在整理回答');
  assert(screen.getByText('24 字'));
  await act(async () => {
    writer.enqueue(
      encoder.encode(
        frame('error', {
          status: 502,
          error: {
            code: 'DISCOVERY_OUTPUT_INVALID',
            message: '回应未通过核对',
            details: {},
            retryable: false,
          },
        }),
      ),
    );
    writer.close();
  });
  for (const [index, message] of [
    '回应未通过核对',
    '回应中断，请重试',
    '事件连接不可用',
  ].entries()) {
    const alert = within(await screen.findByRole('alert'));
    assert(alert.getByText(message));
    assert.equal(input.value, '找发布工具');
    assert.equal(screen.queryByText(guide.reply), null);
    assert.equal(posted.length, index + 1);
    await user.click(alert.getByRole('button', { name: '重试' }));
  }
  await screen.findByText(guide.reply);
  assert.equal(posted.length, 4);
});

test('同名方向按所选序号展开；追问期间旧条件不抢占请求，结束后仍可按新条件查目录', async (context) => {
  const first = {
    ...guide,
    directions: [guide.directions[0], { ...guide.directions[0], intent: '核对发版记录' }],
  };
  const matches: DiscoveryTurnResponse = {
    mode: 'dialogue',
    type: 'matches',
    criteria: guide.criteria,
    context: 'direction.ctx',
    goal: null,
    reply: '找到了发版工具',
    total: 1,
    items: [secondSkill],
    partial: [],
    missing: [],
  };
  const follow = { ...matches, context: 'follow.ctx', reply: '可以用于发版前检查' };
  const late = deferred<Response>();
  const { mock, posted } = mockApi({ mode: 'dialogue', viewer_key: 'anonymous' }, [
    first,
    matches,
    late.promise,
    matches,
  ]);
  context.mock.method(globalThis, 'fetch', mock);
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  await user.type(screen.getByRole('textbox', { name: '你想完成什么？' }), '怎么准备发版？');
  await user.click(screen.getByRole('button', { name: '帮我找' }));
  await user.click(await screen.findByRole('button', { name: /核对发版记录/ }));
  await screen.findByText(matches.reply);
  assert.deepEqual(posted[1].body, {
    action: 'direction',
    expected_mode: 'dialogue',
    viewer_key: 'anonymous',
    index: 2,
    context: guide.context,
  });
  const rail = within(screen.getByRole('complementary', { name: '本轮条件' }));
  await user.click(rail.getByText('本次检索条件'));
  await user.click(rail.getByRole('button', { name: /类型.*Skill 与 MCP/ }));
  const skill = rail.getByRole('button', { name: 'Skill' });
  await user.type(screen.getByRole('textbox', { name: '继续追问' }), '何时使用？');
  await user.click(screen.getByRole('button', { name: '追问' }));
  await screen.findByRole('button', { name: '停止' });
  assert(skill.closest('[inert]'));
  // jsdom 不实现 inert 的命中测试，直接派发事件也不应越过提交点。
  fireEvent.click(skill);
  assert.equal(posted.length, 3);
  assert.equal(posted[2].body.context, matches.context);
  await act(async () => late.resolve(streamResult(follow)));
  await screen.findByText(follow.reply);
  const type = rail.getByRole('button', { name: /类型.*Skill 与 MCP/ });
  if (type.getAttribute('aria-expanded') !== 'true') await user.click(type);
  await user.click(rail.getByRole('button', { name: 'Skill' }));
  await screen.findByText(matches.reply);
  assert.deepEqual(posted[3].body, {
    action: 'filter',
    expected_mode: 'dialogue',
    viewer_key: 'anonymous',
    context: follow.context,
    criteria: { ...guide.criteria, kind: 'skill' },
  });
});

test('结果卡锁定固定版本的安装页，关键词模式不渲染助手回应', async (context) => {
  const matches: DiscoveryTurnResponse = {
    mode: 'dialogue',
    type: 'matches',
    reply: '找到 1 个发布信息能证实「接口回归测试」的资源。',
    goal: '每次发版都不太放心',
    criteria: (guide as Extract<DiscoveryTurnResponse, { mode: 'dialogue' }>).criteria,
    total: 1,
    items: [result],
    partial: [],
    missing: [],
    context: 'v1.ctx.mac',
  };
  const dialogue = mockApi({ mode: 'dialogue', viewer_key: 'anonymous' }, [matches]);
  context.mock.method(globalThis, 'fetch', dialogue.mock);
  const user = userEvent.setup();
  const view = render(page(createElement(DiscoverPage)));
  await user.type(await screen.findByRole('textbox', { name: '你想完成什么？' }), '接口回归');
  await user.click(screen.getByRole('button', { name: '帮我找' }));
  const link = await screen.findByRole('link', { name: /查看接入方式/ });
  assert.equal(
    link.getAttribute('href'),
    '/asset/http-regression-kit?version_id=11111111-1111-4111-8111-111111111111&tab=installation',
  );
  assert(within(document.body).getByText('接口回归测试'));
  assert.equal(screen.queryByRole('button', { name: /批量获取 Skill/ }), null);
  view.unmount();

  const keywords = mockApi({ mode: 'keywords', viewer_key: 'anonymous' }, [
    { mode: 'keywords', type: 'matches', total: 12, items: [result, mcp] },
  ]);
  context.mock.method(globalThis, 'fetch', keywords.mock);
  render(page(createElement(DiscoverPage)));
  await user.type(await screen.findByRole('textbox', { name: '你想完成什么？' }), '接口回归');
  await user.click(screen.getByRole('button', { name: '搜索' }));
  await screen.findByRole('article', { name: mcp.slug });
  assert(
    within(screen.getByRole('article', { name: result.slug })).getByRole('link', {
      name: '查看接入方式',
    }),
  );
  assert.equal(screen.queryByRole('button', { name: /批量获取 Skill/ }), null);
  assert.equal(screen.queryByText(/发布信息能证实/), null);
  assert(screen.getByText(/当前为关键词匹配/));
  assert.equal(screen.queryByRole('textbox', { name: '继续追问' }), null);
});

test('批量安装只复制选中的固定版本，预览、实际安装与 Agent 指令相互独立', async (context) => {
  const matches: DiscoveryTurnResponse = {
    mode: 'dialogue',
    type: 'matches',
    reply: '还可以核对部分相关的资源。',
    goal: '回归测试',
    criteria: guide.criteria,
    total: 27,
    items: [result, mcp],
    partial: [secondSkill],
    missing: [],
    context: 'match.ctx',
  };
  const { mock } = mockApi({ mode: 'dialogue', viewer_key: 'anonymous' }, [matches]);
  context.mock.method(globalThis, 'fetch', mock);
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  await user.type(await screen.findByRole('textbox', { name: '你想完成什么？' }), '回归测试');
  await user.click(screen.getByRole('button', { name: '帮我找' }));
  for (const [slug, number] of [
    [result.slug, '1'],
    [mcp.slug, '2'],
    [secondSkill.slug, '3'],
  ] as const)
    assert(within(await screen.findByRole('article', { name: slug })).getByText(number));
  await user.click(await screen.findByRole('button', { name: '批量获取 Skill（2）' }));
  const dialog = within(screen.getByRole('dialog', { name: '批量获取 Skill' }));
  assert.equal(dialog.getAllByRole('checkbox', { checked: true }).length, 2);
  const partial = dialog.getByRole('checkbox', { name: /release-notes.*含脚本.*部分匹配/ });
  assert(dialog.getByTitle(secondSkill.version_label));
  assert(dialog.getByText(/此批次不含 MCP/));
  await user.click(dialog.getByRole('radio', { name: 'CLI 安装' }));
  assert.equal(
    dialog.getByRole('link', { name: '接入与授权说明' }).getAttribute('href'),
    '/connect',
  );
  await user.click(dialog.getByRole('button', { name: /Agent 客户端/ }));
  await user.click(screen.getByRole('option', { name: 'Claude Code' }));
  const firstCommand =
    "capability-hub add 'http-regression-kit' --version '1.0.0' --url 'http://127.0.0.1:4100' --to .claude/skills";
  const secondCommand = `capability-hub add 'release-notes' --version '${secondSkill.version_label}' --url 'http://127.0.0.1:4100' --to .claude/skills`;
  await user.click(dialog.getByRole('button', { name: '复制' }));
  assert.equal(
    await navigator.clipboard.readText(),
    `${firstCommand} --dry-run\n${secondCommand} --dry-run`,
  );
  await user.click(partial);
  assert(dialog.getByText('已选 1 / 2 个 Skill'));
  await user.click(dialog.getByRole('radio', { name: '安装命令' }));
  await user.click(dialog.getByRole('button', { name: '复制' }));
  assert.equal(await navigator.clipboard.readText(), firstCommand);
  await user.click(dialog.getByRole('radio', { name: '交给 Agent' }));
  await user.click(dialog.getByRole('button', { name: '复制' }));
  const prompt = await navigator.clipboard.readText();
  assert(prompt.includes('http://127.0.0.1:4100'));
  assert(prompt.includes('get_asset_version') && prompt.includes('install_skill'));
  assert(prompt.includes(`${result.slug}@${result.version_label}`));
  assert(prompt.includes('claude-code') && prompt.includes('.claude/skills'));
  assert(!prompt.includes(result.version_id) && !prompt.includes(secondSkill.slug));
  await user.click(partial);
  await user.click(dialog.getByRole('button', { name: '复制' }));
  const batch = await navigator.clipboard.readText();
  assert.deepEqual(
    batch.split('\n').filter((line) => line.startsWith('- ')),
    [
      `- ${result.slug}@${result.version_label}`,
      `- ${secondSkill.slug}@${secondSkill.version_label}`,
    ],
  );
  assert(!batch.includes(secondSkill.version_id) && !batch.includes(mcp.slug));
  const clear = dialog.getByRole('button', { name: '清空选择' });
  await user.click(clear);
  assert.equal(document.activeElement, clear);
  assert.equal(dialog.queryByRole('button', { name: /复制/ }), null);
  await user.click(dialog.getByRole('radio', { name: 'ZIP 下载' }));
  assert(dialog.getByRole<HTMLButtonElement>('button', { name: '下载 ZIP' }).disabled);
  await user.click(dialog.getByRole('button', { name: '全选' }));
  assert.equal(dialog.getAllByRole('checkbox', { checked: true }).length, 2);
  await user.click(dialog.getByRole('radio', { name: 'CLI 安装' }));
  assert(dialog.getByRole('button', { name: /Claude Code.*Agent 客户端/ }));
});

test('关键词批量 ZIP 仅读取所选版本，失败显示拆分建议，成功才交给浏览器下载', async (context) => {
  const { mock } = mockApi({ mode: 'keywords', viewer_key: 'anonymous' }, [
    { mode: 'keywords', type: 'matches', total: 22, items: [result, secondSkill, mcp] },
  ]);
  const requests: string[][] = [];
  const first = deferred<Response>();
  const bytes = new Uint8Array([80, 75, 3, 4]);
  context.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    if (!path.startsWith('/api/catalog/skill-bundle?')) return mock(path, init);
    requests.push(new URL(path, location.origin).searchParams.getAll('version_id'));
    if (requests.length === 1) return first.promise;
    return new Response(bytes, { headers: { 'Content-Type': 'application/zip' } });
  });
  const blobs: Blob[] = [];
  const filenames: string[] = [];
  const objectUrl = 'blob:http://127.0.0.1:4100/bundle';
  context.mock.method(URL, 'createObjectURL', (blob: Blob) => {
    blobs.push(blob);
    return objectUrl;
  });
  const revoked = context.mock.method(URL, 'revokeObjectURL', () => {});
  context.mock.method(HTMLAnchorElement.prototype, 'click', function (this: HTMLAnchorElement) {
    assert.equal(this.href, objectUrl);
    filenames.push(this.download);
  });
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  await user.type(await screen.findByRole('textbox', { name: '你想完成什么？' }), '回归测试');
  await user.click(screen.getByRole('button', { name: '搜索' }));
  await user.click(await screen.findByRole('button', { name: '批量获取 Skill（2）' }));
  const dialog = within(screen.getByRole('dialog', { name: '批量获取 Skill' }));
  const download = dialog.getByRole<HTMLButtonElement>('button', { name: '下载 ZIP' });
  await user.dblClick(download);
  assert.equal(download.getAttribute('aria-disabled'), 'true');
  assert.equal(document.activeElement, download);
  assert.deepEqual(requests, [[result.version_id, secondSkill.version_id]]);
  await act(async () => {
    first.resolve(
      Response.json(
        { error: { code: 'SKILL_BUNDLE_TOO_LARGE', message: '所选版本超过 100 MiB，请拆分下载' } },
        { status: 413 },
      ),
    );
  });
  assert.match(dialog.getByRole('alert').textContent ?? '', /请拆分下载/);
  assert.deepEqual(filenames, []);
  await user.click(dialog.getByRole('checkbox', { name: /http-regression-kit/ }));
  await user.click(download);
  await waitFor(() => assert.deepEqual(filenames, ['capability-hub-skills.zip']));
  assert.deepEqual(requests[1], [secondSkill.version_id]);
  assert.deepEqual(new Uint8Array(await blobs[0].arrayBuffer()), bytes);
  await waitFor(() =>
    assert.deepEqual(
      revoked.mock.calls.map((call) => call.arguments),
      [[objectUrl]],
    ),
  );
});

test('关闭批量面板或更换身份会取消下载，迟到的 ZIP 不落盘', async (context) => {
  const entry = { mode: 'keywords' as const, viewer_key: 'first' };
  const { mock } = mockApi(entry, [
    { mode: 'keywords', type: 'matches', total: 2, items: [result, secondSkill] },
  ]);
  const downloads = [deferred<Response>(), deferred<Response>()];
  const signals: (AbortSignal | null | undefined)[] = [];
  context.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    if (!path.startsWith('/api/catalog/skill-bundle?')) return mock(path, init);
    signals.push(init?.signal);
    return downloads[signals.length - 1].promise;
  });
  const save = context.mock.method(HTMLAnchorElement.prototype, 'click', () => {});
  const user = userEvent.setup();
  const view = render(page(createElement(DiscoverPage)));
  await user.type(await screen.findByRole('textbox', { name: '你想完成什么？' }), '回归测试');
  await user.click(screen.getByRole('button', { name: '搜索' }));
  const open = await screen.findByRole('button', { name: '批量获取 Skill（2）' });
  await user.click(open);
  await user.click(screen.getByRole('checkbox', { name: /release-notes/ }));
  await user.click(screen.getByRole('button', { name: '下载 ZIP' }));
  await user.click(screen.getByRole('button', { name: '关闭' }));
  assert.equal(signals[0]?.aborted, true);
  await user.click(open);
  const reopened = within(screen.getByRole('dialog', { name: '批量获取 Skill' }));
  assert.equal(reopened.getAllByRole('checkbox', { checked: true }).length, 2);
  await user.click(screen.getByRole('button', { name: '下载 ZIP' }));
  entry.viewer_key = 'second';
  view.rerender(page(createElement(DiscoverPage), 1));
  await screen.findByText(/登录状态已变化/);
  assert.equal(signals[1]?.aborted, true);
  assert.equal(screen.queryByRole('dialog', { name: '批量获取 Skill' }), null);
  assert.equal(screen.queryByRole('button', { name: /批量获取 Skill/ }), null);
  await act(async () => {
    for (const download of downloads)
      download.resolve(new Response('late', { headers: { 'Content-Type': 'application/zip' } }));
  });
  assert.equal(save.mock.callCount(), 0);
});

test('没有开场提示时列出目录里的常见主题，点击只填入不发送', async (context) => {
  const { mock, posted } = mockApi({ mode: 'dialogue', viewer_key: 'anonymous' }, [], {
    total: 2,
    keywords: ['接口回归'],
  });
  context.mock.method(globalThis, 'fetch', mock);
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  await user.click(await screen.findByRole('button', { name: '接口回归' }));
  const input = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '你想完成什么？' });
  assert.equal(input.value, '接口回归');
  assert.equal(document.activeElement, input);
  assert.equal(posted.length, 0);
});

test('目录清除关键词后可以接着输入，不清除分类，也不截断输入法组合', async (context) => {
  const { mock, posted } = mockApi({ mode: 'dialogue', viewer_key: 'anonymous' }, [], {
    total: 2,
    keywords: [],
  });
  context.mock.method(globalThis, 'fetch', mock);
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  const directory = within(await screen.findByRole('region', { name: '资源目录' }));
  const field = directory.getByRole<HTMLInputElement>('searchbox', { name: '按关键词搜索目录' });
  const category = directory.getByRole('button', { name: /未分类/ });
  await user.click(category);
  await user.type(field, 'Java');
  await directory.findByRole('heading', { name: /搜索结果/ });
  fireEvent.keyDown(field, { key: 'Escape', isComposing: true });
  assert.equal(field.value, 'Java');
  await user.click(directory.getByRole('button', { name: '清除关键词' }));
  await directory.findByRole('heading', { name: /资源目录/ });
  assert.equal(document.activeElement, field);
  assert.equal(field.value, '');
  await user.keyboard('JUnit{Escape}');
  assert.equal(field.value, '');
  assert.equal(category.getAttribute('aria-pressed'), 'true');
  assert.equal(posted.length, 0);
});

test('目录对访客为空时给出登录入口，不再列出全是零的分类筛选', async (context) => {
  const { mock } = mockApi({ mode: 'dialogue', viewer_key: 'anonymous' }, []);
  context.mock.method(globalThis, 'fetch', mock);
  render(page(createElement(DiscoverPage)));
  assert(await screen.findByRole('link', { name: '登录查看团队资源' }));
  assert.equal(screen.queryByRole('group', { name: '分类筛选' }), null);
  assert.equal(screen.queryByRole('button', { name: /浏览资源目录/ }), null);
});

test('快捷追问只填入，发送时沿用上轮上下文；顶部重新查找不沿用上下文', async (context) => {
  const first: DiscoveryTurnResponse = {
    mode: 'dialogue',
    type: 'matches',
    reply: '有可用于接口回归的版本。',
    goal: '接口回归',
    criteria: guide.criteria,
    context: 'first.ctx',
    total: 1,
    items: [result],
    partial: [],
    missing: [],
  };
  const follow: DiscoveryTurnResponse = {
    mode: 'dialogue',
    type: 'reference',
    reply: '它能验证 HTTP 接口。',
    goal: first.goal,
    criteria: first.criteria,
    context: 'second.ctx',
    item: result,
  };
  const { mock, posted } = mockApi({ mode: 'dialogue', viewer_key: 'anonymous' }, [
    first,
    follow,
    guide,
  ]);
  context.mock.method(globalThis, 'fetch', mock);
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  const top = await screen.findByRole<HTMLTextAreaElement>('textbox', { name: '你想完成什么？' });
  await user.type(top, '找接口测试');
  await user.click(screen.getByRole('button', { name: '帮我找' }));
  await user.click(await screen.findByRole('button', { name: '第一个适合我吗？' }));
  const input = screen.getByRole<HTMLInputElement>('textbox', { name: '继续追问' });
  assert.equal(document.activeElement, input);
  assert.equal(input.value, '第一个适合我吗？');
  assert.equal(posted.length, 1);
  await user.click(screen.getByRole('button', { name: '追问' }));
  await screen.findByText(follow.reply);
  assert.equal(posted[1].body.context, first.context);
  assert.equal(top.value, '找接口测试');
  await user.click(screen.getByRole('button', { name: '换个问法' }));
  assert.equal(document.activeElement, top);
  assert.equal(top.value, '第一个适合我吗？');
  await user.clear(top);
  await user.type(top, '找文档生成工具');
  await user.click(screen.getByRole('button', { name: '帮我找' }));
  await screen.findByText(guide.reply);
  assert.equal(posted[2].body.text, '找文档生成工具');
  assert.equal(Object.hasOwn(posted[2].body, 'context'), false);
});

test('目录卡只为声明需密钥的 Skill 显示 API Key 提示', async (context) => {
  const fixture = await createTestHub(context);
  const { intake } = await publishSkill(fixture, { slug: 'keyed-skill' });
  await publishSkill(fixture, { slug: 'offline-skill' });
  const keyed = await fixture.hub.catalog.getDetail(fixture.admin, intake.asset_id);
  await fixture.hub.lifecycle.updateUsage(
    fixture.admin,
    keyed.asset_id,
    { requires_api_key: true },
    `"${keyed.revision}"`,
  );
  const { mock } = mockApi({ mode: 'keywords', viewer_key: 'anonymous' }, []);
  context.mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => {
    if (path.startsWith('/api/assets?'))
      return Response.json(await fixture.hub.catalog.search(null, {}));
    return mock(path, options);
  });
  render(page(createElement(DiscoverPage)));
  const directory = within(screen.getByRole('region', { name: '资源目录' }));
  const keyedCard = await directory.findByRole('link', { name: /keyed-skill/ });
  const offlineCard = directory.getByRole('link', { name: /offline-skill/ });
  assert(within(keyedCard).getByText('需 API Key'));
  assert.equal(within(offlineCard).queryByText(/API Key/), null);
});

test('减少动态效果时，进入目录和翻页均立即定位并聚焦目录标题', async (context) => {
  const { mock } = mockApi({ mode: 'keywords', viewer_key: 'anonymous' }, []);
  context.mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => {
    if (path.startsWith('/api/assets?'))
      return Response.json({
        items: [],
        total: 25,
        counts: {},
        next_cursor: path.includes('cursor=') ? null : 'page-two',
      });
    return mock(path, options);
  });
  const scroll = context.mock.method(HTMLElement.prototype, 'scrollIntoView', () => {});
  const user = userEvent.setup();
  render(page(createElement(DiscoverPage)));
  for (const button of [/浏览资源目录/, /下一页/]) {
    const heading = screen.getByRole('heading', { name: /资源目录/ });
    await user.click(await screen.findByRole('button', { name: button }));
    assert.equal(document.activeElement, heading);
    const call = scroll.mock.calls.at(-1);
    assert.equal(call?.this, heading);
    assert.deepEqual(call?.arguments, [{ behavior: 'instant', block: 'start' }]);
  }
});
