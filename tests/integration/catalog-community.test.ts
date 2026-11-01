import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { HubError } from '@capability-hub/domain/errors';
import { createTestHub, publishSkill } from '../support/application.js';

const code = (expected: string) => (error: unknown) =>
  error instanceof HubError && error.code === expected;

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
        version_id: first.intake.version_id,
        recommended: true,
      }),
    code('NOT_FOUND'),
  );
});

test('同一版本的并发推荐只产生一条记录，取消后审计保留而计数归零', async (context) => {
  const fixture = await createTestHub(context);
  const published = await publishSkill(fixture);
  const body = { version_id: published.intake.version_id, recommended: true };
  await Promise.all([
    fixture.hub.community.rate(fixture.reader, body),
    fixture.hub.community.rate(fixture.reader, body),
  ]);
  assert.equal((await fixture.store.all('recommendations')).length, 1);
  const asset = await fixture.hub.catalog.getDetail(fixture.reader, published.intake.asset_id);
  assert.equal(asset.community.recommendation_count, 1);
  assert.equal(asset.community.recommended, true);
  await fixture.hub.community.rate(fixture.reader, { ...body, recommended: false });
  assert.equal((await fixture.store.all('recommendations')).length, 0);
  assert.equal(
    (await fixture.store.all('audit')).filter((event) => event.action === 'asset.recommended')
      .length,
    1,
  );
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
