import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  CatalogDiscoveryService,
  catalogUses,
  emptyCriteria,
  locateQuote,
  matchCandidates,
} from '@capability-hub/application';
import { HubError } from '@capability-hub/domain/errors';
import { createTestHub, publishSkill, receiveSkill } from '../support/application.js';

const code = (expected: string) => (error: unknown) =>
  error instanceof HubError && error.code === expected;

test('无空格的中文需求命中可见发布，中英混排保留完整的技术名称', async (context) => {
  const f = await createTestHub(context);
  const visible = await publishSkill(f, { slug: 'node-audit' });
  await publishSkill(f, { slug: 'node' });
  await publishSkill(f, {
    slug: 'private-audit',
    distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
  });
  const chinese = await f.hub.catalog.search(null, { q: '想查找适合团队使用的工程规范' });
  assert.deepEqual(chinese.items.map((item) => item.slug).sort(), ['node', 'node-audit']);
  const mixed = await f.hub.catalog.search(null, { q: '使用（ＮＯＤＥ－ＡＵＤＩＴ）核查异常' });
  assert.deepEqual(
    mixed.items.map((item) => item.asset_id),
    [visible.intake.asset_id],
  );
  assert.equal((await f.hub.catalog.search(null, { q: '量子纠缠' })).total, 0);
});

test('中文多词检索按有效词筛选并排序，风控不会拆成风险和控制的单字命中', async (context) => {
  const f = await createTestHub(context);
  for (const [slug, keywords] of [
    ['refund-policy', ['退款', '风控', '规则']],
    ['refund-controls', ['退款', '风控']],
    ['general-rules', ['规则']],
    ['other-controls', ['风险', '控制']],
  ] as const) {
    await publishSkill(f, { slug, appliesTo: { keywords: [...keywords] }, body: '退款风控规则' });
  }
  const search = async (q: string) =>
    (await f.hub.catalog.search(null, { q })).items.map((item) => item.slug);
  assert.deepEqual(await search('退款风控规则'), ['refund-policy', 'refund-controls']);
  assert.deepEqual((await search('风控')).sort(), ['refund-controls', 'refund-policy']);
  assert((await search('风')).includes('other-controls'));
});

test('发现结果只显示可定位的原文，不以否定列举、技术词后缀或版本片段证实条件', async (context) => {
  const f = await createTestHub(context);
  const description = [
    '不用于 UI、浏览器测试。Only supports Node 3.4.5.',
    'Not for: Staging, production. Supports offline review.',
    `${'备用说明'.repeat(32)}：使用 Ｄｏｃｋｅｒ 和 Compose。`,
    'Configure ＡＰＩ\tKey with the GUI.',
    `Enable${' '.repeat(120)}Sync.`,
    'Use oﬃce services.',
  ].join(' ');
  await publishSkill(f, {
    slug: 'release-proof',
    files: [
      {
        path: 'SKILL.md',
        bytes: Buffer.from(
          `---\nname: release-proof\ndescription: ${JSON.stringify(description)}\n---\n\n# 使用\n`,
        ),
        executable: false,
      },
    ],
  });
  const discovery = new CatalogDiscoveryService(f.hub, f.hub.assetAccess, f.hub.catalog);
  const [candidate] = await f.store.tx(() => discovery.candidates(null));
  assert.deepEqual(locateQuote(candidate, 'api key'), {
    field: 'description',
    text: 'ＡＰＩ\tKey',
  });
  assert.deepEqual(locateQuote(candidate, 'office'), { field: 'description', text: 'oﬃce' });
  for (const quote of ['Enable Sync', 'fic', 'API … GUI'])
    assert.equal(locateQuote(candidate, quote), null);
  for (const requirement of ['浏览器测试', 'production', 'Node 3', 'Node 4', 'Node 5', 'ocker'])
    assert.deepEqual(
      matchCandidates([candidate], { ...emptyCriteria, requirements: [requirement] }).verified,
      [],
    );
  for (const requirement of ['Node 3.4.5', 'offline review', 'Docker Compose']) {
    const { verified } = matchCandidates([candidate], {
      ...emptyCriteria,
      requirements: [requirement],
    });
    const proof = verified[0]?.reasons[0];
    assert(proof && description.includes(proof.text) && proof.text.length <= 120);
    for (const term of requirement.split(' '))
      assert(proof.text.normalize('NFKC').includes(term), proof.text);
  }
  const recall = (keyword: string) =>
    matchCandidates([candidate], { ...emptyCriteria, keywords: [keyword] }).verified;
  assert.deepEqual(recall('浏览器测试'), []);
  const text = recall('Docker')[0]?.reasons[0]?.text;
  assert(text && description.includes(text) && text.includes('Ｄｏｃｋｅｒ'));
});

test('目录方向用当前可选场景，多个场景时不覆盖用户已选项', async (context) => {
  const f = await createTestHub(context);
  const scenes = f.hub.administration;
  const old = await scenes.createScenario(f.admin, { name: '旧场景' });
  const target = await scenes.createScenario(f.admin, { name: '合并目标' });
  const other = await scenes.createScenario(f.admin, { name: '另一用途' });
  const intake = await receiveSkill(f);
  const request = await f.hub.publications.submit(
    f.admin,
    {
      source_intake_id: intake.id,
      version_id: intake.version_id,
      base_release_id: null,
      category: 'scenario',
      scenario_ids: [old.id, other.id],
      distribution: { mode: 'approved_audience', audience: ['public'] },
      applies_to: {},
      purpose: '场景使用说明',
    },
    randomUUID(),
  );
  await f.hub.publications.decide(
    f.reviewer,
    request.id,
    {
      decision: 'approve',
      policy_digest: request.policy_digest,
      comment: '',
      accepted_warnings: [],
    },
    `"${request.revision}"`,
    randomUUID(),
  );
  await scenes.updateScenario(
    f.admin,
    old.id,
    { action: 'merge', target_id: target.id },
    '"1"',
    randomUUID(),
  );
  const discovery = new CatalogDiscoveryService(f.hub, f.hub.assetAccess, f.hub.catalog);
  const { candidates, active } = await f.store.tx(async () => ({
    candidates: await discovery.candidates(null),
    active: new Set((await discovery.scenarios(null)).map(({ id }) => id)),
  }));
  for (const [selectedId, expected] of [
    [null, other],
    [target.id, target],
  ] as const) {
    const [direction] = catalogUses(candidates, '', active, selectedId);
    assert.equal(direction.label, expected.name);
    assert.deepEqual(direction.patch, { scenario_id: expected.id });
  }
});

test('目录游标绑定查询、身份和目录版本，权限收窄后旧游标与推荐均不能继续使用', async (context) => {
  const fixture = await createTestHub(context);
  const first = await publishSkill(fixture, { slug: 'first-skill' });
  await publishSkill(fixture, { slug: 'second-skill' });
  const page = await fixture.hub.catalog.search(null, { limit: 1 });
  assert(page.next_cursor);
  assert.equal(page.items.length, 1);
  const next = await fixture.hub.catalog.search(null, { limit: 1, cursor: page.next_cursor });
  assert.equal(next.items.length, 1);
  assert.notEqual(next.items[0].asset_id, page.items[0].asset_id);
  await assert.rejects(
    () => fixture.hub.catalog.search(fixture.reader, { limit: 1, cursor: page.next_cursor! }),
    code('CURSOR_EXPIRED'),
  );
  await assert.rejects(
    () => fixture.hub.catalog.search(null, { limit: 1, q: 'first', cursor: page.next_cursor! }),
    code('CURSOR_EXPIRED'),
  );
  await publishSkill(fixture, {
    assetId: first.intake.asset_id,
    slug: 'first-skill',
    version: '1.1.0',
    distribution: { mode: 'approved_audience', audience: ['group:' + fixture.teamId] },
  });
  await assert.rejects(
    () => fixture.hub.catalog.search(null, { limit: 1, cursor: page.next_cursor! }),
    code('CURSOR_EXPIRED'),
  );
  await assert.rejects(
    () =>
      fixture.hub.community.rate(fixture.reader, {
        asset_id: first.intake.asset_id,
        recommended: true,
      }),
    code('NOT_FOUND'),
  );
});

test('推荐只接受资源 ID，UUID 格式的资源短名不能代替 ID', async (context) => {
  const fixture = await createTestHub(context);
  const slug = randomUUID();
  const { intake } = await publishSkill(fixture, { slug });
  await assert.rejects(
    () => fixture.hub.community.rate(fixture.reader, { asset_id: slug, recommended: true }),
    code('NOT_FOUND'),
  );
  const asset = await fixture.hub.catalog.getDetail(fixture.reader, intake.asset_id);
  assert.equal(asset.community.recommendation_count, 0);
});

test('同一资源升级后保留推荐，并发重试只计一票，取消后保留审计', async (context) => {
  const fixture = await createTestHub(context);
  const published = await publishSkill(fixture);
  const body = { asset_id: published.intake.asset_id, recommended: true };
  await Promise.all([
    fixture.hub.community.rate(fixture.reader, body),
    fixture.hub.community.rate(fixture.reader, body),
  ]);
  assert.equal((await fixture.store.all('recommendations')).length, 1);
  await publishSkill(fixture, { assetId: body.asset_id, version: '2.0.0' });
  const asset = await fixture.hub.catalog.getDetail(fixture.reader, body.asset_id);
  assert.equal(asset.current_release.version_label, '2.0.0');
  assert.equal(asset.community.recommendation_count, 1);
  assert.equal(asset.community.recommended, true);
  assert.equal((await fixture.hub.community.rate(fixture.reader, body)).recommendation_count, 1);
  const cancelled = await fixture.hub.community.rate(fixture.reader, {
    ...body,
    recommended: false,
  });
  assert.equal(cancelled.recommendation_count, 0);
  assert.equal(cancelled.recommended, false);
  assert.equal((await fixture.store.all('recommendations')).length, 0);
  const audit = await fixture.store.where('audit', 'entity_id', body.asset_id);
  for (const action of ['asset.recommended', 'asset.recommendation_removed']) {
    const events = audit.filter((event) => event.action === action);
    assert.equal(events.length, 1);
    assert.equal(events[0].subject?.kind, 'asset');
  }
});

test('读者可提名已有发布，独立审核只改变分类并保留内容和分发受众', async (context) => {
  const fixture = await createTestHub(context);
  const published = await publishSkill(fixture);
  const request = await fixture.hub.publications.nominate(
    fixture.reader,
    {
      reason: '适用于多业务的工程约束',
      release_id: (await fixture.hub.assetAccess.getAsset(published.intake.asset_id))
        .current_release_id!,
    },
    randomUUID(),
  );
  await assert.rejects(
    () =>
      fixture.hub.publications.decide(
        fixture.admin,
        request.id,
        {
          decision: 'approve',
          comment: '核对提名',
          policy_digest: request.policy_digest,
          accepted_warnings: [],
        },
        '"1"',
        randomUUID(),
      ),
    code('SELF_REVIEW'),
  );
  await fixture.hub.publications.decide(
    fixture.reviewer,
    request.id,
    {
      decision: 'approve',
      comment: '核对通用范围',
      policy_digest: request.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const detail = await fixture.hub.catalog.getDetail(null, published.intake.asset_id);
  assert.equal(detail.current_release.version_id, published.intake.version_id);
  assert.equal(detail.current_release.category, 'general');
  assert.deepEqual(detail.current_release.distribution, {
    mode: 'approved_audience',
    audience: ['public'],
  });
});
