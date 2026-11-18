import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { receiveSkill, type TestHub } from './application.js';
import { signIn } from './http.js';

/** 按独立引用构造场景，避免一个删除条件掩盖另一个条件的遗漏。 */
export async function assertScenarioDeletionReferences(f: TestHub) {
  const administration = f.hub.administration;
  const client = await signIn(f);
  async function expectInUse(id: string, revision = 1) {
    const response = await client
      .delete('/api/admin/scenarios/' + id)
      .set('If-Match', `"${revision}"`)
      .set('Idempotency-Key', randomUUID())
      .expect(409);
    assert.equal(response.body.error.code, 'SCENARIO_IN_USE');
    assert(await f.store.get('scenarios', id));
  }

  const historical = await administration.createScenario(f.admin, { name: '历史申请场景' });
  const intake = await receiveSkill(f);
  const policy = {
    category: 'scenario' as const,
    distribution: { mode: 'approved_audience' as const, audience: ['public'] },
  };
  const body = {
    ...policy,
    source_intake_id: intake.id,
    version_id: intake.version_id,
    base_release_id: null,
    applies_to: {},
    purpose: '共享经审核的流程',
  };
  const request = await f.hub.publications.submit(
    f.admin,
    { ...body, scenario_ids: [historical.id] },
    randomUUID(),
  );
  await f.hub.publications.decide(
    f.reviewer,
    request.id,
    {
      decision: 'reject',
      policy_digest: request.policy_digest,
      comment: '需补充说明',
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  await expectInUse(historical.id);

  const definition = { name: '发布检查', description: '核对待发布内容' };
  const proposed = await f.hub.publications.submit(
    f.admin,
    { ...body, scenario_ids: [], proposed_scenarios: [definition] },
    randomUUID(),
  );
  const published = await administration.createScenario(f.admin, definition);
  await expectInUse(published.id);
  await f.hub.publications.decide(
    f.reviewer,
    proposed.id,
    {
      decision: 'approve',
      policy_digest: proposed.policy_digest,
      comment: '',
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  await expectInUse(published.id);

  const source = await administration.createScenario(f.admin, { name: '来源目标场景' });
  await f.sources.create(
    f.admin,
    {
      repository_url: 'https://127.0.0.1/team/scenario-removal.git',
      provider: 'generic-git',
      branch: 'main',
      owner_group_id: f.teamId,
      targets: [
        { ...policy, scenario_ids: [source.id], slug: 'git-skill', kind: 'skill', path: '.' },
      ],
    },
    randomUUID(),
  );
  await expectInUse(source.id);

  const scoped = await administration.createScenario(f.admin, { name: '场景审核授权' });
  const role = await f.store.find('roles', 'key', 'reviewer');
  assert(role);
  await administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'scenario',
    scope_id: scoped.id,
  });
  await expectInUse(scoped.id);

  const from = await administration.createScenario(f.admin, { name: '原场景' });
  const into = await administration.createScenario(f.admin, { name: '合并目标' });
  await administration.updateScenario(
    f.admin,
    from.id,
    { action: 'merge', target_id: into.id },
    '"1"',
    randomUUID(),
  );
  await expectInUse(from.id, 2);
  await expectInUse(into.id);

  const unused = await administration.createScenario(f.admin, { name: '未使用场景' });
  await client
    .delete('/api/admin/scenarios/' + unused.id)
    .set('If-Match', '"1"')
    .set('Idempotency-Key', randomUUID())
    .expect(200);
  assert.equal(await f.store.get('scenarios', unused.id), undefined);
}
