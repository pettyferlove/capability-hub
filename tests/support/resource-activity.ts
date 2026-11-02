import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import {
  assetFeedbackRequestSchema,
  resourceActivityResponseSchema,
} from '@capability-hub/contracts';
import { publishSkill, type TestHub } from './application.js';
import { signIn } from './http.js';

/** 同一批发布、使用和反馈样本在两种数据库上核对北京时间窗口与归属。 */
export async function assertResourceActivity(t: TestContext, f: TestHub) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-26T15:59:59.999Z') });
  const first = await publishSkill(f, { slug: 'trend-skill' });
  t.mock.timers.setTime(Date.parse('2026-10-26T16:00:00.000Z'));
  const { intake } = await publishSkill(f, {
    slug: 'trend-skill',
    assetId: first.intake.asset_id,
    version: '2.0.0',
    body: '更新的资源正文',
  });
  await f.hub.content.getArchive(null, intake.version_id);
  const input = assetFeedbackRequestSchema.parse({
    version_id: intake.version_id,
    idempotency_key: randomUUID(),
    consent: true,
    kind: 'defect',
    title: '私有反馈标题',
    scenario: '安装',
    expected: '成功',
    actual: '失败',
  });
  const feedback = await f.hub.feedback.report(f.reader, input);
  await f.hub.feedback.report(f.reader, input);
  t.mock.timers.setTime(Date.parse('2026-11-01T16:00:00.000Z'));
  await f.hub.feedback.update(f.admin, feedback.id, {
    revision: feedback.revision,
    status: 'resolved',
    resolution: '已修复',
    fixed_version_id: null,
  });
  await f.hub.feedback.report(f.reader, { ...input, idempotency_key: randomUUID() });
  for (const action of ['skill.loaded', 'skill.installation_prepared', 'content.management_read'])
    await f.store.audit(f.admin.id, action, intake.version_id);
  const [download] = await f.store.where('audit', 'action', 'content.download');
  await f.store.insert('audit', {
    ...download,
    id: randomUUID(),
    occurred_at: '2026-11-01T16:00:00.001Z',
  });
  await f.store.insert('audit', { ...download, id: randomUUID(), result: 'failure' });
  const admin = await signIn(f);
  const get = async (days: string) => {
    const response = await admin.get('/api/admin/resource-activity').query({ days }).expect(200);
    for (const privateValue of [
      intake.asset_id,
      f.reader.id,
      input.title,
      '更新的资源正文',
      'trend-skill',
    ])
      assert(!response.text.includes(privateValue));
    return resourceActivityResponseSchema.parse(response.body).daily;
  };
  const week = await get('7');
  assert.equal(week.length, 7);
  const zero = {
    first_releases: 0,
    repeat_releases: 0,
    downloads: 0,
    skill_loads: 0,
    install_requests: 0,
    feedback_pending: 0,
    feedback_in_progress: 0,
    feedback_resolved: 0,
    feedback_declined: 0,
  };
  assert.deepEqual(week[0], {
    date: '2026-10-27',
    ...zero,
    repeat_releases: 1,
    downloads: 1,
    feedback_resolved: 1,
  });
  assert.deepEqual(week[1], { date: '2026-10-28', ...zero });
  assert.deepEqual(week.at(-1), {
    date: '2026-11-02',
    ...zero,
    skill_loads: 1,
    install_requests: 1,
    feedback_pending: 1,
  });
  const month = await get('30');
  assert.equal(month.length, 30);
  assert.equal(month.find((day) => day.date === '2026-10-26')?.first_releases, 1);
  assert.deepEqual(month.slice(-7), week);
}
