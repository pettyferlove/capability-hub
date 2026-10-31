import { skillDocument } from './content.js';
import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { archive } from '@capability-hub/infrastructure/content';
import { createApp } from '@capability-hub/server';
import { loadServerConfig, type ServerConfig } from '@capability-hub/server/config';
import type { Policy } from '@capability-hub/contracts';

export const testPassword = 'A-test-password-2026!';

export async function createTestApplication(
  context: TestContext,
  overrides: Partial<ServerConfig> = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'capability-hub-test-'));
  const config = loadServerConfig({
    dataDir: directory,
    secret: 'ab'.repeat(32),
    production: false,
    worker: false,
    requestLogging: false,
    logLevel: 'silent',
    host: '127.0.0.1',
    port: 4100,
    publicUrl: 'http://127.0.0.1:4100',
    gitHosts: ['github.com'],
    privateGitHosts: [],
    database: { driver: 'sqlite' },
    objectStorage: { driver: 'filesystem' },
    ...overrides,
  });
  const runtime = await createApp(config);
  context.after(async () => {
    try {
      await runtime.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  return { ...runtime, directory, config };
}

export async function createTestHub(context: TestContext, overrides: Partial<ServerConfig> = {}) {
  const runtime = await createTestApplication(context, overrides);
  const { hub, store } = runtime;
  const owner = await hub.authentication.setup({
    username: 'owner',
    display_name: '维护者',
    password: testPassword,
    team_name: '研发团队',
  });
  const admin = await hub.identity.principal(owner.id);
  const teamId = admin.groups[0];
  const reviewerUser = await hub.administration.createUser(admin, {
    username: 'reviewer',
    display_name: '审核者',
    password: testPassword,
    group_ids: [teamId],
  });
  const role = await store.find('roles', 'key', 'reviewer');
  assert(role);
  await hub.administration.grantRole(admin, {
    principal_id: reviewerUser.id,
    role_id: role.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const readerUser = await hub.administration.createUser(admin, {
    username: 'reader',
    display_name: '外部成员',
    password: testPassword,
    group_ids: [],
  });
  return {
    ...runtime,
    admin,
    reviewer: await hub.identity.principal(reviewerUser.id),
    reader: await hub.identity.principal(readerUser.id),
    teamId,
  };
}

export type TestHub = Awaited<ReturnType<typeof createTestHub>>;

export async function receiveSkill(
  fixture: TestHub,
  options: {
    slug?: string;
    version?: string;
    assetId?: string;
    body?: string;
  } = {},
) {
  const slug = options.slug ?? 'sample-skill';
  const bytes = await archive([
    { path: 'SKILL.md', bytes: skillDocument(slug, options.body), executable: false },
  ]);
  const receipt = await fixture.hub.intakes.receive(
    fixture.admin,
    bytes,
    'skill.zip',
    {
      ...(options.assetId
        ? { target: 'existing', asset_id: options.assetId }
        : { target: 'new', kind: 'skill', slug, owner_group_id: fixture.teamId }),
      version_label: options.version ?? '1.0.0',
    },
    randomUUID(),
  );
  await fixture.worker.tick();
  const intake = await fixture.hub.intakeQueries.getDetail(fixture.admin, receipt.intake_id);
  assert.equal(intake.state, 'ready', intake.error_message ?? intake.error_code ?? '扫描未完成');
  assert(intake.version_id);
  assert(intake.scan_run_id);
  return { ...intake, version_id: intake.version_id, scan_run_id: intake.scan_run_id };
}

export async function submitPublication(
  fixture: TestHub,
  intake: Awaited<ReturnType<typeof receiveSkill>>,
  distribution?: Policy['distribution'],
) {
  const asset = await fixture.hub.assetAccess.getAsset(intake.asset_id);
  return await fixture.hub.publications.submit(
    fixture.admin,
    {
      source_intake_id: intake.id,
      version_id: intake.version_id,
      category: 'uncategorized',
      scenario_ids: [],
      applies_to: { languages: ['TypeScript'] },
      distribution: distribution ?? { mode: 'approved_audience', audience: ['public'] },
      purpose: '共享经过审查的项目工程实践',
      base_release_id: asset.current_release_id,
    },
    randomUUID(),
  );
}

export async function publishSkill(
  fixture: TestHub,
  options: Parameters<typeof receiveSkill>[1] & { distribution?: Policy['distribution'] } = {},
) {
  const intake = await receiveSkill(fixture, options);
  const request = await submitPublication(fixture, intake, options.distribution);
  const decision = await fixture.hub.publications.decide(
    fixture.reviewer,
    request.id,
    {
      decision: 'approve',
      comment: '已核对内容和共享范围',
      policy_digest: request.policy_digest,
      accepted_warnings: [],
    },
    `"${request.revision}"`,
    randomUUID(),
  );
  assert.equal(decision.state, 'approved');
  return { intake, request, decision };
}
