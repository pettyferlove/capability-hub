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
import type { Applicability, Policy } from '@capability-hub/contracts';

/**
 * 测试统一口令。必须满足生产口令策略（长度与字符种类），否则初始化会直接被拒；
 * 硬编码是刻意的，便于失败时复现。
 */
export const testPassword = 'A-test-password-2026!';

/**
 * 在临时目录起一个完整应用：SQLite + 文件对象存储、worker 关闭（测试自己调 `tick()`）、
 * 静默日志，所有临时文件都在 `context.after` 里清掉。`overrides` 覆盖配置，但端口与
 * `publicUrl` 要一起改，否则 Origin 校验会把请求挡掉。
 */
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

/**
 * 在应用之上预置三种身份，避免每个用例重复搭权限：`admin`（初始化出的维护者）、
 * `reviewer`（平台级审核角色）、`reader`（无任何组的外部成员），并返回他们的组 id。
 * 仍保留 `hub`/`store` 等原始句柄，用例可以直接调用服务层绕过 HTTP。
 */
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

/** {@link createTestHub} 的完整返回值，含 admin/reviewer/reader 三种 principal 与 teamId。 */
export type TestHub = Awaited<ReturnType<typeof createTestHub>>;

/**
 * 走一次真实上传链路：打包一个只含 SKILL.md 的 ZIP → `intakes.receive` → 手动 `worker.tick()`
 * → 断言扫描已就绪。返回的 intake 带非空的 `version_id` 与 `scan_run_id`，
 * 后续发布用例依赖这两个字段，所以这里断言而不是让调用方自己检查。
 */
export async function receiveSkill(
  fixture: TestHub,
  options: {
    slug?: string;
    version?: string;
    assetId?: string;
    body?: string;
    files?: Parameters<typeof archive>[0];
  } = {},
) {
  const slug = options.slug ?? 'sample-skill';
  const bytes = await archive(
    options.files ?? [
      { path: 'SKILL.md', bytes: skillDocument(slug, options.body), executable: false },
    ],
  );
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

/**
 * 以 `admin` 身份提交一次共享申请，默认受众为 `public`；`distribution` 用于覆盖可见范围。
 * 基线与 `asset.current_release_id` 对齐，避免每次提交都因版本已变化被判为过期。
 */
export async function submitPublication(
  fixture: TestHub,
  intake: Awaited<ReturnType<typeof receiveSkill>>,
  distribution?: Policy['distribution'],
  appliesTo: Applicability = { languages: ['TypeScript'] },
) {
  const asset = await fixture.hub.assetAccess.getAsset(intake.asset_id);
  return await fixture.hub.publications.submit(
    fixture.admin,
    {
      source_intake_id: intake.id,
      version_id: intake.version_id,
      category: 'uncategorized',
      scenario_ids: [],
      applies_to: appliesTo,
      distribution: distribution ?? { mode: 'approved_audience', audience: ['public'] },
      purpose: '共享经过审查的项目工程实践',
      base_release_id: asset.current_release_id,
    },
    randomUUID(),
  );
}

/**
 * 一路走完到审核通过：接收 → 提交 → 由 `reviewer` 批准（不覆盖审核意见与警告）。
 * 返回三段结果，供用例断言发布后的可见性与产物。提交者与审核者必须是不同 principal，
 * 否则会被 `SELF_REVIEW` 拒绝。
 */
export async function publishSkill(
  fixture: TestHub,
  options: Parameters<typeof receiveSkill>[1] & {
    distribution?: Policy['distribution'];
    appliesTo?: Applicability;
  } = {},
) {
  const intake = await receiveSkill(fixture, options);
  const request = await submitPublication(fixture, intake, options.distribution, options.appliesTo);
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
