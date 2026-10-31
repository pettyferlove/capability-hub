import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  createTestHub,
  publishSkill,
  receiveSkill,
  submitPublication,
} from '../support/application.js';
import { httpClient, signIn } from '../support/http.js';
import { archive } from '@capability-hub/infrastructure/content';
import { skillDocument } from '../support/content.js';

test('Skill 使用要求默认关闭，保存与取消同步目录、维护列表和审计，保留发布内容', async (context) => {
  const f = await createTestHub(context);
  const { intake } = await publishSkill(f);
  const client = await signIn(f);
  const path = '/api/assets/' + intake.asset_id;
  const before = await client.get(path).expect(200);
  assert.equal(before.body.requires_api_key, false);
  // 先填充目录缓存，确认修改后列表会读取新的资产信息。
  assert.equal((await client.get('/api/assets').expect(200)).body.items[0].requires_api_key, false);
  const enabled = await client
    .patch(path + '/usage')
    .set('If-Match', `"${before.body.revision}"`)
    .send({ requires_api_key: true })
    .expect(200);
  assert.equal(enabled.body.revision, before.body.revision + 1);
  assert.equal((await f.store.get('assets', intake.asset_id))?.requires_api_key, true);
  const detail = await httpClient(f).get(path).expect(200);
  assert.equal(detail.body.requires_api_key, true);
  assert.equal(detail.body.content_digest, before.body.content_digest);
  assert.deepEqual(detail.body.current_release, before.body.current_release);
  assert.equal((await client.get('/api/assets').expect(200)).body.items[0].requires_api_key, true);
  assert.equal(
    (await client.get('/api/management/assets').expect(200)).body[0].requires_api_key,
    true,
  );

  const nextIntake = await receiveSkill(f, { assetId: intake.asset_id, version: '1.1.0' });
  const pending = await submitPublication(f, nextIntake);
  const unchanged = await client
    .patch(path + '/usage')
    .set('If-Match', `"${enabled.body.revision}"`)
    .send({ requires_api_key: true })
    .expect(200);
  assert.equal(unchanged.body.revision, enabled.body.revision);
  assert.equal((await f.store.get('requests', pending.id))?.state, 'pending');
  await client
    .patch(path + '/usage')
    .set('If-Match', `"${enabled.body.revision}"`)
    .send({ requires_api_key: false })
    .expect(200);
  assert.equal((await client.get(path).expect(200)).body.requires_api_key, false);
  assert.equal((await client.get('/api/assets').expect(200)).body.items[0].requires_api_key, false);
  assert.equal((await f.store.get('requests', pending.id))?.state, 'stale');
  const events = (await f.store.all('audit')).filter(
    (event) => event.action === 'asset.usage_updated',
  );
  assert.equal(events.length, 2);
  assert.deepEqual(
    new Set(events.map((event) => JSON.stringify(event.metadata.changes))),
    new Set([
      JSON.stringify([{ field: 'requires_api_key', before: false, after: true }]),
      JSON.stringify([{ field: 'requires_api_key', before: true, after: false }]),
    ]),
  );
});

test('使用要求写入检查身份、维护权限、CSRF、资产类型、布尔值和并发修订', async (context) => {
  const f = await createTestHub(context);
  const intake = await receiveSkill(f);
  const path = '/api/assets/' + intake.asset_id + '/usage';
  const body = { requires_api_key: true };
  const client = await signIn(f);
  const reader = await signIn(f, 'reader');
  await httpClient(f).patch(path).send(body).expect(401);
  await reader.patch(path).set('If-Match', '"1"').send(body).expect(403);
  await client.patch(path).unset('X-CSRF-Token').set('If-Match', '"1"').send(body).expect(403);
  await client.patch(path).send(body).expect(428);
  await client.patch(path).set('If-Match', '"1"').send({ requires_api_key: 'true' }).expect(422);
  await client
    .patch(path)
    .set('If-Match', '"1"')
    .send({ ...body, api_key: 'not-accepted' })
    .expect(422);
  const token = await f.hub.tokens.issue(f.admin, { name: '消费令牌' });
  await httpClient(f)
    .patch(path)
    .set('Authorization', 'Bearer ' + token.token)
    .set('If-Match', '"1"')
    .send(body)
    .expect(403);
  const replies = await Promise.all([
    client.patch(path).set('If-Match', '"1"').send(body),
    client.patch(path).set('If-Match', '"1"').send(body),
  ]);
  assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 412]);

  const mcp = await f.hub.intakes.receive(
    f.admin,
    Buffer.from('{}'),
    'server.json',
    {
      target: 'new',
      kind: 'mcp',
      slug: 'sample-mcp',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
  const mcpIntake = await f.hub.intakeQueries.getDetail(f.admin, mcp.intake_id);
  const rejected = await client
    .patch('/api/assets/' + mcpIntake.asset_id + '/usage')
    .set('If-Match', '"1"')
    .send(body)
    .expect(422);
  assert.equal(rejected.body.error.code, 'NOT_SKILL');
  assert.equal((await f.store.get('assets', mcpIntake.asset_id))?.requires_api_key, false);
});

test('上传声明经提交修正确认后冻结到审核与发布，候选和后续维护不改写历史声明', async (context) => {
  const f = await createTestHub(context);
  const client = await signIn(f);
  const reviewer = await signIn(f, 'reviewer');
  const bytes = await archive([
    { path: 'SKILL.md', bytes: skillDocument('auth-skill'), executable: false },
  ]);
  async function upload(requiresApiKey: boolean, assetId?: string) {
    const response = await client
      .post('/api/intakes')
      .set('Idempotency-Key', randomUUID())
      .field(
        'metadata',
        JSON.stringify({
          ...(assetId
            ? { target: 'existing', asset_id: assetId }
            : { target: 'new', kind: 'skill', slug: 'auth-skill', owner_group_id: f.teamId }),
          version_label: assetId ? '2.0.0' : '1.0.0',
          requires_api_key: requiresApiKey,
        }),
      )
      .attach('file', bytes, 'skill.zip')
      .expect(202);
    await f.worker.tick();
    const intake = await f.hub.intakeQueries.getDetail(f.admin, response.body.intake_id);
    assert.equal(intake.state, 'ready');
    assert.equal((await f.store.get('intakes', intake.id))?.requires_api_key, requiresApiKey);
    assert.equal(intake.proposed_requires_api_key, requiresApiKey);
    return intake;
  }
  async function submit(intake: Awaited<ReturnType<typeof upload>>, requiresApiKey: boolean) {
    const asset = await f.hub.assetAccess.getAsset(intake.asset_id);
    const response = await client
      .post('/api/publication-requests')
      .set('Idempotency-Key', randomUUID())
      .send({
        source_intake_id: intake.id,
        version_id: intake.version_id,
        category: 'uncategorized',
        scenario_ids: [],
        distribution: { mode: 'approved_audience', audience: ['public'] },
        applies_to: {},
        purpose: '核对认证说明后共享',
        base_release_id: asset.current_release_id,
        requires_api_key: requiresApiKey,
      })
      .expect(201);
    const record = await f.store.get('requests', response.body.id);
    assert(record);
    assert.equal(record.requires_api_key, requiresApiKey);
    assert.equal(JSON.parse(record.canonical_policy_json).requires_api_key, requiresApiKey);
    return record;
  }
  async function approve(record: Awaited<ReturnType<typeof submit>>) {
    await reviewer
      .post('/api/publication-requests/' + record.id + '/decision')
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', `"${record.revision}"`)
      .send({
        decision: 'approve',
        comment: '已核对认证与使用要求',
        policy_digest: record.policy_digest,
        accepted_warnings: [],
      })
      .expect(200);
  }
  const first = await upload(true);
  const firstRequest = await submit(first, false);
  await approve(firstRequest);
  const assetPath = '/api/assets/' + first.asset_id;
  assert.equal((await client.get(assetPath).expect(200)).body.requires_api_key, false);

  const second = await upload(true, first.asset_id);
  assert.equal((await client.get(assetPath).expect(200)).body.requires_api_key, false);
  const secondRequest = await submit(second, true);
  const reviewPath = '/api/publication-requests/' + secondRequest.id;
  const review = await reviewer.get(reviewPath).expect(200);
  assert.equal(review.body.requires_api_key, true);
  assert.equal(review.body.current.release.requires_api_key, false);
  await approve(secondRequest);
  const asset = await f.hub.assetAccess.getAsset(first.asset_id);
  const release = await f.store.get('releases', asset.current_release_id);
  assert(release);
  assert.equal(release.requires_api_key, true);
  assert.equal((await client.get(assetPath).expect(200)).body.requires_api_key, true);

  const rollback = await f.hub.lifecycle.requestRollback(
    f.admin,
    asset.id,
    {
      target_version_id: first.version_id,
      reason: '恢复先前版本',
      current_policy_digest: release.policy_digest,
    },
    randomUUID(),
  );
  assert.equal(rollback.requires_api_key, false);
  await client
    .patch(assetPath + '/usage')
    .set('If-Match', `"${asset.revision}"`)
    .send({ requires_api_key: false })
    .expect(200);
  const historical = await reviewer.get(reviewPath).expect(200);
  assert.equal(historical.body.requires_api_key, true);
  assert.equal(historical.body.policy_digest, secondRequest.policy_digest);
  assert.equal((await f.store.get('releases', release.id))?.requires_api_key, true);
  assert.equal((await f.store.get('requests', rollback.id))?.state, 'stale');
});
