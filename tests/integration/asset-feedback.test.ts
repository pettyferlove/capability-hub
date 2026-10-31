import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { assetFeedbackRequestSchema } from '@capability-hub/contracts';
import { HubError } from '@capability-hub/domain/errors';
import { createTestHub, publishSkill, receiveSkill } from '../support/application.js';
import { httpClient, signIn } from '../support/http.js';

const code = (expected: string) => (error: unknown) =>
  error instanceof HubError && error.code === expected;
const input = (versionId: string) =>
  assetFeedbackRequestSchema.parse({
    version_id: versionId,
    idempotency_key: randomUUID(),
    consent: true,
    kind: 'defect',
    title: '缺少异常输入处理',
    scenario: '处理空数据导入',
    expected: '返回可操作提示',
    actual: '脚本异常退出',
  });

test('普通读者可以反馈，并发重试只生成一次；反馈仅对提交者与维护者可见', async (context) => {
  const f = await createTestHub(context);
  const { intake } = await publishSkill(f);
  const body = input(intake.version_id);
  const [first, second] = await Promise.all([
    f.hub.feedback.report(f.reader, body),
    f.hub.feedback.report(f.reader, body),
  ]);
  assert.equal(first.id, second.id);
  assert.equal(first.status, 'pending');
  assert.equal(first.can_manage, false);
  assert.equal('request_hash' in first, false);
  assert.equal((await f.store.all('asset_feedback')).length, 1);
  assert.equal(
    (await f.store.all('audit')).filter((event) => event.action === 'asset.feedback_submitted')
      .length,
    1,
  );
  await assert.rejects(
    () => f.hub.feedback.report(f.reader, { ...body, title: '不同反馈' }),
    code('IDEMPOTENCY_CONFLICT'),
  );
  await assert.rejects(() => f.hub.feedback.get(f.reviewer, first.id), code('NOT_FOUND'));
  assert.equal(
    (await f.hub.feedback.list(f.reviewer, intake.asset_id, { page: 1, limit: 10 })).total,
    0,
  );
  assert.equal(
    (await f.hub.feedback.list(f.admin, intake.asset_id, { page: 1, limit: 10 })).total,
    1,
  );
  assert.equal((await f.hub.feedback.get(f.admin, first.id)).can_manage, true);
  assert.match(first.detail_url, new RegExp('feedback=' + first.id));
});

test('处理反馈检查维护权限、修订冲突和同资产修复版本，隐藏不可读的修复候选', async (context) => {
  const f = await createTestHub(context);
  const { intake } = await publishSkill(f);
  const feedback = await f.hub.feedback.report(f.reader, input(intake.version_id));
  const update = {
    status: 'resolved' as const,
    resolution: '已增加空数据校验',
    fixed_version_id: null,
    revision: 1,
  };
  await assert.rejects(
    () => f.hub.feedback.update(f.reader, feedback.id, update),
    code('FORBIDDEN'),
  );
  await assert.rejects(
    () => f.hub.feedback.update(f.admin, feedback.id, { ...update, resolution: '' }),
    code('RESOLUTION_REQUIRED'),
  );
  const other = await publishSkill(f, { slug: 'other-skill' });
  await assert.rejects(
    () =>
      f.hub.feedback.update(f.admin, feedback.id, {
        ...update,
        fixed_version_id: other.intake.version_id,
      }),
    code('INVALID_FIXED_VERSION'),
  );
  const candidate = await receiveSkill(f, {
    slug: 'sample-skill',
    assetId: intake.asset_id,
    version: '1.1.0',
  });
  const results = await Promise.allSettled([
    f.hub.feedback.update(f.admin, feedback.id, {
      ...update,
      fixed_version_id: candidate.version_id,
    }),
    f.hub.feedback.update(f.admin, feedback.id, {
      ...update,
      fixed_version_id: candidate.version_id,
    }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert(rejected?.status === 'rejected' && code('REVISION_CONFLICT')(rejected.reason));
  const own = await f.hub.feedback.get(f.reader, feedback.id);
  assert.equal(own.status, 'resolved');
  assert.equal(own.resolution, update.resolution);
  assert.equal(own.fixed_version_id, null);
  assert.equal(
    (await f.hub.feedback.get(f.admin, feedback.id)).fixed_version_id,
    candidate.version_id,
  );
});

test('反馈和幂等重试重新核验受众，资产封禁后维护者仍可处理', async (context) => {
  const f = await createTestHub(context);
  const { intake } = await publishSkill(f);
  const body = input(intake.version_id);
  const feedback = await f.hub.feedback.report(f.reader, body);
  const asset = await f.hub.assetAccess.getAsset(intake.asset_id);
  await f.store.put('assets', { ...asset, lifecycle: 'blocked' });
  await assert.rejects(() => f.hub.feedback.report(f.reader, body), code('NOT_FOUND'));
  await assert.rejects(() => f.hub.feedback.get(f.reader, feedback.id), code('NOT_FOUND'));
  await assert.rejects(
    () => f.hub.feedback.list(f.reader, asset.id, { page: 1, limit: 10 }),
    code('NOT_FOUND'),
  );
  assert.equal((await f.hub.feedback.list(f.admin, asset.id, { page: 1, limit: 10 })).total, 1);
  await f.hub.feedback.update(f.admin, feedback.id, {
    revision: 1,
    status: 'in_progress',
    resolution: '正在处理',
    fixed_version_id: null,
  });
});

test('提交限额跨资源生效，达到限额后仍允许同一反馈重试，列表在服务端分页和筛选', async (context) => {
  const f = await createTestHub(context);
  const { intake } = await publishSkill(f);
  const first = input(intake.version_id);
  await f.hub.feedback.report(f.reader, first);
  for (let index = 1; index < 20; index++)
    await f.hub.feedback.report(f.reader, input(intake.version_id));
  await assert.rejects(
    () => f.hub.feedback.report(f.reader, input(intake.version_id)),
    code('FEEDBACK_RATE_LIMIT'),
  );
  await f.hub.feedback.report(f.reader, first);
  const page = await f.hub.feedback.list(f.reader, intake.asset_id, { page: 2, limit: 7 });
  assert.equal(page.items.length, 7);
  assert.equal(page.total, 20);
  const empty = await f.hub.feedback.list(f.reader, intake.asset_id, {
    page: 1,
    limit: 10,
    status: 'resolved',
  });
  assert.equal(empty.total, 0);
});

test('反馈 HTTP 边界校验授权、长度、未知字段、CSRF、Bearer 写入限制与私有读取', async (context) => {
  const f = await createTestHub(context);
  const { intake } = await publishSkill(f);
  const body = input(intake.version_id);
  const anon = httpClient(f);
  await anon.post('/api/feedback').send(body).expect(401);
  const reader = await signIn(f, 'reader');
  for (const invalid of [
    { ...body, consent: false },
    { ...body, title: 'x'.repeat(161) },
    { ...body, transcript: '私有对话' },
  ]) {
    const response = await reader.post('/api/feedback').send(invalid);
    assert([400, 422].includes(response.status));
  }
  await reader.post('/api/feedback').set('X-CSRF-Token', 'invalid').send(body).expect(403);
  const created = await reader.post('/api/feedback').send(body).expect(200);
  const id = String(created.body.id);
  await anon.get('/api/feedback/' + id).expect(401);
  const reviewer = await signIn(f, 'reviewer');
  await reviewer.get('/api/feedback/' + id).expect(404);
  const list = await reader
    .get(`/api/assets/${intake.asset_id}/feedback?page=1&limit=1`)
    .expect(200);
  assert.equal(list.body.total, 1);
  const token = await f.hub.tokens.issue(f.admin, {
    name: 'feedback-test',
    scope: 'hub:contribute',
  });
  await anon
    .post('/api/feedback')
    .set('Authorization', 'Bearer ' + token.token)
    .send(body)
    .expect(403);
  await anon
    .patch('/api/feedback/' + id)
    .set('Authorization', 'Bearer ' + token.token)
    .send({})
    .expect(403);
});
