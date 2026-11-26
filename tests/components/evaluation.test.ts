import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test, type TestContext } from 'node:test';
import { createElement, Fragment, useState } from 'react';
import {
  act,
  cleanup,
  isInaccessible,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type {
  EvaluationResponse,
  EvaluationSummaryResponse,
  ManagementEvaluationsResponse,
  ReviewEvaluationResponse,
} from '@capability-hub/contracts';
import { EvaluationCardSummary } from '../../apps/web/src/features/evaluation/EvaluationCardSummary.js';
import { EvaluationPanel } from '../../apps/web/src/features/evaluation/EvaluationPanel.js';
import { EvaluationStrip } from '../../apps/web/src/features/evaluation/EvaluationStrip.js';
import { deferred } from '../support/store.js';

afterEach(cleanup);

type Evaluation = NonNullable<EvaluationResponse['evaluation']>;
type Detail = ManagementEvaluationsResponse['items'][number];
const key = 'sha256:' + 'a'.repeat(64);
const rubric = '2026-11-24.3';
const versionId = 'evaluated-version';
const managementPath = '/api/management/versions/' + versionId + '/evaluations';
const reviewPath = '/api/publication-requests/approval/evaluation';
const assessedAt = '2026-11-24T08:00:00.000Z';

const dimensions: Evaluation['dimensions'] = [
  {
    id: 'structure',
    label: '结构规范',
    status: 'scored',
    score: 91,
    band: 'excellent',
    confidence: 'high',
    checks: [{ id: 'structure.body_lines', label: '正文篇幅', verdict: 'pass' }],
  },
  {
    id: 'triggering',
    label: '触发准确',
    status: 'scored',
    score: 88,
    band: 'excellent',
    confidence: 'medium',
    checks: [{ id: 'triggering.should_hit', label: '应触发命中', verdict: 'partial' }],
  },
  {
    id: 'instructions',
    label: '指令质量',
    status: 'scored',
    score: 65,
    band: 'fair',
    confidence: 'medium',
    checks: [{ id: 'instructions.concrete_examples', label: '具体示例', verdict: 'partial' }],
  },
  {
    id: 'effectiveness',
    label: '任务效果',
    status: 'scored',
    score: 37,
    band: 'weak',
    confidence: 'low',
    checks: [{ id: 'effectiveness.pass_with', label: '带 Skill 断言通过率', verdict: 'partial' }],
  },
  {
    id: 'transparency',
    label: '边界透明',
    status: 'scored',
    score: 72,
    band: 'good',
    confidence: 'medium',
    checks: [{ id: 'transparency.requirements', label: '环境与依赖', verdict: 'pass' }],
  },
];

function result(scored = 5, extra: Partial<Evaluation> = {}): Evaluation {
  return {
    id: 'result',
    version_id: versionId,
    version_label: '2.0.0',
    rubric_version: rubric,
    scan_ruleset: null,
    comparable_key: key,
    state: 'succeeded',
    evaluated_at: assessedAt,
    limitations: ['scripts_not_executed', 'paper_run_only'],
    dimensions: dimensions.map((d, index) =>
      index < scored
        ? { ...d }
        : { ...d, status: 'pending', score: null, band: null, confidence: null, checks: [] },
    ),
    ...extra,
  };
}

function publicView(
  evaluation: Evaluation | null,
  extra: Partial<EvaluationResponse> = {},
): EvaluationResponse {
  return {
    evaluation,
    baseline: null,
    current_rubric_version: rubric,
    updating: false,
    comparison_status: 'none',
    can_view_details: false,
    can_request: false,
    ...extra,
  };
}

function detailedDimensions(rows: Evaluation['dimensions']): Detail['dimensions'] {
  return rows.map((d) => ({ ...d, checks: d.checks.map((check) => ({ ...check, evidence: [] })) }));
}

function detail(extra: Partial<Detail> = {}): Detail {
  const summary = result();
  return {
    ...summary,
    asset_id: 'asset',
    content_digest: key,
    scope: 'full',
    trigger: 'submission',
    requested_by: null,
    priority: 100,
    evaluator_digest: key,
    subject_digest: key,
    audience_class: 'public',
    requires_api_key: false,
    scan_ruleset: '2026-11-24.1',
    context: null,
    cases: null,
    active_job_id: null,
    reused_from: null,
    requested_at: assessedAt,
    stages: [
      { id: 'static', state: 'succeeded' },
      { id: 'instructions', state: 'succeeded' },
    ],
    revision: 1,
    dimensions: detailedDimensions(summary.dimensions),
    ...extra,
  };
}

function history(
  items: Detail[],
  extra: Partial<ManagementEvaluationsResponse> = {},
): ManagementEvaluationsResponse {
  return {
    items,
    current_rubric_version: rubric,
    model_enabled: true,
    can_request: false,
    next_window_at: null,
    ...extra,
  };
}

function mockRead(t: TestContext, path: string, response: unknown) {
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    assert.equal(input, path);
    return Response.json(response);
  });
}

function publicPanel(published: EvaluationResponse) {
  return createElement(EvaluationPanel, { kind: 'asset', versionId, published });
}

function intakePanel() {
  return createElement(EvaluationPanel, { kind: 'intake', versionId });
}

test('卡片只画现行评分雷达，保留零分和缺轴，不显示项数或占位说明', () => {
  const card = (dimensions: EvaluationSummaryResponse['dimensions']) =>
    createElement(EvaluationCardSummary, { evaluation: { dimensions } });
  const structure = { id: 'structure', score: 96, band: 'excellent', confidence: 'high' } as const;
  const instructions = { id: 'instructions', score: 0, band: 'weak', confidence: 'high' } as const;
  const view = render(createElement(EvaluationCardSummary, {}));
  assert.equal(view.container.firstElementChild, null);
  view.rerender(card([instructions, structure]));
  assert.equal(view.container.firstElementChild, null);
  view.rerender(card([{ ...instructions, id: 'transparency' }, instructions, structure]));
  const chart = screen.getByRole('img', {
    name: /质量评测雷达图：结构规范 96 分.*触发准确无评分.*指令质量 0 分/,
  });
  assert.equal(view.container.textContent, '');
  assert(chart.querySelector('svg line[stroke-dasharray]'));
  assert(!screen.queryByRole('button'));
  assert(!screen.queryByRole('link'));
});

test('摘要条区分缺项、不适用和样本不足，同时标明部分完成与评测时间', () => {
  const data = result(5, {
    state: 'partial',
    dimensions: [
      dimensions[3],
      { ...dimensions[0], status: 'not_applicable', score: null, band: null, confidence: null },
      { ...dimensions[2], status: 'insufficient', score: null, band: null, confidence: null },
    ],
  });
  render(createElement(EvaluationStrip, { published: publicView(data), onOpen: () => {} }));
  const strip = within(screen.getByRole('region', { name: '质量评测摘要' }));
  assert(strip.getByText('部分完成'));
  assert(strip.getByText('2026-11-24'));
  const list = strip.getByLabelText('五维读数');
  assert.deepEqual(
    [...list.querySelectorAll('dt')].map((term) => [
      term.textContent,
      term.nextElementSibling?.textContent,
    ]),
    [
      ['结构规范', '不适用'],
      ['触发准确', '未评估'],
      ['指令质量', '样本不足'],
      ['任务效果', '37 分薄弱低置信度'],
      ['边界透明', '未评估'],
    ],
  );
});

test('公开结果不足三项时清单保留分数和缺失状态，达到三项才出现带文字摘要的雷达', async () => {
  const view = render(publicPanel(publicView(result(2))));
  const structure = await screen.findByRole('button', { name: /结构规范.*91.*优秀/ });
  assert(within(screen.getByRole('list', { name: '未评估维度' })).getByText('任务效果'));
  assert(!screen.queryByRole('button', { name: /任务效果/ }));
  assert(!screen.queryByRole('figure'));
  await userEvent.setup().click(structure);
  const checks = screen.getByRole('list', { name: /结构规范/ });
  assert.match(checks.textContent ?? '', /正文篇幅.*满足/);
  view.rerender(publicPanel(publicView(result(3))));
  const figure = await screen.findByRole('figure');
  assert.match(figure.textContent ?? '', /3\s*项.*已评|已评.*3\s*项/);
});

test('公开读者能读到低置信度和方法局限，不能展开维护者证据、用例或发起新评测', async () => {
  const user = userEvent.setup();
  render(publicPanel(publicView(result())));
  await screen.findByRole('button', { name: /任务效果/ });
  assert(
    screen.getAllByText(/低置信度|置信度[：:\s]*低/).some((element) => !isInaccessible(element)),
  );
  assert(!screen.queryByRole('button', { name: /评测此版本|重试失败阶段|按新标准评测/ }));
  assert(!screen.queryByRole('button', { name: /改进建议|评测用例/ }));
  assert(!screen.queryByRole('link', { name: '下载迭代包' }));
  await user.click(screen.getByRole('button', { name: '评测方法与局限' }));
  const note = await screen.findByRole('dialog');
  for (const statement of [
    /纸面推演/,
    /不执行脚本/,
    /不.{0,4}安全认证/,
    /不影响审核.{0,4}分发/,
    /波动/,
    /路由.*客户端|客户端.*路由/,
  ]) {
    assert.match(note.textContent ?? '', statement);
  }
});

test('任务效果收起时可见增益和置信度，展开后可对照两组通过率与覆盖限制', async () => {
  const evaluation = result();
  evaluation.dimensions = evaluation.dimensions.map((d) =>
    d.id === 'effectiveness'
      ? {
          ...d,
          score: 100,
          band: 'excellent',
          metrics: { pass_with: 1, pass_without: 0.95, uplift_pp: 5, normalized_gain: 1 },
          flags: ['coverage_limited', 'limited_uplift'],
        }
      : d,
  );
  const user = userEvent.setup();
  render(publicPanel(publicView(evaluation)));
  const row = screen.getByRole('button', { name: /任务效果.*低置信度.*\+5 pp.*增益有限.*100/ });
  assert(screen.getByText('1 个维度材料覆盖受限'));
  assert(!screen.queryByText('带 Skill 通过率'));
  row.focus();
  await user.keyboard('{Enter}');
  assert.equal(row.getAttribute('aria-expanded'), 'true');
  assert(screen.getByText('材料覆盖受限'));
  for (const [label, value] of [
    ['带 Skill 通过率', '100%'],
    ['无 Skill 通过率', '95%'],
    ['归一化增益', '1'],
  ]) {
    assert.equal(screen.getByText(label).nextElementSibling?.textContent, value);
  }
  await user.keyboard('{Enter}');
  assert.equal(row.getAttribute('aria-expanded'), 'false');
  assert(!screen.queryByText('带 Skill 通过率'));
});

test('同一 Git 版本的评分一致时不叠两条曲线，完整标识按需展开', async () => {
  const version = `git.${'7e1ca32e'.repeat(5)}.sed7ecb10-7234-478c-b602-2b955c69b336.r5`;
  const data = result(5, { version_label: version });
  const published = publicView(data, {
    comparison_status: 'available',
    baseline: {
      version_label: version,
      dimensions: data.dimensions.map(({ id, score }) => ({ id, score })).reverse(),
    },
  });
  render(publicPanel(published));
  const comparison = within(await screen.findByRole('figure'));
  assert(comparison.getByText('与上一发布评分一致'));
  assert(!comparison.queryByRole('button', { name: /对比/ }));
  assert(!screen.queryByText(/^对比版本 /));
  const summary = screen.getByText('Git 7e1ca32e · r5', { selector: 'summary' });
  const disclosure = summary.closest('details');
  assert(disclosure && !disclosure.open);
  await userEvent.setup().click(summary);
  assert(disclosure.open);
  assert(within(disclosure).getByText(version, { selector: 'code' }));
});

test('同一版本标签仍能比较不同读数，新增评分与原来的零分分别展示', async () => {
  const data = result(4);
  const published = publicView(data, {
    comparison_status: 'available',
    baseline: {
      version_label: data.version_label,
      dimensions: [
        { id: 'structure', score: 0 },
        { id: 'triggering', score: 88 },
        { id: 'effectiveness', score: 37 },
        { id: 'transparency', score: 72 },
      ],
    },
  });
  render(publicPanel(published));
  const toggle = await screen.findByRole('button', { name: '对比上一发布', pressed: true });
  assert(screen.getByText('对比版本 0 分'));
  assert(screen.getByText('对比版本无评分'));
  assert(screen.getByText('对比版本 72 分'));
  assert(!screen.queryByText('对比版本 88 分'));
  const user = userEvent.setup();
  await user.click(toggle);
  assert(!screen.queryByText(/^对比版本/));
  await user.click(toggle);
  assert(screen.getByText('对比版本 0 分'));
});

test('提交缩写和修订相同但来源不同的 Git 版本仍能分别识别', () => {
  const version = `git.${'a'.repeat(64)}.s11111111-7234-478c-b602-2b955c69b336.r5`;
  const data = result(1, { version_label: version });
  const published = publicView(data, {
    comparison_status: 'available',
    baseline: {
      version_label: version.replace('s11111111', 's22222222'),
      dimensions: [{ id: 'structure', score: 91 }],
    },
  });
  render(publicPanel(published));
  assert(screen.getByText('Git aaaaaaaa · s11111111 · r5', { selector: 'summary' }));
  assert(screen.getByText('Git aaaaaaaa · s22222222 · r5', { selector: 'summary' }));
});

test('旧结果在更新期间仍可读，旧标准与不可比较的原因用文字显示', async () => {
  const view = render(publicPanel(publicView(result(), { updating: true })));
  await screen.findByText(/正在更新/);
  assert(screen.getByRole('button', { name: /结构规范/ }));
  view.rerender(
    publicPanel(
      publicView(result(5, { rubric_version: '2026-11-24.2' }), {
        comparison_status: 'incomparable',
      }),
    ),
  );
  await screen.findByText(/旧评测标准/);
  assert(screen.getByText(/评测标准不同[，,、。]?不可比较/));
  assert(!screen.queryByRole('button', { name: '按新标准评测' }));
});

test('读者失去维护明细权限后，已展开的私有用例随当前权限收起', async (t) => {
  const privateResult = detail({
    cases: {
      trigger: [],
      tasks: [
        {
          id: 'handover',
          origin: 'author',
          prompt: '整理内部交接清单',
          expected: '交接项',
          assertions: ['列条件', '列步骤', '列负责人'],
        },
      ],
    },
  });
  const published = publicView(result(), { can_view_details: true });
  const resume = deferred<Response>();
  let permission: 'allowed' | 'denied' | 'pending' = 'allowed';
  t.mock.method(globalThis, 'fetch', async () => {
    if (permission === 'pending') return resume.promise;
    if (permission === 'denied')
      return Response.json(
        { error: { code: 'FORBIDDEN', message: '无维护权限' } },
        { status: 403 },
      );
    return Response.json(history([privateResult]));
  });
  const view = render(publicPanel(published));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: /评测用例/ }));
  assert(screen.getByText(/整理内部交接清单/));
  assert.equal(
    screen.getByRole('link', { name: '下载迭代包' }).getAttribute('href'),
    managementPath + '/result/iteration.zip?view=published',
  );
  permission = 'denied';
  view.rerender(
    createElement(EvaluationPanel, { kind: 'asset', versionId, published, refresh: 1 }),
  );
  assert(await screen.findByRole('alert'));
  assert(!screen.queryByRole('button', { name: /评测用例/ }));
  assert(!screen.queryByRole('link', { name: '下载迭代包' }));
  permission = 'pending';
  view.rerender(
    createElement(EvaluationPanel, { kind: 'asset', versionId, published, refresh: 2 }),
  );
  assert(!screen.queryByText(/整理内部交接清单/));
  assert(!screen.queryByRole('button', { name: /评测用例/ }));
  assert(!screen.queryByRole('link', { name: '下载迭代包' }));
  await act(async () => resume.resolve(Response.json(history([privateResult]))));
  await user.click(await screen.findByRole('button', { name: /评测用例/ }));
  assert(screen.getByText(/整理内部交接清单/));
  view.rerender(publicPanel(publicView(result(), { can_view_details: false })));
  await waitFor(() => assert(!screen.queryByText(/整理内部交接清单/)));
  assert(!screen.queryByRole('button', { name: /评测用例/ }));
  assert(!screen.queryByRole('link', { name: '下载迭代包' }));
  assert(screen.getByRole('figure'));
});

test('发布页只显示服务器选定的评测与最近尝试，首轮失败也保留原因', async (t) => {
  const candidate = detail({ requires_api_key: true });
  const pending = detail({
    id: 'released-attempt',
    state: 'running',
    stages: [],
    dimensions: detailedDimensions(result(0).dimensions),
  });
  let rows = [candidate, pending];
  const nextWindow = '2026-11-25T00:00:00.000Z';
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json(history(rows, { can_request: true, next_window_at: nextWindow })),
  );
  const published = publicView(null, { can_request: true, can_view_details: true });
  const view = render(publicPanel(published));
  await screen.findByRole('button', { name: '评测此版本' });
  assert(screen.getByText('尚未评测'));
  assert(!screen.queryByRole('figure'));
  assert(!screen.queryByRole('button', { name: '评测用例' }));
  const first = { ...published, can_request: false, latest_attempt_id: pending.id, updating: true };
  view.rerender(publicPanel(first));
  assert(await screen.findByText('评测中'));
  assert(!screen.queryByRole('link', { name: '下载迭代包' }));
  assert(!screen.queryByRole('figure'));
  assert(!screen.queryByText(/下一额度窗口/));
  view.rerender(publicPanel({ ...first, next_window_at: nextWindow }));
  assert(screen.getByText('2026-11-25 00:00 UTC'));
  rows = [candidate, { ...pending, state: 'failed', failure_code: 'BLOB_MISSING' }];
  view.rerender(
    createElement(EvaluationPanel, {
      kind: 'asset',
      versionId,
      published: { ...first, updating: false },
      refresh: 1,
    }),
  );
  await screen.findByText(/评测失败.*BLOB_MISSING/);
  assert(!screen.queryByRole('figure'));
  assert(!screen.queryByRole('link', { name: '下载迭代包' }));
});

test('审核重试携带候选申请，响应丢失后复用同一个幂等键', async (t) => {
  const attempts: { key: string | null; body: unknown }[] = [];
  const candidate = detail({ state: 'partial' });
  t.mock.method(globalThis, 'fetch', async (path: string, init: RequestInit) => {
    if (path === reviewPath)
      return Response.json({
        current: null,
        candidate,
        regressions: [],
        current_rubric_version: rubric,
        model_enabled: true,
        can_request: true,
        next_window_at: null,
      });
    assert.equal(path, managementPath);
    assert.equal(init.method, 'POST');
    attempts.push({
      key: new Headers(init.headers).get('Idempotency-Key'),
      body: JSON.parse(String(init.body)),
    });
    if (attempts.length === 1) throw new TypeError('评测回执丢失');
    return Response.json(
      {
        evaluation: {
          id: 'retried',
          version_id: versionId,
          scope: 'full',
          state: 'queued',
          reused_from: null,
        },
        reused: false,
      },
      { status: 202 },
    );
  });
  const user = userEvent.setup();
  render(createElement(EvaluationPanel, { kind: 'review', versionId, requestId: 'approval' }));
  await user.click(await screen.findByRole('button', { name: '重试失败阶段' }));
  assert(await screen.findByText('评测回执丢失'));
  await user.click(screen.getByRole('button', { name: '重试失败阶段' }));
  assert(await screen.findByText('评测请求已受理'));
  assert.ok(attempts[0]?.key);
  assert.deepEqual(
    attempts,
    Array(2).fill({
      key: attempts[0].key,
      body: { publication_request_id: 'approval' },
    }),
  );
});

test('新登记的静态结果保留同标准已完成的完整评测，即使它仅部分完成', async (t) => {
  const partial = detail({ state: 'partial' });
  mockRead(
    t,
    managementPath,
    history(
      [
        detail({
          id: 'new-static',
          scope: 'static',
          dimensions: detailedDimensions(result(1).dimensions),
        }),
        partial,
      ],
      { can_request: true },
    ),
  );
  render(intakePanel());
  assert(await screen.findByRole('figure'));
  assert(screen.getByText('部分完成'));
  assert(screen.getByRole('button', { name: '重试失败阶段' }));
  assert.equal(
    screen.getByRole('link', { name: '下载迭代包' }).getAttribute('href'),
    managementPath + '/result/iteration.zip',
  );
});

test('慢速进度读取不会被轮询中止，暂时失败后仍取得完成结果', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const slow = deferred<Response>();
  const pending = detail({
    state: 'running',
    dimensions: detailedDimensions(result(1).dimensions),
  });
  let reads = 0;
  let signal: AbortSignal | null | undefined;
  t.mock.method(globalThis, 'fetch', async (_path: string, init: RequestInit) => {
    reads++;
    if (reads === 1) return Response.json(history([pending]));
    if (reads === 2) {
      signal = init.signal;
      return slow.promise;
    }
    return Response.json(history([detail()]));
  });
  const advance = () =>
    act(async () => {
      t.mock.timers.tick(5000);
    });
  render(intakePanel());
  await act(async () => {});
  assert(screen.getByText('评测中'));
  await advance();
  assert.ok(signal);
  await advance();
  assert.equal(signal.aborted, false);
  await act(async () =>
    slow.resolve(Response.json({ error: { code: 'BUSY', message: '稍后可用' } }, { status: 503 })),
  );
  assert(screen.getByRole('alert'));
  await advance();
  assert(screen.getByRole('figure'));
  assert(!screen.queryByRole('alert'));
});

test('首次进度读取暂时失败时仍会重读，取得进行中的评测', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async () =>
    ++reads === 1
      ? Response.json({ error: { code: 'BUSY', message: '稍后可用' } }, { status: 503 })
      : Response.json(
          history([
            detail({ state: 'running', dimensions: detailedDimensions(result(1).dimensions) }),
          ]),
        ),
  );
  render(intakePanel());
  await act(async () => {});
  assert(screen.getByRole('alert'));
  await act(async () => {
    t.mock.timers.tick(5000);
  });
  assert(screen.getByText('评测中'));
  assert(!screen.queryByRole('alert'));
});

test('维护页尚无评测时，仅在允许发起且额度可用时显示操作', async (t) => {
  let body = history([]);
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, managementPath);
    return Response.json(body);
  });
  const view = render(createElement(EvaluationPanel, { kind: 'intake', versionId, refresh: 0 }));
  await screen.findByText(/尚未评测/);
  assert(!screen.queryByRole('button', { name: '评测此版本' }));
  body = history([], { can_request: true });
  view.rerender(createElement(EvaluationPanel, { kind: 'intake', versionId, refresh: 1 }));
  await screen.findByRole('button', { name: '评测此版本' });
  body = history([], { can_request: false, next_window_at: '2026-11-25T00:00:00.000Z' });
  view.rerender(createElement(EvaluationPanel, { kind: 'intake', versionId, refresh: 2 }));
  await waitFor(() => assert(!screen.queryByRole('button', { name: '评测此版本' })));
});

test('手动评测提交给所见固定版本，受理后面板显示该版本的排队记录', async (t) => {
  let registered = false;
  t.mock.method(globalThis, 'fetch', async (path: string, init?: RequestInit) => {
    assert.equal(path, managementPath);
    if (init?.method === 'POST') {
      registered = true;
      return Response.json(
        {
          evaluation: {
            id: 'queued',
            version_id: versionId,
            scope: 'full',
            state: 'queued',
            reused_from: null,
          },
          reused: false,
        },
        { status: 202 },
      );
    }
    const queued = detail({
      id: 'queued',
      state: 'queued',
      evaluated_at: null,
      dimensions: detailedDimensions(result(0).dimensions),
      stages: [
        { id: 'static', state: 'pending' },
        { id: 'instructions', state: 'pending' },
      ],
    });
    return Response.json(history(registered ? [queued] : [], { can_request: !registered }));
  });
  const user = userEvent.setup();
  render(intakePanel());
  await user.click(await screen.findByRole('button', { name: '评测此版本' }));
  await screen.findByText(/0\s*\/\s*2|(?:2\s*个阶段|2\s*项).*0/);
  assert(!screen.queryByText('评测请求已受理'));
  assert(!screen.queryByRole('button', { name: '评测此版本' }));
});

test('评测权限字段格式无效时显示读取错误，并隐藏手动操作', async (t) => {
  mockRead(t, managementPath, { ...history([]), can_request: 'true' });
  render(intakePanel());
  const error = await screen.findByRole('alert');
  assert.match(error.textContent ?? '', /评测|数据|响应/);
  assert(!screen.queryByRole('button', { name: '评测此版本' }));
});

test('只完成静态结构的版本显示结构清单和模型未启用提示', async (t) => {
  const staticResult = result(1, { limitations: ['static_only', 'scripts_not_executed'] });
  mockRead(
    t,
    managementPath,
    history(
      [
        detail({
          scope: 'static',
          evaluator_digest: null,
          limitations: staticResult.limitations,
          dimensions: detailedDimensions(staticResult.dimensions),
          stages: [{ id: 'static', state: 'succeeded' }],
        }),
      ],
      { model_enabled: false },
    ),
  );
  render(intakePanel());
  await screen.findByText(/模型评测未启用/);
  assert(screen.getByRole('button', { name: /结构规范/ }));
  assert(!screen.queryByRole('figure'));
});

test('排队阶段显示实际进度和等待额度窗口，不能把未评维度展示为零分', async (t) => {
  const pending = detail({
    id: 'in-flight',
    state: 'running',
    evaluated_at: null,
    active_job_id: 'job',
    stages: [
      { id: 'static', state: 'succeeded' },
      { id: 'instructions', state: 'pending' },
    ],
    dimensions: detailedDimensions(result(1).dimensions),
  });
  mockRead(t, managementPath, history([pending], { next_window_at: '2026-11-25T00:00:00.000Z' }));
  render(intakePanel());
  await screen.findByText(/1\s*\/\s*2|2\s*个阶段.*1|2\s*项.*1/);
  const progress = screen.getByRole('progressbar', { name: '评测阶段进度' });
  assert.equal(progress.getAttribute('aria-valuenow'), '1');
  assert.equal(progress.getAttribute('aria-valuemax'), '2');
  assert.deepEqual(
    within(screen.getByRole('list', { name: '待评测维度' }))
      .getAllByRole('listitem')
      .map((item) => item.textContent),
    ['触发准确', '指令质量', '任务效果', '边界透明'],
  );
  assert(!screen.queryByRole('button', { name: /触发准确|指令质量|任务效果|边界透明/ }));
  assert(screen.getByText(/下一.*窗口|额度.*(?:不足|已用尽|耗尽|恢复)/));
  assert(screen.getByText(/2026-11-25\s+00:00\s+UTC/));
  assert(!screen.queryByRole('figure'));
  assert(!screen.queryByText(/^0\s*分$/));
});

test('尚未分配阶段的排队记录只展示等待状态', async (t) => {
  mockRead(
    t,
    managementPath,
    history([
      detail({
        state: 'queued',
        evaluated_at: null,
        stages: [],
        dimensions: detailedDimensions(result(0).dimensions),
      }),
    ]),
  );
  render(intakePanel());
  await screen.findByText('已排队');
  assert(!screen.queryByRole('progressbar'));
  assert(!screen.queryByText(/0\s*\/\s*0/));
  assert.equal(
    within(screen.getByRole('list', { name: '待评测维度' })).getAllByRole('listitem').length,
    5,
  );
});

test('部分完成保留可用分数，维护者看到失败阶段、错误码与重试入口', async (t) => {
  const partial = detail({
    state: 'partial',
    stages: [
      { id: 'static', state: 'succeeded' },
      { id: 'instructions', state: 'failed', failure_code: 'AI_OUTPUT_INVALID' },
      { id: 'task-run-1', state: 'failed', failure_code: 'AI_NOT_FOUND' },
    ],
    dimensions: detail().dimensions.map((d) =>
      d.id === 'instructions'
        ? {
            ...d,
            status: 'failed',
            score: null,
            band: null,
            confidence: null,
            failure_code: 'AI_OUTPUT_INVALID',
          }
        : d,
    ),
  });
  mockRead(t, managementPath, history([partial], { can_request: true }));
  render(intakePanel());
  await screen.findByText(/部分完成/);
  assert(screen.getAllByText(/AI_OUTPUT_INVALID/).length);
  assert(screen.getByText(/纸面任务 1 · 评测所需的输入材料不可用（AI_NOT_FOUND）/));
  assert(screen.getByRole('button', { name: '重试失败阶段' }));
  assert(screen.getByRole('figure'));
});

test('彻底失败时维护者可见错误，旧标准成功记录提供按新标准评测入口', async (t) => {
  let body = history([
    detail({
      state: 'failed',
      failure_code: 'BLOB_MISSING',
      dimensions: detailedDimensions(result(0).dimensions),
      stages: [{ id: 'static', state: 'failed', failure_code: 'BLOB_MISSING' }],
    }),
  ]);
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    assert.equal(path, managementPath);
    return Response.json(body);
  });
  const view = render(intakePanel());
  assert((await screen.findAllByText(/BLOB_MISSING/)).length);
  assert(!screen.queryByRole('figure'));
  body = history([detail({ rubric_version: '2026-11-24.2' })], { can_request: true });
  view.rerender(createElement(EvaluationPanel, { kind: 'intake', versionId, refresh: 1 }));
  await screen.findByText(/旧评测标准/);
  assert(screen.getByRole('button', { name: '按新标准评测' }));
});

test('审核区按潜在提升排列建议，展开授权用例并将真实文件名和起始行交给文件清单', async (t) => {
  const candidate = detail();
  const instructions = candidate.dimensions.find((d) => d.id === 'instructions')!;
  instructions.checks = [
    {
      id: 'instructions.terminology',
      label: '术语一致',
      verdict: 'fail',
      weight: 1,
      value: 0,
      evidence: [],
      note: '术语表述不一致',
      suggestion: '统一交付术语',
    },
    {
      id: 'instructions.actionable_steps',
      label: '步骤可执行',
      verdict: 'partial',
      weight: 3,
      value: 0.75,
      evidence: [{ path: 'SKILL.md', start_line: 8, end_line: 9 }],
      note: '交接步骤缺少负责人',
      suggestion: '补上执行与核对步骤',
    },
    {
      id: 'instructions.concrete_examples',
      label: '具体示例',
      verdict: 'partial',
      weight: 2,
      value: 0.25,
      evidence: [],
      suggestion: '提供一份带输入输出的示例',
    },
  ];
  candidate.cases = {
    trigger: [],
    tasks: [
      {
        id: 'task',
        origin: 'author',
        prompt: '请写一份交付检查清单',
        expected: '逐项核对',
        assertions: ['核对输入', '核对步骤', '核对负责人'],
      },
    ],
  };
  const current = detail({ id: 'prior', version_id: 'previous-version', version_label: '1.9.0' });
  current.dimensions = current.dimensions.map((d) =>
    d.id === 'instructions' ? { ...d, score: 80, band: 'good' } : d,
  );
  const review: ReviewEvaluationResponse = {
    current,
    candidate,
    regressions: [{ id: 'instructions', label: '指令质量', previous: 80, score: 65, drop: 15 }],
    current_rubric_version: rubric,
    model_enabled: true,
    can_request: false,
    next_window_at: null,
  };
  mockRead(t, reviewPath, review);
  const user = userEvent.setup();
  function ReviewWithFiles() {
    const [selection, setSelection] = useState('');
    return createElement(
      Fragment,
      null,
      createElement(EvaluationPanel, {
        kind: 'review',
        versionId,
        requestId: 'approval',
        onEvidence: (path, line) => setSelection(path + ' 第 ' + line + ' 行'),
      }),
      createElement('output', { 'aria-label': '文件定位' }, selection),
    );
  }
  render(createElement(ReviewWithFiles));
  const tips = await screen.findByRole('button', { name: /改进建议/ });
  assert.equal(
    screen.getByRole('link', { name: '下载迭代包' }).getAttribute('href'),
    managementPath + '/result/iteration.zip?publication_request_id=approval',
  );
  assert(screen.getByRole('button', { name: '对比提交时发布', pressed: true }));
  assert(screen.getByText('v1.9.0'));
  assert(screen.getByText(/扫描规则 2026-11-24\.1/));
  assert(screen.getAllByText(/回归|下降/).length);
  assert(screen.getAllByText(/15\s*分|下降\s*15/).length);
  await user.click(tips);
  assert.deepEqual(
    screen
      .getAllByText(/^(提供一份带输入输出的示例|统一交付术语|补上执行与核对步骤)$/)
      .map((n) => n.textContent),
    ['提供一份带输入输出的示例', '统一交付术语', '补上执行与核对步骤'],
  );
  await user.click(screen.getByRole('button', { name: /评测用例/ }));
  assert(screen.getByText(/请写一份交付检查清单/));
  await user.click(screen.getByRole('button', { name: /指令质量/ }));
  assert(screen.getByText(/交接步骤缺少负责人/));
  const reference = screen.getAllByRole('button', { name: /SKILL\.md.*8/ })[0];
  await user.click(reference);
  assert.equal(screen.getByRole('status', { name: '文件定位' }).textContent, 'SKILL.md 第 8 行');
  assert(!screen.queryByRole('button', { name: /评测此版本/ }));
});
