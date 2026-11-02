import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { GitRepositoryAdapter } from '@capability-hub/infrastructure/git';
import type { GitCredentialResolver } from '@capability-hub/application/ports';
import { inspect } from '@capability-hub/infrastructure/content';
import { HubError } from '@capability-hub/domain/errors';
import { externalVariable } from '../support/external.js';

async function repository(hostKey?: string, revision = 1) {
  const url = externalVariable('CAPABILITY_HUB_TEST_GIT_URL');
  const credentials: GitCredentialResolver = {
    resolve: async () => ({
      kind: 'ssh',
      username: 'git',
      auth_method: 'basic',
      secret: await readFile(externalVariable('CAPABILITY_HUB_TEST_GIT_KEY'), 'utf8'),
      passphrase: externalVariable('CAPABILITY_HUB_TEST_GIT_PASSPHRASE'),
      host_key: hostKey ?? externalVariable('CAPABILITY_HUB_TEST_GIT_HOST_KEY'),
      revision: 1,
    }),
    currentRevision: () => Promise.resolve(revision),
  };
  return {
    url,
    git: new GitRepositoryAdapter(
      { dataDir: '/tmp', gitHosts: ['127.0.0.1'], privateGitHosts: ['127.0.0.1'] },
      credentials,
    ),
  };
}

test('真实 SSH 凭据固定主机公钥后拉取提交，按 Git 对象保留文件字节和脚本信息', async () => {
  const { git, url } = await repository();
  const snapshot = await git.snapshot({
    canonical_url: url,
    branch: 'main',
    credential_ref: 'fixture',
  });
  try {
    assert.match(snapshot.commit, /^[a-f0-9]{40}$/);
    const files = await snapshot.read('.', 'skill');
    assert.deepEqual(files.map((file) => file.path).sort(), ['SKILL.md', 'scripts/check.sh']);
    const result = inspect('skill', files, 'fixture-skill');
    assert.equal(result.state, 'passed');
    assert.equal(result.metadata.has_scripts, true);
    await assert.rejects(
      () => snapshot.read('missing', 'skill'),
      (error: unknown) => error instanceof HubError && error.code === 'TARGET_MISSING',
    );
  } finally {
    await snapshot.close();
  }
});

test('真实 Git 对象中的非法 UTF-8 路径被拒绝，不替换为其他文件名', async () => {
  const { git, url } = await repository();
  const snapshot = await git.snapshot({
    canonical_url: url,
    branch: 'invalid-utf8',
    credential_ref: 'fixture',
  });
  try {
    await assert.rejects(
      () => snapshot.read('.', 'skill'),
      (error: unknown) => error instanceof HubError && error.code === 'GIT_PATH_ENCODING',
    );
  } finally {
    await snapshot.close();
  }
});

test('分支名中的 401 不会让已认证的 Git 仓库误报凭据失效', async () => {
  const { git, url } = await repository();
  await assert.rejects(
    () => git.snapshot({ canonical_url: url, branch: 'release-401', credential_ref: 'fixture' }),
    (error: unknown) => error instanceof HubError && error.code === 'GIT_FETCH_FAILED',
  );
});

test('SSH 主机公钥不匹配和同步期间撤换凭据均使拉取失败', async () => {
  const key = externalVariable('CAPABILITY_HUB_TEST_GIT_HOST_KEY').split(' ');
  const changed = key[1].slice(0, -4) + 'AAAA';
  const wrong = await repository(key[0] + ' ' + changed);
  await assert.rejects(
    () =>
      wrong.git.snapshot({ canonical_url: wrong.url, branch: 'main', credential_ref: 'fixture' }),
    (error: unknown) =>
      error instanceof HubError && error.code === 'GIT_AUTH_ERROR' && !error.retryable,
  );
  const revoked = await repository(undefined, 2);
  await assert.rejects(
    () =>
      revoked.git.snapshot({
        canonical_url: revoked.url,
        branch: 'main',
        credential_ref: 'fixture',
      }),
    (error: unknown) => error instanceof HubError && error.code === 'CREDENTIAL_CHANGED',
  );
});

test('真实 Git 来源逐目标处理，重复同步复用证据；撤销凭据后新同步不得生成版本', async (context) => {
  const { createTestHub } = await import('../support/application.js');
  const { randomUUID } = await import('node:crypto');
  const fixture = await createTestHub(context, {
    gitHosts: ['127.0.0.1'],
    privateGitHosts: ['127.0.0.1'],
  });
  const credential = await fixture.hub.credentials.save(fixture.admin, {
    name: '隔离 SSH 仓库',
    kind: 'ssh',
    host: '127.0.0.1',
    username: 'git',
    secret: await readFile(externalVariable('CAPABILITY_HUB_TEST_GIT_KEY'), 'utf8'),
    passphrase: externalVariable('CAPABILITY_HUB_TEST_GIT_PASSPHRASE'),
    host_key: externalVariable('CAPABILITY_HUB_TEST_GIT_HOST_KEY').split(' ').slice(0, 2).join(' '),
  });
  const policy = {
    category: 'uncategorized' as const,
    scenario_ids: [],
    distribution: { mode: 'approved_audience' as const, audience: ['group:' + fixture.teamId] },
  };
  const source = await fixture.sources.create(
    fixture.admin,
    {
      repository_url: externalVariable('CAPABILITY_HUB_TEST_GIT_URL'),
      provider: 'generic-git',
      branch: 'main',
      owner_group_id: fixture.teamId,
      credential_ref: credential.id,
      targets: [{ ...policy, slug: 'fixture-skill', kind: 'skill', path: '.' }],
    },
    randomUUID(),
  );
  const requested = await fixture.sources.sync(fixture.admin, source.id, randomUUID());
  await fixture.worker.tick();
  const job = await fixture.store.get('jobs', requested.job_id);
  assert.equal(job?.state, 'succeeded', job?.error_message);
  const intakes = await fixture.store.where('intakes', 'source_id', source.id);
  assert.equal(intakes.length, 1);
  assert.equal(intakes[0].state, 'ready');
  const repeated = await fixture.sources.sync(fixture.admin, source.id, randomUUID());
  await fixture.worker.tick();
  assert.equal((await fixture.store.where('intakes', 'source_id', source.id)).length, 1);
  assert.equal((await fixture.store.get('jobs', repeated.job_id))?.result?.targets[0].reused, true);
  await fixture.hub.credentials.revoke(fixture.admin, credential.id, '"1"');
  const revoked = await fixture.sources.sync(fixture.admin, source.id, randomUUID());
  await fixture.worker.tick();
  assert.equal((await fixture.store.get('jobs', revoked.job_id))?.state, 'failed');
  assert.equal(
    (await fixture.store.where('versions', 'asset_id', source.targets[0].asset_id)).length,
    1,
  );
  assert.equal((await fixture.store.get('sources', source.id))?.state, 'auth_error');
});
