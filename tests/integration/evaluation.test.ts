import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { aiConfigurationSchema } from '@capability-hub/ai';
import { openAiJson, serveModelStub, type StubHandler } from '../support/model-provider-stub.js';
import {
  evaluationCheck as modelCheck,
  evaluationCitation as citation,
  evaluationInstructionChecks,
  evaluationJudge,
  evaluationModelHandler,
  evaluationModelInput,
  evaluationModelStep,
  evaluationOutputSchema,
  evaluationTransparency as transparent,
  evaluationTriggerCases,
} from '../support/evaluation-model.js';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { archive } from '@capability-hub/infrastructure/content';
import { contentScanRuleset } from '@capability-hub/domain/content';
import { sha256 } from '@capability-hub/domain/canonical';
import { evaluationRubricVersion } from '@capability-hub/domain/evaluation';
import { HubError } from '@capability-hub/domain/errors';
import type { SearchResultResponse } from '@capability-hub/contracts/http';
import {
  evaluationResponseSchema,
  managementEvaluationsResponseSchema,
  reviewEvaluationResponseSchema,
} from '@capability-hub/contracts';
import {
  createTestHub,
  publishSkill,
  receiveSkill,
  submitPublication,
  type TestHub,
} from '../support/application.js';
import { skillDocument } from '../support/content.js';
import { httpClient, signIn } from '../support/http.js';
import { createSqliteStore, deferred } from '../support/store.js';

async function enqueueSkill(f: TestHub) {
  return f.hub.intakes.receive(
    f.admin,
    await archive([{ path: 'SKILL.md', bytes: skillDocument(), executable: false }]),
    'skill.zip',
    {
      target: 'new',
      kind: 'skill',
      slug: 'sample-skill',
      owner_group_id: f.teamId,
      version_label: '1.0.0',
    },
    randomUUID(),
  );
}

test('旧扫描行、整段私钥与路由描述在所有模型请求中脱敏，纸面对照只收到任务输入', async (t) => {
  const { f, stub } = await evaluationHub(t, {}, 0);
  const neighborName = 'routing-neighbor';
  const neighborDescription = '干扰项合成受保护说明';
  const targetDescription = '目标合成受保护说明';
  const neighbor = await publishSkill(f, {
    slug: neighborName,
    files: [
      {
        path: 'SKILL.md',
        bytes: Buffer.from(
          skillDocument(neighborName).toString().replace('团队工程实践', neighborDescription),
        ),
        executable: false,
      },
    ],
  });
  const marker = (file: string, line: number) => ({
    id: randomUUID(),
    file,
    line,
    rule_id: 'SECRET',
    severity: 'warning' as const,
    evidence_summary: '不可外发的合成扫描摘要',
  });
  const neighborScan = (await f.store.get('scans', neighbor.intake.scan_run_id))!;
  await f.store.insert('scans', {
    ...neighborScan,
    id: randomUUID(),
    findings: [marker('SKILL.md', 3)],
  });
  const body = [
    '可见的固定 Skill 正文',
    '只有旧扫描能定位的标记',
    '[说明](guide.md)',
    '-----BEGIN PRIVATE KEY-----',
    '合成正文材料甲',
    '合成正文材料乙',
    '-----END PRIVATE KEY-----',
  ].join('\n');
  const input =
    '可见的任务输入\n-----BEGIN RSA PRIVATE KEY-----\n合成附件材料丙\n-----END RSA PRIVATE KEY-----';
  const suite = {
    evals: [
      { prompt: '把入口当作输入', files: ['SKILL.md'] },
      { prompt: '把 Skill 引用当作输入', files: ['guide.md'] },
      { prompt: '把重命名的指令副本当作输入', files: ['evals/copy.md'] },
      { prompt: '从提供的任务输入整理清单', files: ['evals/input.txt'] },
    ],
  };
  const intake = await receiveSkill(f, {
    files: [
      {
        path: 'SKILL.md',
        bytes: Buffer.from(
          skillDocument('sample-skill', body).toString().replace('团队工程实践', targetDescription),
        ),
        executable: false,
      },
      {
        path: 'guide.md',
        bytes: Buffer.from('可见的引用说明\n-----BEGIN PRIVATE KEY-----\n合成未闭合材料丁'),
        executable: false,
      },
      {
        path: 'evals/copy.md',
        bytes: Buffer.from('可见的引用说明\n-----BEGIN PRIVATE KEY-----\n合成未闭合材料丁'),
        executable: false,
      },
      { path: 'evals/evals.json', bytes: Buffer.from(JSON.stringify(suite)), executable: false },
      { path: 'evals/input.txt', bytes: Buffer.from(input), executable: false },
    ],
  });
  const source = (await f.store.get('versions', intake.version_id))!;
  const legacy = await f.store.insert('versions', {
    ...source,
    id: randomUUID(),
    version_label: '1.0.1',
  });
  const scan = (await f.store.get('scans', intake.scan_run_id))!;
  const legacyRules = '2026-01-01.1';
  await f.store.insert('scans', {
    ...scan,
    version_id: legacy.id,
    id: randomUUID(),
    ruleset_version: legacyRules,
    findings: [marker('SKILL.md', 3), marker('SKILL.md', 9)],
  });
  await f.worker.tick();
  const before = stub.requests.length;
  f.hub.config.evaluationDailyRequests = 300;
  await f.hub.evaluations.manual(f.admin, legacy.id, randomUUID());
  const row = await finishModelEvaluation(f);
  assert.equal(row.scan_ruleset, legacyRules);
  assert.deepEqual(
    row.cases?.tasks.filter((task) => task.origin === 'author').map((task) => task.prompt),
    ['从提供的任务输入整理清单'],
  );
  const requests = stub.requests.slice(before);
  const inputs = requests.map(evaluationModelInput);
  for (const sentinel of [
    targetDescription,
    neighborDescription,
    '只有旧扫描能定位的标记',
    '合成正文材料甲',
    '合成正文材料乙',
    '合成附件材料丙',
    '合成未闭合材料丁',
    'PRIVATE KEY-----',
    '不可外发的合成扫描摘要',
  ])
    assert(!inputs.some((input) => input.includes(sentinel)), sentinel);
  const routes = requests.filter((r) => evaluationModelStep(r) === 'trigger-routing');
  assert.equal(routes.length, 16);
  assert(routes.every((r) => evaluationModelInput(r).includes(neighborName)));
  const baselines = requests
    .filter((r) => evaluationModelStep(r) === 'task-without')
    .map(evaluationModelInput);
  assert(baselines.some((input) => input.includes('可见的任务输入')));
  assert(
    baselines.every(
      (input) => !input.includes('可见的固定 Skill 正文') && !input.includes('可见的引用说明'),
    ),
  );
  assert(
    requests
      .filter((r) => evaluationModelStep(r) === 'task-with')
      .every((r) => evaluationModelInput(r).includes('可见的引用说明')),
  );
});

test('扫描命中缺失时路由按当前规则重检头部，未闭合私钥之后的描述不出站', async (t) => {
  const routes: string[] = [];
  const { f } = await evaluationHub(
    t,
    {
      'trigger-routing': (request) => {
        routes.push(evaluationModelInput(request));
        return { json: openAiJson({ choice: null, reason: '均不适用' }) };
      },
    },
    0,
  );
  const remainder = '合成私钥余文';
  const document = [
    '---',
    'name: sample-skill',
    'metadata:',
    '  signing: "-----BEGIN PRIVATE KEY-----"',
    'description: ' + remainder,
    '---',
    '',
    '# 工程实践',
    '',
    '使用项目现有的命名与模块边界。',
    '',
  ].join('\n');
  const intake = await receiveSkill(f, {
    files: [{ path: 'SKILL.md', bytes: Buffer.from(document), executable: false }],
  });
  const scan = (await f.store.get('scans', intake.scan_run_id))!;
  assert(scan.findings.some((finding) => finding.rule_id === 'PRIVATE_KEY'));
  // 旧规则扫描可能缺失或截断命中，此时只能依靠当前规则识别头部。
  const source = (await f.store.get('versions', intake.version_id))!;
  const legacy = await f.store.insert('versions', {
    ...source,
    id: randomUUID(),
    version_label: '1.0.1',
  });
  await f.store.insert('scans', {
    ...scan,
    id: randomUUID(),
    version_id: legacy.id,
    ruleset_version: '2026-01-01.1',
    findings: [],
  });
  await f.worker.tick();
  f.hub.config.evaluationDailyRequests = 300;
  await f.hub.evaluations.manual(f.admin, legacy.id, randomUUID());
  assert.equal(
    await f.hub.evaluationRunner.process(await claimStage(f, 'trigger-routing')),
    'succeeded',
  );
  assert.equal(routes.length, 16);
  for (const input of routes) {
    const { choices } = JSON.parse(input) as { choices: { name: string; description: string }[] };
    assert.equal(
      choices.find((option) => option.name === 'sample-skill')?.description,
      '［疑似凭据，原文已省略］',
    );
    assert(!input.includes(remainder));
  }
});

test('单个纸面任务失败时依然按其余任务的有效断言计分并保留失败阶段', async (t) => {
  const prompts = ['整理材料一', '整理材料二', '整理材料三', '整理材料四'];
  for (const index of [0, 3]) {
    const { f } = await evaluationHub(t, {
      'task-cases': () => ({
        json: openAiJson({
          cases: prompts.map((prompt) => ({
            prompt,
            expected: '可核对的清单',
            paper: true,
            author_index: null,
            script_dependent: false,
            assertions: prompts
              .concat('整理材料五')
              .map((text) => ({ text, requires_execution: false })),
          })),
        }),
      }),
      'task-without': (r) =>
        evaluationModelInput(r).includes(prompts[index])
          ? { status: 503, json: {} }
          : { json: openAiJson({ output: '交付标题\n简要 步骤' }) },
    });
    const intake = await receiveSkill(f);
    await f.hub.evaluations.manual(f.admin, intake.version_id, randomUUID());
    const last = await claimStage(f, 'transparency');
    await f.hub.evaluationRunner.process(last);
    const row = (await f.store.get('resource_evaluations', last.aggregate_id))!;
    assert.equal(row.state, 'partial');
    assert.equal(
      row.stages.find((stage) => stage.id === 'task-run-' + (index + 1))?.state,
      'failed',
    );
    const dimension = row.dimensions.find((dim) => dim.id === 'effectiveness')!;
    assert.equal(dimension.status, 'scored');
    assert.equal(dimension.metrics?.valid_assertions, 15);
    assert.equal(dimension.metrics.total_assertions, 15);
    assert.equal(dimension.score, 100);
    assert.equal(dimension.confidence, 'low');
  }
});

test('模型两次返回无法存入 JSONB 的文本时，阶段只补发一次且不接纳结果', async (t) => {
  const { f, stub } = await evaluationHub(t, {
    transparency: () => ({ json: openAiJson({ ...transparent, summary: '无效\0文本' }) }),
  });
  const intake = await receiveSkill(f);
  await f.hub.evaluations.manual(f.admin, intake.version_id, randomUUID());
  const job = await claimStage(f, 'transparency');
  assert.equal(await f.hub.evaluationRunner.process(job), 'failed');
  const row = (await f.store.get('resource_evaluations', job.aggregate_id))!;
  assert.equal(row.state, 'partial');
  assert.equal(row.stages.at(-1)?.failure_code, 'AI_OUTPUT_INVALID');
  assert.equal(stub.requests.filter((r) => evaluationModelStep(r) === 'transparency').length, 2);
  assert.equal(row.recovery_requests, 1);
  assert.equal((await f.store.get('jobs', job.id))?.state, 'failed');
  for (const invalid of ['\0', '\ud800']) {
    await assert.rejects(
      f.store.insert('resource_evaluations', {
        ...row,
        id: randomUUID(),
        dimensions: row.dimensions.map((dim) => ({ ...dim, summary: invalid })),
      }),
    );
  }
});

test('接收就绪与评测登记共用事务，后续业务失败时一起回滚', async (t) => {
  const f = await createTestHub(t);
  const receipt = await enqueueSkill(f);
  const job = await f.hub.jobs.claim('test', ['intake']);
  const intake = await f.store.get('intakes', receipt.intake_id);
  assert(job && intake);
  const rollback = new Error('回滚接收');
  const put = f.store.put.bind(f.store);
  t.mock.method(f.store, 'put', (async (table, row) => {
    if (table === 'jobs' && row.id === job.id && 'state' in row && row.state === 'succeeded') {
      const ready = await f.store.get('intakes', intake.id);
      assert(ready?.state === 'ready' && ready.version_id);
      const [evaluation] = await f.store.listVersionEvaluations(ready.version_id);
      assert.equal(evaluation?.trigger, 'intake_ready');
      throw rollback;
    }
    return put(table, row);
  }) satisfies typeof f.store.put);
  await assert.rejects(f.hub.intakeProcessor.process(intake, job), rollback);
  assert.equal((await f.store.get('intakes', intake.id))?.state, 'scanning');
  assert.equal((await f.store.get('jobs', job.id))?.state, 'running');
  assert.deepEqual(await f.store.all('versions'), []);
  assert.deepEqual(await f.store.all('scans'), []);
  assert.deepEqual(await f.store.all('resource_evaluations'), []);
});

test('重扫复用同一记录，跨版本复制成功结果并保留来源', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  const [queued] = await f.store.listQueuedEvaluations(1);
  assert.equal(
    (await f.hub.evaluations.request(intake.version_id, contentScanRuleset))?.id,
    queued.id,
  );
  await assert.rejects(
    f.store.insert('resource_evaluations', { ...queued, id: randomUUID() }),
    /unique/i,
  );
  await f.worker.tick();
  const completed = await f.store.get('resource_evaluations', queued.id);
  assert.equal(completed?.state, 'succeeded');
  assert.deepEqual(
    completed.dimensions.map((d) => d.status),
    ['scored', 'pending', 'pending', 'pending', 'pending'],
  );
  await assert.rejects(
    f.store.put('resource_evaluations', { ...completed, priority: 100 }),
    /immutable/,
  );
  await f.hub.intakes.rescan(f.admin, intake.id, randomUUID());
  await f.worker.tick();
  assert.deepEqual(await f.store.listVersionEvaluations(intake.version_id), [completed]);
  const next = await receiveSkill(f, { assetId: intake.asset_id, version: '1.1.0' });
  const [copy] = await f.store.listVersionEvaluations(next.version_id);
  assert.notEqual(copy.id, queued.id);
  assert.equal(copy.reused_from, queued.id);
  assert.equal(copy.scan_ruleset, contentScanRuleset);
  assert.deepEqual(copy.dimensions, completed.dimensions);
  assert.equal(copy.active_job_id, null);
  assert.deepEqual(await f.store.where('jobs', 'aggregate_id', copy.id), []);
});

test('过期执行者无法提交阶段结果，新租约在原作业完成评测', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  await f.hub.evaluations.schedule();
  const old = await f.hub.jobs.claim('first', ['resource_evaluation']);
  assert(old?.kind === 'resource_evaluation');
  const started = deferred();
  const proceed = deferred();
  const read = f.blobs.read.bind(f.blobs);
  t.mock.method(f.blobs, 'read', async (ref: string) => {
    started.resolve();
    await proceed.promise;
    return read(ref);
  });
  const stale = f.hub.evaluationRunner.process(old);
  await started.promise;
  await f.store.put('jobs', { ...old, lease_until: Date.now() - 1 });
  const next = await f.hub.jobs.claim('second', ['resource_evaluation']);
  assert(next?.kind === 'resource_evaluation' && next.id === old.id);
  proceed.resolve();
  await assert.rejects(stale, (error) => error instanceof HubError && error.code === 'LEASE_LOST');
  assert.equal((await f.store.listVersionEvaluations(intake.version_id))[0].state, 'running');
  assert.equal(await f.hub.evaluationRunner.process(next), 'succeeded');
  const [row] = await f.store.listVersionEvaluations(intake.version_id);
  assert.equal(row.stages[0].state, 'succeeded');
  assert.equal(row.stages[0].requests, 0);
  assert.equal((await f.store.get('jobs', old.id))?.state, 'succeeded');
});

test('固定文件存储故障按 30、120 秒退避，第三次失败同时结算阶段与作业', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  const version = await f.store.get('versions', intake.version_id);
  assert(version);
  await f.blobs.remove(version.files[0].blob_ref);
  for (const [index, delay] of [30000, 120000, 0].entries()) {
    const start = Date.now();
    await f.worker.tick();
    const [row] = await f.store.listVersionEvaluations(intake.version_id);
    const [job] = await f.store.where('jobs', 'aggregate_id', row.id);
    assert.equal(job.attempt, index + 1);
    assert.equal(job.last_error_code, 'BLOB_MISSING');
    if (delay) {
      assert.equal(row.state, 'running');
      assert.equal(job.state, 'queued');
      assert(job.run_after >= start + delay && job.run_after <= Date.now() + delay);
      await f.store.put('jobs', { ...job, run_after: 0 });
    } else {
      assert.equal(job.state, 'failed');
      assert.equal(row.state, 'failed');
      assert.equal(row.dimensions[0].status, 'failed');
      assert.equal(row.failure_code, 'BLOB_MISSING');
      assert.equal(row.active_job_id, null);
    }
  }
});

test('候选、公开、受限和历史版本分别按审核范围与发布受众投影', async (t) => {
  const f = await createTestHub(t);
  const owner = await signIn(f);
  const reviewer = await signIn(f, 'reviewer');
  const reader = await signIn(f, 'reader');
  const anonymous = httpClient(f);
  const intake = await receiveSkill(f);
  const publicPath =
    '/api/assets/' + intake.asset_id + '/versions/' + intake.version_id + '/evaluation';
  const historyPath = '/api/management/versions/' + intake.version_id + '/evaluations';
  for (const client of [anonymous, reader, owner, reviewer])
    await client.get(publicPath).expect(404);
  await anonymous.get(historyPath).expect(401);
  await reader.get(historyPath).expect(403);
  await reviewer.get(historyPath).expect(403);
  const history = managementEvaluationsResponseSchema.parse(
    (await owner.get(historyPath).expect(200)).body,
  );
  assert.equal(history.items[0].state, 'queued');
  const request = await submitPublication(f, intake);
  await reviewer.get(historyPath).expect(200);
  await f.hub.publications.decide(
    f.reviewer,
    request.id,
    {
      decision: 'approve',
      comment: '已复核',
      policy_digest: request.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  assert.deepEqual((await anonymous.get(publicPath).expect(200)).body, {
    current_rubric_version: evaluationRubricVersion,
    updating: false,
    comparison_status: 'none',
    can_view_details: false,
    can_request: false,
    evaluation: null,
    baseline: null,
  });
  await f.worker.tick();
  const response = await anonymous.get(publicPath).expect(200);
  await anonymous.get(publicPath.replace(intake.asset_id, 'sample-skill')).expect(200);
  const adminToken = await f.hub.tokens.issue(f.admin, { name: '评测读取', scope: 'hub:read' });
  const readerToken = await f.hub.tokens.issue(f.reader, { name: '评测读取', scope: 'hub:read' });
  const consumer = httpClient(f).set('Authorization', 'Bearer ' + adminToken.token);
  const limited = httpClient(f).set('Authorization', 'Bearer ' + readerToken.token);
  assert.deepEqual((await consumer.get(publicPath).expect(200)).body, response.body);
  await consumer.get('/api/publication-requests/' + request.id + '/evaluation').expect(403);
  await consumer.get(historyPath).expect(403);
  await consumer.post(historyPath).set('Idempotency-Key', randomUUID()).send({}).expect(403);
  const { evaluation, baseline } = evaluationResponseSchema.parse(response.body);
  assert.equal(baseline, null);
  assert(evaluation && response.headers.etag);
  assert.equal(evaluation.scan_ruleset, contentScanRuleset);
  assert.equal(evaluation.dimensions[0].checks.length, 9);
  assert.equal(evaluation.dimensions[0].confidence, 'high');
  assert.equal(evaluation.dimensions[0].band, 'good');
  const directory = (await anonymous.get('/api/assets').expect(200)).body as SearchResultResponse;
  assert.deepEqual(directory.items[0].current_release.evaluation, {
    dimensions: [
      { id: 'structure', score: evaluation.dimensions[0].score, band: 'good', confidence: 'high' },
    ],
  });
  assert.deepEqual(Object.keys(evaluation.dimensions[0].checks[0]).sort(), [
    'id',
    'label',
    'verdict',
  ]);
  for (const key of [
    'evidence',
    'summary',
    'note',
    'suggestion',
    'stages',
    'context',
    'cases',
    'requests',
    'active_job_id',
    'reused_from',
  ])
    assert(!JSON.stringify(response.body).includes('"' + key + '":'), key);
  const detailed = managementEvaluationsResponseSchema.parse(
    (await reviewer.get(historyPath).expect(200)).body,
  );
  assert(detailed.items[0].dimensions[0].checks[0].note);
  assert(detailed.items[0].dimensions[0].checks[0].evidence.length);
  const next = await publishSkill(f, {
    assetId: intake.asset_id,
    version: '2.0.0',
    body: '另一份正文',
    distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
  });
  await f.worker.tick();
  const restricted =
    '/api/assets/' + intake.asset_id + '/versions/' + next.intake.version_id + '/evaluation';
  const hidden = (await anonymous.get('/api/assets').expect(200)).body as SearchResultResponse;
  assert.deepEqual(hidden.items, []);
  for (const path of [publicPath, restricted]) {
    await anonymous.get(path).expect(404);
    await limited.get(path).expect(404);
    await reader.get(path).expect(404);
    await consumer.get(path).expect(200);
    await reviewer.get(path).expect(200);
  }
  await owner.get(publicPath.replace(intake.asset_id, randomUUID())).expect(404);
});

test('删除未发布版本与整项资产时清理评测及已排入的阶段作业', async (t) => {
  const f = await createTestHub(t);
  const first = await receiveSkill(f);
  const second = await receiveSkill(f, {
    assetId: first.asset_id,
    version: '1.1.0',
    body: '不同正文',
  });
  await f.hub.evaluations.schedule();
  const [row] = await f.store.listVersionEvaluations(second.version_id);
  assert(row.active_job_id);
  let asset = await f.hub.assetAccess.getAsset(first.asset_id);
  await f.hub.lifecycle.deleteVersion(
    f.admin,
    second.version_id,
    { reason: '放弃版本' },
    '"' + asset.revision + '"',
    randomUUID(),
  );
  assert.deepEqual(await f.store.listVersionEvaluations(second.version_id), []);
  assert.equal(await f.store.get('jobs', row.active_job_id), undefined);
  assert.equal((await f.store.listVersionEvaluations(first.version_id)).length, 1);
  asset = await f.hub.assetAccess.getAsset(first.asset_id);
  await f.hub.lifecycle.deleteAsset(
    f.admin,
    asset.id,
    { reason: '放弃发布' },
    '"' + asset.revision + '"',
    randomUUID(),
  );
  assert.deepEqual(await f.store.all('resource_evaluations'), []);
});

test('并行调度只登记可用名额，恢复后领取旧作业仍给其他内容留位', async (t) => {
  const f = await createTestHub(t, { workerConcurrency: 3, evaluationConcurrency: 1 });
  const first = await receiveSkill(f);
  const version = await f.store.get('versions', first.version_id);
  assert(version);
  const second = await f.store.insert('versions', {
    ...version,
    id: randomUUID(),
    version_label: '1.1.0',
  });
  const row = await f.hub.evaluations.request(second.id, contentScanRuleset);
  assert(row);
  await Promise.all([f.hub.evaluations.schedule(), f.hub.evaluations.schedule()]);
  assert.equal((await f.store.listRunningEvaluationSubjects()).length, 1);
  assert.equal((await f.store.listQueuedEvaluations(3)).length, 1);
  const restored = await f.hub.jobs.enqueue('resource_evaluation', row.id, {
    evaluation_id: row.id,
    stage: 'static',
  });
  await f.store.put('jobs', { ...restored, run_after: 0 });
  const other = await f.hub.jobs.enqueue('intake', randomUUID(), {});
  const held = await f.hub.jobs.claim('worker-1', ['resource_evaluation']);
  assert.equal(held?.id, restored.id);
  assert.deepEqual(
    (await f.hub.jobs.claimBatch('worker-2')).map((job) => job.id),
    [other.id],
  );
});

test('相同内容的两个版本同时排队时，空闲名额不会重复启动静态分析', async (t) => {
  const f = await createTestHub(t, { workerConcurrency: 3, evaluationConcurrency: 2 });
  const first = await receiveSkill(f);
  const version = await f.store.get('versions', first.version_id);
  assert(version);
  const other = await f.store.insert('versions', {
    ...version,
    id: randomUUID(),
    version_label: '1.2.0',
  });
  await f.hub.evaluations.request(other.id, contentScanRuleset);
  await Promise.all([f.hub.evaluations.schedule(), f.hub.evaluations.schedule()]);
  assert.equal((await f.store.listRunningEvaluationSubjects()).length, 1);
  const [waiting] = await f.store.listQueuedEvaluations(2);
  assert(waiting);
  await f.worker.tick();
  await f.worker.tick();
  const copy = await f.store.get('resource_evaluations', waiting.id);
  assert(copy?.reused_from);
  assert.equal(copy.state, 'succeeded');
  const source = await f.store.get('resource_evaluations', copy.reused_from);
  assert.equal(source?.state, 'succeeded');
  assert.deepEqual(copy.dimensions, source.dimensions);
  assert.deepEqual(await f.store.where('jobs', 'aggregate_id', copy.id), []);
});

test('名额受限时轮转检查越过队首后，空出的名额仍按优先级启动最早的记录', async (t) => {
  freezeUtcDay(t);
  const f = await createTestHub(t, { evaluationConcurrency: 1 });
  const intake = await receiveSkill(f);
  const request = await submitPublication(f, intake);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  const source = (await f.store.get('versions', intake.version_id))!;
  // 不同内容摘要使各条记录属于不同主体，互不复用也不互斥。
  const version = (label: string) =>
    f.store.insert('versions', {
      ...source,
      id: randomUUID(),
      version_label: label,
      content_digest: 'sha256:' + sha256(label),
    });
  const occupant = await f.hub.evaluations.request((await version('0.9.0')).id, contentScanRuleset);
  await f.hub.evaluations.schedule();
  assert.equal((await f.store.get('resource_evaluations', occupant!.id))?.state, 'running');
  const urgent = [];
  for (let i = 0; i < 8; i++) {
    // 逐条推进时钟，使登记顺序即队列顺序，不依赖随机 ID。
    t.mock.timers.tick(1);
    const copy = await version('2.0.' + i);
    await f.hub.evaluations.requestPublication('submission', { ...request, version_id: copy.id });
    urgent.push((await f.store.listVersionEvaluations(copy.id))[0]);
  }
  const low = await f.hub.evaluations.request((await version('3.0.0')).id, contentScanRuleset);
  assert(low && urgent.every((row) => row.priority > low.priority));
  await f.hub.evaluations.schedule();
  for (const row of [...urgent, low])
    assert.equal((await f.store.get('resource_evaluations', row.id))?.state, 'queued');
  // 直接领取在途作业，不再调度，保留上一轮轮转检查留下的位置。
  const busy = await f.hub.jobs.claim('evaluation-test', ['resource_evaluation']);
  assert(busy?.kind === 'resource_evaluation' && busy.aggregate_id === occupant!.id);
  await f.hub.evaluationRunner.process(busy);
  const next = await claimEvaluation(f);
  assert.equal(next.aggregate_id, urgent[0].id);
  assert.equal((await f.store.get('resource_evaluations', low.id))?.state, 'queued');
});

test('MCP 接收就绪不会登记评测', async (t) => {
  const f = await createTestHub(t);
  const receipt = await f.hub.intakes.receive(
    f.admin,
    Buffer.from(
      JSON.stringify({
        name: 'io.example/sample',
        description: '测试',
        version: '1.0.0',
        remotes: [{ type: 'streamable-http', url: 'https://example.test/mcp' }],
      }),
    ),
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
  await f.worker.tick();
  const ready = await f.store.get('intakes', receipt.intake_id);
  assert.equal(ready?.state, 'ready');
  const response = await (
    await signIn(f)
  )
    .post('/api/management/versions/' + ready.version_id + '/evaluations')
    .set('Idempotency-Key', randomUUID())
    .send({})
    .expect(422);
  assert.equal(response.body.error.code, 'EVALUATION_UNSUPPORTED_KIND');
  assert.deepEqual(await f.store.all('resource_evaluations'), []);
});

test('格式 3 往返保留评测终态和调度单例，兼容旧 SQLite 文本，格式 2 可缺少两表', async (t) => {
  const f = await createTestHub(t);
  const intake = await receiveSkill(f);
  await f.worker.tick();
  const [original] = await f.store.listVersionEvaluations(intake.version_id);
  const historical = structuredClone(original);
  historical.id = randomUUID();
  historical.rubric_version = '2026-11-24.4';
  delete historical.recovery_requests;
  historical.dimensions[0].summary = '证\0据\ud800😀\\u0000';
  await assert.rejects(f.store.insert('resource_evaluations', historical));
  const sqlite = new DatabaseSync(join(f.directory, 'hub.sqlite'));
  try {
    sqlite
      .prepare('INSERT INTO resource_evaluations(id,data) VALUES (?,?)')
      .run(historical.id, JSON.stringify(historical));
  } finally {
    sqlite.close();
  }
  const expected = structuredClone(historical);
  expected.dimensions[0].summary = '证�据�😀\\u0000';
  assert.deepEqual(await f.store.get('resource_evaluations', historical.id), expected);
  const rows = await f.store.listVersionEvaluations(intake.version_id);
  assert.deepEqual(
    rows.find((row) => row.id === historical.id),
    expected,
  );
  const schedule = await f.store.insert('evaluation_schedule', {
    id: 'resource-evaluations',
    reserved: 0,
    window_start: 0,
    updated_at: new Date().toISOString(),
  });
  const target = join(f.directory, 'backup');
  const operation = (name: string, directory: string) =>
    promisify(execFile)(
      process.execPath,
      ['--conditions=development', '--import', 'tsx', 'scripts/operations/' + name + '.ts', target],
      {
        env: {
          CAPABILITY_HUB_DATA_DIR: directory,
          CAPABILITY_HUB_INSTANCE_SECRET: 'ab'.repeat(32),
          CAPABILITY_HUB_LOG_LEVEL: 'silent',
        },
      },
    );
  await operation('backup', f.directory);
  const manifestPath = join(target, 'backup.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    schema: number;
    records_sha256: string;
  };
  assert.equal(manifest.schema, 3);
  const recordsPath = join(target, 'records.json');
  const records = JSON.parse(await readFile(recordsPath, 'utf8')) as Record<string, unknown>;
  assert.deepEqual(records.resource_evaluations, await f.store.all('resource_evaluations'));
  // 旧格式 3 的摘要按原始记录字节计算，导入时才能转换旧证据。
  const oldDump = JSON.stringify({ ...records, resource_evaluations: [original, historical] });
  await writeFile(recordsPath, oldDump);
  await writeFile(manifestPath, JSON.stringify({ ...manifest, records_sha256: sha256(oldDump) }));
  const restored = await createSqliteStore(t);
  await operation('restore-import', restored.directory);
  assert.deepEqual(await restored.store.listVersionEvaluations(intake.version_id), rows);
  assert.deepEqual(await restored.store.evaluationSchedule(), schedule);
  delete records.resource_evaluations;
  delete records.evaluation_schedule;
  const data = JSON.stringify(records);
  await writeFile(recordsPath, data);
  await writeFile(manifestPath, JSON.stringify({ ...manifest, records_sha256: sha256(data) }));
  const legacy = await createSqliteStore(t);
  await assert.rejects(operation('restore-import', legacy.directory), /备份记录格式无效/);
  await writeFile(
    manifestPath,
    JSON.stringify({ ...manifest, schema: 2, records_sha256: sha256(data) }),
  );
  await operation('restore-import', legacy.directory);
  assert.deepEqual(await legacy.store.listVersionEvaluations(intake.version_id), []);
  assert.equal(await legacy.store.evaluationSchedule(), undefined);
  assert(await legacy.store.get('versions', intake.version_id));
});

async function evaluationHub(
  t: TestContext,
  overrides: Parameters<typeof evaluationModelHandler>[0] = {},
  daily = 300,
  concurrency = 1,
) {
  const stub = await serveModelStub(t, evaluationModelHandler(overrides));
  const profile = stub.profile('openai');
  const f = await createTestHub(t, {
    evaluationDailyRequests: daily,
    evaluationConcurrency: concurrency,
    ai: aiConfigurationSchema.parse({ profiles: [profile], default_profile: profile.id }),
  });
  return { f, stub };
}

/** 精确的额度总数要求整条阶段链落在同一 UTC 日窗口，否则跨零点重置会使断言失败。 */
function freezeUtcDay(t: TestContext) {
  t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 24, 12) });
}

async function claimEvaluation(f: TestHub) {
  await f.hub.evaluations.schedule();
  const job = await f.hub.jobs.claim('evaluation-test', ['resource_evaluation']);
  assert(job?.kind === 'resource_evaluation');
  return job;
}

async function claimStage(f: TestHub, stage: string) {
  const completed = new Set<string>();
  for (;;) {
    const job = await claimEvaluation(f);
    if (job.input.stage === stage) return job;
    assert(!completed.has(job.input.stage), '等待阶段时重复领取了 ' + job.input.stage);
    completed.add(job.input.stage);
    await f.hub.evaluationRunner.process(job);
  }
}

async function queueEvaluationCopy(
  f: TestHub,
  request: Awaited<ReturnType<typeof submitPublication>>,
  versionLabel: string,
  trigger: 'submission' | 'release' = 'release',
) {
  const source = await f.store.get('versions', request.version_id);
  assert(source);
  const copy = await f.store.insert('versions', {
    ...source,
    id: randomUUID(),
    version_label: versionLabel,
  });
  await f.hub.evaluations.requestPublication(trigger, { ...request, version_id: copy.id });
  const [evaluation] = await f.store.listVersionEvaluations(copy.id);
  assert(evaluation);
  return { version: copy, evaluation };
}

async function approveEvaluationCandidate(
  f: TestHub,
  request: Awaited<ReturnType<typeof submitPublication>>,
) {
  return f.hub.publications.decide(
    f.reviewer,
    request.id,
    {
      decision: 'approve',
      comment: '审核通过',
      policy_digest: request.policy_digest,
      accepted_warnings: [],
    },
    '"' + request.revision + '"',
    randomUUID(),
  );
}

async function assertPublicationRollback(
  t: TestContext,
  f: TestHub,
  command: () => Promise<unknown>,
  checkPendingWrites: () => Promise<void>,
) {
  const failure = new Error('发布操作幂等回执写入失败');
  const insert = f.store.insert.bind(f.store);
  const fault = t.mock.method(f.store, 'insert', (async (table, row) => {
    if (table === 'idempotency') {
      await checkPendingWrites();
      throw failure;
    }
    return insert(table, row);
  }) satisfies typeof f.store.insert);
  try {
    await assert.rejects(command(), failure);
  } finally {
    fault.mock.restore();
  }
}

test('提交和批准各自随业务回滚，批准沿用提交评测，公开响应只保留有依据的固定判定', async (t) => {
  freezeUtcDay(t);
  const { f, stub } = await evaluationHub(t, {
    transparency: () => ({
      json: openAiJson({
        ...transparent,
        credentials: { ...modelCheck, evidence: [{ ...citation, end_line: 9999 }] },
        manipulation: { suspected: true, evidence: [citation], note: '维护者可见的操纵依据' },
      }),
    }),
  });
  const intake = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  const rows = () => f.store.listVersionEvaluations(intake.version_id);
  await assertPublicationRollback(
    t,
    f,
    () => submitPublication(f, intake),
    async () => {
      assert.equal((await f.store.where('requests', 'version_id', intake.version_id)).length, 1);
      assert((await rows()).some((r) => r.trigger === 'submission'));
    },
  );
  assert.deepEqual(await f.store.where('requests', 'version_id', intake.version_id), []);
  assert.equal((await rows()).length, 1);
  const request = await submitPublication(f, intake);
  const full = (await rows()).find((r) => r.scope === 'full')!;
  assert.equal(full.audience_class, 'public');
  assert.equal(full.requires_api_key, false);
  assert.equal(full.priority, 100);
  assert(full.reused_from && full.evaluator_digest);
  await assertPublicationRollback(
    t,
    f,
    () => approveEvaluationCandidate(f, request),
    async () => {
      assert.equal((await f.store.all('releases')).length, 1);
      assert.deepEqual(
        (await rows()).filter((r) => r.scope === 'full').map((r) => r.id),
        [full.id],
      );
    },
  );
  assert.equal((await f.store.all('releases')).length, 0);
  assert.equal((await f.store.get('requests', request.id))?.state, 'pending');
  const stage = await claimStage(f, 'transparency');
  assert.equal(stage.input.stage, 'transparency');
  await f.hub.evaluationRunner.process(stage);
  await approveEvaluationCandidate(f, request);
  assert.equal((await rows()).length, 2);
  const done = (await f.store.get('resource_evaluations', full.id))!;
  assert.equal(done.state, 'succeeded');
  assert.deepEqual(
    done.stages.map((s) => [s.id, s.requests]),
    [
      ['static', 0],
      ['trigger-cases', 1],
      ['trigger-routing', 16],
      ['instructions', 2],
      ['task-cases', 1],
      ['task-run-1', 3],
      ['task-run-2', 3],
      ['task-run-3', 3],
      ['task-run-4', 3],
      ['transparency', 1],
    ],
  );
  const triggering = done.dimensions.find((d) => d.id === 'triggering')!;
  assert.equal(triggering.score, 81);
  assert.equal(triggering.confidence, 'medium');
  assert.partialDeepStrictEqual(triggering.metrics, {
    should_hit: 7,
    should_total: 8,
    near_miss_avoided: 6,
    near_miss_total: 8,
  });
  const instructions = done.dimensions.find((d) => d.id === 'instructions')!;
  assert.equal(instructions.score, 100);
  assert.equal(instructions.confidence, 'high');
  assert.equal(
    instructions.checks.find((c) => c.id === 'instructions.script_robustness')?.verdict,
    'na',
  );
  const effect = done.dimensions.find((d) => d.id === 'effectiveness')!;
  assert.equal(effect.score, 100);
  assert.equal(effect.confidence, 'medium');
  assert.partialDeepStrictEqual(effect.metrics, {
    valid_assertions: 16,
    total_assertions: 16,
    invalid_rate: 0,
    pass_with: 1,
    pass_without: 0.5,
    uplift_pp: 50,
    normalized_gain: 1,
  });
  const generation = evaluationModelInput(stub.requests[0]);
  assert(!generation.includes('sample-skill'));
  assert(!generation.includes('团队工程实践'));
  assert(generation.includes('使用项目现有的命名与模块边界'));
  const routes = stub.requests.filter((r) => evaluationModelStep(r) === 'trigger-routing');
  assert.equal(routes.length, 16);
  for (const route of routes) {
    const { choices } = JSON.parse(evaluationModelInput(route)) as {
      choices: Record<string, unknown>[];
    };
    assert.equal(choices.length, 3);
    assert(choices.some((choice) => choice.name === 'sample-skill'));
    for (const choice of choices)
      assert.deepEqual(Object.keys(choice).sort(), ['description', 'name']);
  }
  assert(!JSON.stringify(done).includes('私有参考交付正文'));
  assert(!JSON.stringify(done).includes('私有基准交付正文'));
  const dim = done.dimensions.find((d) => d.id === 'transparency')!;
  assert.equal(dim.score, 20);
  assert.equal(dim.confidence, 'medium');
  assert.deepEqual(dim.flags, ['manipulation_suspected']);
  assert.equal(dim.checks.find((c) => c.id === 'transparency.credentials')?.verdict, 'na');
  assert.equal(done.stages.at(-1)?.requests, 1);
  assert.equal((await f.store.evaluationSchedule())?.reserved, 33);
  const execution = await f.hub.ai.runtime.get(done.stages.at(-1)!.execution_id!);
  assert.equal(execution.owner_id, 'system');
  assert.equal(execution.status, 'succeeded');
  assert.equal(execution.payload.operation_id, 'resource-evaluation');
  assert(!JSON.stringify(execution).includes('私有'));
  assert.equal(stub.requests.length, 33);
  const path = '/api/assets/' + intake.asset_id + '/versions/' + intake.version_id + '/evaluation';
  const response = await httpClient(f).get(path).expect(200);
  assert.equal(evaluationResponseSchema.parse(response.body).evaluation?.id, full.id);
  assert(!JSON.stringify(response.body).includes('私有'));
  const history = await (
    await signIn(f)
  )
    .get('/api/management/versions/' + intake.version_id + '/evaluations')
    .expect(200);
  assert(JSON.stringify(history.body).includes('私有评测总结'));
});

test('四次补发跨阶段共享，评分保留有效路由和单份指令样本，沿用证据不继承额度', async (t) => {
  freezeUtcDay(t);
  const dropped = evaluationTriggerCases[0].query.normalize('NFKC');
  const repaired = evaluationTriggerCases[1].query.normalize('NFKC');
  const routeSamples = new Map<string, number>();
  const standard = evaluationModelHandler();
  let instructions = 0;
  let judges = 0;
  const invalid = { json: openAiJson({ invalid: true }) };
  const { f, stub } = await evaluationHub(t, {
    'trigger-routing': (request, index) => {
      const { query } = JSON.parse(evaluationModelInput(request)) as { query: string };
      const key = query.normalize('NFKC');
      const count = (routeSamples.get(key) ?? 0) + 1;
      routeSamples.set(key, count);
      if (key === dropped || (key === repaired && count === 1))
        return { json: openAiJson({ choice: 'not-a-candidate', reason: '候选错误' }) };
      return standard(request, index);
    },
    instructions: (request, index) => (++instructions <= 2 ? invalid : standard(request, index)),
    'task-judge': (request, index) => (++judges === 1 ? invalid : standard(request, index)),
    transparency: () => invalid,
  });
  const intake = await receiveSkill(f);
  await f.hub.evaluations.manual(f.admin, intake.version_id, randomUUID());
  const final = await claimStage(f, 'transparency');
  assert.equal(await f.hub.evaluationRunner.process(final), 'failed');
  const row = (await f.store.get('resource_evaluations', final.aggregate_id))!;
  assert.equal(row.state, 'partial');
  assert.equal(row.recovery_requests, 4);
  assert.deepEqual(
    row.stages
      .filter((stage) => stage.recovery_requests)
      .map((stage) => [stage.id, stage.requests, stage.recovery_requests]),
    [
      ['trigger-routing', 18, 2],
      ['instructions', 3, 1],
      ['task-run-1', 4, 1],
    ],
  );
  assert.partialDeepStrictEqual(
    row.dimensions.find((d) => d.id === 'triggering'),
    {
      status: 'scored',
      score: 80,
      confidence: 'low',
      flags: ['coverage_limited'],
      metrics: { should_hit: 6, should_total: 7, near_miss_avoided: 6, near_miss_total: 8 },
    },
  );
  assert.partialDeepStrictEqual(
    row.dimensions.find((d) => d.id === 'instructions'),
    {
      status: 'scored',
      score: 100,
      confidence: 'low',
      flags: ['coverage_limited'],
    },
  );
  assert.equal(row.dimensions.find((d) => d.id === 'effectiveness')?.score, 100);
  assert.partialDeepStrictEqual(row.stages.at(-1), {
    requests: 1,
    failure_code: 'AI_OUTPUT_INVALID',
  });
  assert.equal(stub.requests.length, 37);
  assert.equal((await f.store.evaluationSchedule())?.reserved, 37);
  const owner = await signIn(f);
  const history = await owner
    .get('/api/management/versions/' + intake.version_id + '/evaluations')
    .expect(200);
  const evaluation = managementEvaluationsResponseSchema
    .parse(history.body)
    .items.find((item) => item.id === row.id);
  assert(evaluation);
  assert.equal(evaluation.stages.find((stage) => stage.id === 'trigger-routing')?.requests, 18);
  const manual = await f.hub.evaluations.manual(f.admin, intake.version_id, randomUUID());
  assert.equal(manual.evaluation.reused_from, row.id);
  const queued = await f.store.get('resource_evaluations', manual.evaluation.id);
  assert.equal(queued?.recovery_requests, 0);
  assert.deepEqual(queued.stages.slice(0, -1), row.stages.slice(0, -1));
  const retry = await claimEvaluation(f);
  let transparency = 0;
  stub.setHandler(
    evaluationModelHandler({
      transparency: () => (++transparency === 1 ? invalid : { json: openAiJson(transparent) }),
    }),
  );
  assert.equal(await f.hub.evaluationRunner.process(retry), 'succeeded');
  const result = await f.store.get('resource_evaluations', retry.aggregate_id);
  assert.equal(result?.recovery_requests, 1);
  assert.equal((await f.store.evaluationSchedule())?.reserved, 39);
});

test('并行评测只争用正常计划外的一次补发，常规调用在原 UTC 窗口全部完成', async (t) => {
  freezeUtcDay(t);
  const failedQueries = new Set(
    evaluationTriggerCases.slice(0, 2).map(({ query }) => query.normalize('NFKC')),
  );
  const { f, stub } = await evaluationHub(
    t,
    {
      'trigger-routing': (request) => {
        const { query } = JSON.parse(evaluationModelInput(request)) as { query: string };
        return {
          json: openAiJson({
            choice: failedQueries.has(query.normalize('NFKC')) ? 'not-a-candidate' : null,
            reason: '测试候选',
          }),
        };
      },
    },
    67,
    2,
  );
  const routing = async (slug: string) => {
    const item = await receiveSkill(f, { slug });
    await f.hub.evaluationRunner.process(await claimEvaluation(f));
    await submitPublication(f, item);
    return claimStage(f, 'trigger-routing');
  };
  const first = await routing('first-skill');
  const second = await routing('second-skill');
  assert.deepEqual(
    await Promise.all([first, second].map((job) => f.hub.evaluationRunner.process(job))),
    ['succeeded', 'succeeded'],
  );
  assert.equal((await f.store.evaluationSchedule())?.reserved, 35);
  for (let i = 0; i < 14; i++) {
    const job = await claimEvaluation(f);
    assert.equal(await f.hub.evaluationRunner.process(job), 'succeeded');
  }
  const rows = await Promise.all(
    [first, second].map((job) => f.store.get('resource_evaluations', job.aggregate_id)),
  );
  assert.deepEqual(rows.map((row) => row?.recovery_requests).sort(), [0, 1]);
  for (const row of rows) {
    assert.equal(row?.state, 'succeeded');
    assert.partialDeepStrictEqual(
      row.dimensions.find((dim) => dim.id === 'triggering'),
      {
        status: 'scored',
        score: 50,
        confidence: 'low',
        flags: ['coverage_limited'],
        metrics: { should_hit: 0, should_total: 6, near_miss_avoided: 8, near_miss_total: 8 },
      },
    );
  }
  // 第二次接收会推进首次接收排入的流式资源审计；这里只有非流式评测进入额度。
  const modelRequests = stub.requests.filter(
    ({ body }) => !(body && typeof body === 'object' && 'stream' in body && body.stream === true),
  );
  assert.equal(modelRequests.length, 67);
  assert.equal((await f.store.evaluationSchedule())?.reserved, 67);
});

test('UTC 日额度或执行上限刚好容纳常规调用时，路由失败不补发也不挤占余下计划', async (t) => {
  freezeUtcDay(t);
  const dropped = evaluationTriggerCases[0].query.normalize('NFKC');
  const standard = evaluationModelHandler();
  for (const [daily, executionLimit] of [
    [33, 96],
    [300, 16],
  ]) {
    const { f, stub } = await evaluationHub(
      t,
      {
        'trigger-routing': (request, index) => {
          const { query } = JSON.parse(evaluationModelInput(request)) as { query: string };
          return query.normalize('NFKC') === dropped
            ? { json: openAiJson({ invalid: true }) }
            : standard(request, index);
        },
      },
      daily,
    );
    f.hub.ai.runtime.config.max_requests = executionLimit;
    const item = await receiveSkill(f);
    await f.hub.evaluations.manual(f.admin, item.version_id, randomUUID());
    const final = await claimStage(f, 'transparency');
    assert.equal(await f.hub.evaluationRunner.process(final), 'succeeded');
    const row = await f.store.get('resource_evaluations', final.aggregate_id);
    assert.equal(row?.state, 'succeeded');
    assert.equal(row.recovery_requests, 0);
    assert.partialDeepStrictEqual(
      row.dimensions.find((d) => d.id === 'triggering'),
      {
        status: 'scored',
        confidence: 'low',
        metrics: { should_total: 7, near_miss_total: 8 },
      },
    );
    assert.equal(stub.requests.length, 33);
    assert.equal((await f.store.evaluationSchedule())?.reserved, 33);
  }
});

test('路由中的一次鉴权失败、200 错误信封或非法限流头立即终止阶段，不补发或按缺样本计分', async (t) => {
  const standard = evaluationModelHandler();
  for (const failure of [
    { status: 401, json: {} },
    { status: 200, json: { error: { type: 'server_error', code: '500' } } },
    { status: 429, headers: { 'retry-after': '60, 60' } },
  ]) {
    let sentFailure = false;
    const { f, stub } = await evaluationHub(t, {
      'trigger-routing': (request, index) => {
        if (sentFailure) return standard(request, index);
        sentFailure = true;
        return failure;
      },
    });
    const item = await receiveSkill(f);
    await f.hub.evaluations.manual(f.admin, item.version_id, randomUUID());
    const routing = await claimStage(f, 'trigger-routing');
    assert.equal(await f.hub.evaluationRunner.process(routing), 'failed');
    const row = await f.store.get('resource_evaluations', routing.aggregate_id);
    assert.equal(row?.recovery_requests, 0);
    assert.equal(row.dimensions.find((dim) => dim.id === 'triggering')?.status, 'failed');
    const stage = row.stages.find((s) => s.id === 'trigger-routing');
    assert.equal(stage?.failure_code, 'AI_PROVIDER_FAILED');
    assert(stage.execution_id);
    const calls = await f.hub.ai.runtime.store.list('ai_calls', {
      execution_id: stage.execution_id,
      limit: 2,
    });
    const failed = calls.filter((c) => c.status === 'failed');
    assert.equal(failed.length, 1);
    assert.equal(failed[0].payload.output_check, undefined);
    assert.equal(failed[0].payload.diagnostics.transport?.http_status, failure.status);
    assert.equal(
      stub.requests.filter((r) => evaluationModelStep(r) === 'trigger-routing').length,
      2,
    );
  }
});

test('路由失败使任一类不足六条时阶段记失败以便补跑，持续 503 每问只重发一次即停止', async (t) => {
  freezeUtcDay(t);
  const positives = new Set(
    evaluationTriggerCases
      .filter(({ kind }) => kind === 'should_trigger')
      .slice(0, 3)
      .map(({ query }) => query.normalize('NFKC')),
  );
  const standard = evaluationModelHandler();
  const outcomes = [
    {
      route: ((request, index) => {
        const { query } = JSON.parse(evaluationModelInput(request)) as { query: string };
        return positives.has(query.normalize('NFKC'))
          ? { json: openAiJson({ choice: 'not-a-candidate', reason: '候选错误' }) }
          : standard(request, index);
      }) satisfies StubHandler,
      code: 'AI_OUTPUT_INVALID',
      requests: 7,
      recoveries: 3,
    },
    {
      route: (() => ({ status: 503, json: {} })) satisfies StubHandler,
      code: 'AI_PROVIDER_FAILED',
      requests: 4,
      recoveries: 2,
    },
  ];
  for (const { route, code, requests, recoveries } of outcomes) {
    const { f, stub } = await evaluationHub(t, { 'trigger-routing': route });
    const item = await receiveSkill(f);
    await f.hub.evaluations.manual(f.admin, item.version_id, randomUUID());
    const routing = await claimStage(f, 'trigger-routing');
    assert.equal(await f.hub.evaluationRunner.process(routing), 'failed');
    const row = await f.store.get('resource_evaluations', routing.aggregate_id);
    assert(row);
    assert.partialDeepStrictEqual(
      row.stages.find((stage) => stage.id === 'trigger-routing'),
      { state: 'failed', failure_code: code, requests, recovery_requests: recoveries },
    );
    assert.equal(row.dimensions.find((dim) => dim.id === 'triggering')?.status, 'failed');
    assert.equal(
      stub.requests.filter((request) => evaluationModelStep(request) === 'trigger-routing').length,
      requests,
    );
  }
});

test('作者用例优先，不能纸面核对的断言、越界行号与引用另一份交付物的通过判定均不计分', async (t) => {
  let sample = 0;
  const firstAuthor = '按交接任务单整理输入条件';
  const secondAuthor = '给接手者列出核对步骤';
  const { f, stub } = await evaluationHub(t, {
    instructions: () => {
      sample++;
      return {
        json: openAiJson({
          checks: evaluationInstructionChecks().map((c) => {
            if (c.id === 'instructions.timeless')
              return { ...c, evidence: [{ ...citation, end_line: 999 }] };
            if (c.id === 'instructions.purpose_scope' && sample === 2)
              return { ...c, verdict: 'partial' };
            return c;
          }),
        }),
      };
    },
    'task-judge': (request) => {
      const input = evaluationModelInput(request);
      const pair = JSON.parse(input) as { prompt: string; A: string };
      const result = evaluationJudge(input);
      if (pair.prompt === firstAuthor) {
        const side = pair.A.includes('详尽') ? 'a' : 'b';
        result.assertions[0][side] = { passed: true, quote: '简要 步骤' };
      }
      return { json: openAiJson(result) };
    },
  });
  const suite = {
    evals: [
      { prompt: '从站外下载并分析任务', files: ['https://example.invalid/input'] },
      { prompt: '从大型输入整理材料', files: ['evals/large.txt'] },
      { prompt: '读取二进制附件', files: ['evals/binary.bin'] },
      { prompt: '实际运行工具并上传生成文件', files: [] },
      {
        prompt: firstAuthor,
        expected_output: '交接清单',
        files: ['evals/input.txt'],
        assertions: ['交接编号有对应材料', { text: '联网检查交接服务', requires_execution: true }],
      },
      { prompt: secondAuthor, expected_output: '检查清单', assertions: ['列出核对方法'] },
      { prompt: '第三个合格作者用例不占生成样本', files: [] },
    ],
  };
  const profile = f.hub.ai.runtime.config.profiles[0];
  profile.request_timeout_ms = 120_000;
  profile.request_timeout_ms_overrides = { 'resource-evaluation/task-judge': 240_000 };
  const item = await receiveSkill(f, {
    files: [
      {
        path: 'SKILL.md',
        bytes: skillDocument(
          'sample-skill',
          '交接前用 [清理函数](scripts/normalize.mjs) 去掉编号两端的空白。',
        ),
        executable: false,
      },
      { path: 'evals/evals.json', bytes: Buffer.from(JSON.stringify(suite)), executable: false },
      {
        path: 'evals/input.txt',
        bytes: Buffer.from('这份材料只供交接任务核对'),
        executable: false,
      },
      { path: 'evals/large.txt', bytes: Buffer.from('文'.repeat(2800)), executable: false },
      { path: 'evals/binary.bin', bytes: Buffer.from([0, 255, 17]), executable: false },
      {
        path: 'scripts/normalize.mjs',
        bytes: Buffer.from('export const trim = (s) => s.trim();'),
        executable: false,
      },
    ],
  });
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  await submitPublication(f, item);
  const last = await claimStage(f, 'transparency');
  await f.hub.evaluationRunner.process(last);
  const record = (await f.store.get('resource_evaluations', last.aggregate_id))!;
  assert.equal(
    record.state,
    'succeeded',
    record.stages
      .filter((stage) => stage.state === 'failed')
      .map((stage) => stage.id + ' ' + stage.failure_code)
      .join(', '),
  );
  const tasks = record.cases!.tasks;
  assert.deepEqual(
    tasks.map((c) => c.origin),
    ['author', 'author', 'generated', 'generated'],
  );
  assert.deepEqual(
    tasks.slice(0, 2).map((c) => [c.prompt, c.expected]),
    [
      [firstAuthor, '交接清单'],
      [secondAuthor, '检查清单'],
    ],
  );
  assert.deepEqual(
    tasks.map((c) => c.assertions.length),
    [5, 4, 4, 4],
  );
  for (const request of stub.requests) {
    const { checks, assertions } = evaluationOutputSchema(request).properties;
    if (checks) {
      assert.partialDeepStrictEqual(checks.items?.properties?.id, {
        type: 'string',
        enum: evaluationInstructionChecks().map((item) => item.id),
      });
    }
    if (assertions) {
      const input = JSON.parse(evaluationModelInput(request)) as { assertions: string[] };
      assert.deepEqual(
        [assertions.minItems, assertions.maxItems],
        [input.assertions.length, input.assertions.length],
      );
    }
  }
  const executionId = record.stages.find((stage) => stage.id === 'task-run-1')?.execution_id;
  assert(executionId);
  const taskCalls = await f.hub.ai.runtime.store.list('ai_calls', {
    execution_id: executionId,
    limit: 3,
  });
  assert.deepEqual(
    taskCalls.map(({ payload: { diagnostics } }) => [
      diagnostics.step?.id,
      diagnostics.request_timeout_ms,
    ]),
    [
      ['task-without', 120_000],
      ['task-with', 120_000],
      ['task-judge', 240_000],
    ],
  );
  assert(tasks[0].assertions.includes('交接编号有对应材料'));
  assert(!tasks[0].assertions.includes('联网检查交接服务'));
  assert(tasks.every((c) => !c.assertions.includes('在线执行并取得运行值')));
  const authorRuns = stub.requests.filter((request) => {
    const step = evaluationModelStep(request);
    return (
      (step === 'task-with' || step === 'task-without') &&
      evaluationModelInput(request).includes(firstAuthor)
    );
  });
  assert.equal(authorRuns.length, 2);
  for (const request of authorRuns)
    assert(evaluationModelInput(request).includes('这份材料只供交接任务核对'));
  const instructions = record.dimensions.find((d) => d.id === 'instructions')!;
  assert.equal(instructions.score, 97);
  assert.equal(
    instructions.checks.find((c) => c.id === 'instructions.script_robustness')?.verdict,
    'pass',
  );
  const boundaryRequest = stub.requests.find(
    (request) => evaluationModelStep(request) === 'transparency',
  );
  assert(boundaryRequest);
  const declarations = JSON.parse(evaluationModelInput(boundaryRequest).split('\n')[1]) as {
    has_scripts: boolean;
  };
  assert.equal(declarations.has_scripts, true);
  assert.equal(instructions.checks.find((c) => c.id === 'instructions.purpose_scope')?.value, 0.75);
  const invalid = instructions.checks.find((c) => c.id === 'instructions.timeless')!;
  assert.equal(invalid.verdict, 'na');
  assert.deepEqual(invalid.evidence, []);
  const effect = record.dimensions.find((d) => d.id === 'effectiveness')!;
  assert.equal(effect.score, 94);
  assert.equal(effect.confidence, 'medium');
  assert.equal(effect.metrics?.pass_with, 16 / 17);
  assert.equal(effect.metrics?.pass_without, 8 / 17);
  assert.equal(effect.metrics?.valid_assertions, 16);
  assert.equal(effect.metrics?.total_assertions, 17);
  assert.equal(effect.metrics?.invalid_rate, 1 / 17);
  const judgment = record.stages.find((s) => s.id === 'task-run-1')?.assertion_results?.[0];
  assert.equal(judgment?.with_skill.passed, false);
  assert.equal(judgment.with_skill.valid, false);
  assert.equal(judgment.without_skill.passed, true);
});

test('盲评按单侧保留完整的限长引文，不采信超限、伪造或未送出的内容', async (t) => {
  freezeUtcDay(t);
  const longer = '依据'.repeat(100) + '。';
  const atLimit = '𠮷'.repeat(320);
  const overLimit = '证'.repeat(321);
  const forged = '𠮷'.repeat(203) + '伪造尾部';
  const notSent = '仅在未截断交付物中的结论';
  const { f, stub } = await evaluationHub(t, {
    'task-without': () => ({
      json: openAiJson({ output: `简要    步骤\n${longer}\n${'基'.repeat(7600)}` }),
    }),
    'task-with': () => ({
      json: openAiJson({
        output: `详尽    步骤\n${atLimit}\n${overLimit}\n${'材'.repeat(7000)}\n${notSent}`,
      }),
    }),
    'task-judge': (request) => {
      const input = evaluationModelInput(request);
      const pair = JSON.parse(input) as { prompt: string; A: string; B: string };
      const judged = evaluationJudge(input);
      if (pair.prompt === '汇总交付条件') {
        const side = pair.A.includes('详尽') ? 'a' : 'b';
        const baseline = side === 'a' ? 'b' : 'a';
        const delivered = side === 'a' ? pair.A : pair.B;
        assert(delivered.includes(overLimit));
        assert(!delivered.includes(notSent));
        judged.assertions[0][baseline] = { passed: true, quote: longer };
        for (const [index, quote] of [atLimit, overLimit, forged, notSent].entries()) {
          judged.assertions[index][side] = { passed: true, quote };
        }
      }
      return { json: openAiJson(judged) };
    },
  });
  const item = await receiveSkill(f);
  await f.hub.evaluations.manual(f.admin, item.version_id, randomUUID());
  const row = await finishModelEvaluation(f);

  const owner = await signIn(f);
  const history = managementEvaluationsResponseSchema.parse(
    (await owner.get('/api/management/versions/' + item.version_id + '/evaluations').expect(200))
      .body,
  );
  const evaluation = history.items.find((record) => record.id === row?.id);
  assert(evaluation);
  const stage = evaluation.stages.find((s) => s.id === 'task-run-1');
  assert(stage?.assertion_results);
  assert.deepEqual(stage.assertion_results[0], {
    with_skill: { passed: true, valid: true, quote: atLimit },
    without_skill: { passed: true, valid: true, quote: longer },
  });
  assert.deepEqual(
    stage.assertion_results.slice(1).map((pair) => [pair.with_skill, pair.without_skill.valid]),
    Array.from({ length: 3 }, () => [{ passed: false, valid: false, quote: '' }, true]),
  );
  const effect = evaluation.dimensions.find((dimension) => dimension.id === 'effectiveness');
  assert.partialDeepStrictEqual(effect?.metrics, {
    total_assertions: 16,
    valid_assertions: 13,
    pass_with: 13 / 16,
    pass_without: 8 / 16,
  });
  assert.equal(stage.requests, 3);
  assert.equal(stub.requests.length, 33);
});

test('盲评仍拒绝断言条数不符、缺侧、引文类型错误和不可持久化文本', async (t) => {
  const { f } = await evaluationHub(t, {
    'task-judge': (request) => {
      const input = evaluationModelInput(request);
      const { prompt } = JSON.parse(input) as { prompt: string };
      const { assertions } = evaluationJudge(input);
      const invalid: unknown[] = [...assertions];
      switch (prompt) {
        case '汇总交付条件':
          invalid.pop();
          break;
        case '整理输入资料':
          invalid[0] = { a: assertions[0].a };
          break;
        case '核对模块边界':
          invalid[0] = { ...assertions[0], b: { passed: true, quote: 120 } };
          break;
        case '准备交付说明':
          invalid[0] = {
            a: { passed: true, quote: '\0' },
            b: { passed: true, quote: '\ud800' },
          };
          break;
      }
      return { json: openAiJson({ assertions: invalid }) };
    },
  });
  const item = await receiveSkill(f);
  await f.hub.evaluations.manual(f.admin, item.version_id, randomUUID());
  const last = await claimStage(f, 'transparency');
  await f.hub.evaluationRunner.process(last);
  const row = await f.store.get('resource_evaluations', last.aggregate_id);
  assert.equal(row?.state, 'partial');
  assert.equal(row.recovery_requests, 4);
  assert.deepEqual(
    row.stages
      .filter((stage) => stage.id.startsWith('task-run-'))
      .map((stage) => [stage.state, stage.failure_code, stage.assertion_results, stage.requests]),
    Array.from({ length: 4 }, () => ['failed', 'AI_OUTPUT_INVALID', undefined, 4]),
  );
});

test('纸面推演前作者附件已不可读，报告输入材料错误且不产生模型请求', async (t) => {
  const { f, stub } = await evaluationHub(t);
  const path = 'evals/input.txt';
  const item = await receiveSkill(f, {
    files: [
      { path: 'SKILL.md', bytes: skillDocument(), executable: false },
      {
        path: 'evals/evals.json',
        bytes: Buffer.from(
          JSON.stringify({ evals: [{ prompt: '核对附件中的交付编号', files: [path] }] }),
        ),
        executable: false,
      },
      { path, bytes: Buffer.from('交付编号 42'), executable: false },
    ],
  });
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  await submitPublication(f, item);
  const job = await claimStage(f, 'task-run-1');
  const version = await f.store.get('versions', item.version_id);
  const ref = version?.files.find((file) => file.path === path)?.blob_ref;
  assert(ref);
  const read = f.blobs.read.bind(f.blobs);
  t.mock.method(f.blobs, 'read', async (id: string) =>
    id === ref ? Buffer.from([0, 255]) : read(id),
  );
  const sent = stub.requests.length;
  assert.equal(await f.hub.evaluationRunner.process(job), 'failed');
  const evaluation = await f.store.get('resource_evaluations', job.aggregate_id);
  const stage = evaluation?.stages.find((s) => s.id === 'task-run-1');
  assert.equal(stage?.failure_code, 'AI_NOT_FOUND');
  assert.equal(stage.requests, 0);
  assert.equal(stub.requests.length, sent);
});

test('过滤后正例或纸面任务不足时保持缺失分并继续完成其余维度', async (t) => {
  const positive = evaluationTriggerCases.filter((c) => c.kind === 'should_trigger');
  const englishCase = positive[6];
  const rejected = [
    'sample-skill 可以做什么',
    '我想使用 sample skill',
    '太短',
    englishCase.query.replace('How', 'Ｈｏｗ'),
  ];
  const { f, stub } = await evaluationHub(t, {
    'trigger-cases': () => ({
      json: openAiJson({
        cases: [
          ...positive.slice(0, 4),
          englishCase,
          ...rejected.map((query) => ({ ...englishCase, query })),
          ...evaluationTriggerCases.filter((c) => c.kind === 'near_miss'),
        ],
      }),
    }),
    'task-cases': () => ({ json: openAiJson({ cases: [] }) }),
  });
  const item = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  await submitPublication(f, item);
  const job = await claimStage(f, 'transparency');
  await f.hub.evaluationRunner.process(job);
  const record = (await f.store.get('resource_evaluations', job.aggregate_id))!;
  assert.equal(record.state, 'succeeded');
  assert.equal(record.cases?.trigger.filter((c) => c.kind === 'should_trigger').length, 5);
  for (const id of ['triggering', 'effectiveness']) {
    const dim = record.dimensions.find((d) => d.id === id)!;
    assert.equal(dim.status, 'insufficient');
    assert.equal(dim.score, null);
  }
  assert.deepEqual(stub.requests.map(evaluationModelStep), [
    'trigger-cases',
    'instructions',
    'instructions',
    'task-cases',
    'transparency',
  ]);
  assert.equal(record.dimensions.find((d) => d.id === 'transparency')?.status, 'scored');
});

test('指令样本缺乏有效行段后仍评测任务效果，手动重试保留已核对的成对结果', async (t) => {
  const { f, stub } = await evaluationHub(t, {
    instructions: () => ({
      json: openAiJson({
        checks: evaluationInstructionChecks().map((c) => ({
          ...c,
          evidence: [{ path: 'never-sent.md', start_line: 1, end_line: 1 }],
        })),
      }),
    }),
  });
  const item = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  const request = await submitPublication(f, item);
  const last = await claimStage(f, 'transparency');
  await f.hub.evaluationRunner.process(last);
  const partial = (await f.store.get('resource_evaluations', last.aggregate_id))!;
  assert.equal(partial.state, 'partial');
  assert.equal(partial.dimensions.find((d) => d.id === 'instructions')?.status, 'failed');
  assert.equal(partial.dimensions.find((d) => d.id === 'effectiveness')?.score, 100);
  assert.equal(stub.requests.length, 33);
  await approveEvaluationCandidate(f, request);
  stub.setHandler(evaluationModelHandler());
  const manual = await f.hub.evaluations.manual(f.admin, item.version_id, randomUUID());
  assert.equal(manual.evaluation.reused_from, partial.id);
  const retry = await claimEvaluation(f);
  assert.equal(retry.input.stage, 'instructions');
  await f.hub.evaluationRunner.process(retry);
  const completed = (await f.store.get('resource_evaluations', retry.aggregate_id))!;
  assert.equal(completed.state, 'succeeded');
  assert.equal(completed.dimensions.find((d) => d.id === 'instructions')?.score, 100);
  assert.deepEqual(completed.cases, partial.cases);
  assert.deepEqual(
    completed.stages.filter((s) => s.id.startsWith('task-run-')),
    partial.stages.filter((s) => s.id.startsWith('task-run-')),
  );
  assert.equal(stub.requests.length, 35);
});

test('手动登记受资产权限、CSRF、幂等和每资产 UTC 次数共同约束', async (t) => {
  const { f } = await evaluationHub(t);
  const intake = await receiveSkill(f);
  const path = '/api/management/versions/' + intake.version_id + '/evaluations';
  const admin = await signIn(f);
  const reader = await signIn(f, 'reader');
  const reviewer = await signIn(f, 'reviewer');
  await reader.post(path).set('Idempotency-Key', 'reader').send({}).expect(403);
  await reviewer.post(path).set('Idempotency-Key', 'reviewer').send({}).expect(403);
  await admin.post(path).set('X-CSRF-Token', 'invalid').send({}).expect(403);
  await admin.post(path).send({}).expect(400);
  await admin.post(path).set('Idempotency-Key', 'bad').send({ extra: true }).expect(422);
  const first = await admin.post(path).set('Idempotency-Key', 'one').send({}).expect(202);
  const same = await admin.post(path).set('Idempotency-Key', 'one').send({}).expect(202);
  assert.deepEqual(same.body, first.body);
  for (const key of ['two', 'three']) {
    const next = await admin.post(path).set('Idempotency-Key', key).send({}).expect(200);
    assert.equal(next.body.reused, true);
    assert.equal(next.body.evaluation.id, first.body.evaluation.id);
  }
  const limit = await admin.post(path).set('Idempotency-Key', 'four').send({}).expect(429);
  assert.equal(limit.body.error.code, 'EVALUATION_QUOTA_EXCEEDED');
  const audit = await f.store.where('audit', 'action', 'evaluation.requested');
  assert.equal(audit.length, 3);
  for (const row of audit) {
    assert.equal(row.entity_id, intake.version_id);
    assert.deepEqual(row.metadata, { asset_id: intake.asset_id });
    assert.equal(row.reason, '');
  }
  const full = (await f.store.listVersionEvaluations(intake.version_id)).find(
    (r) => r.scope === 'full',
  )!;
  assert.equal(full.audience_class, 'signed_in');
  assert.equal(full.requested_by, f.admin.id);
  assert.equal(full.priority, 80);
  await f.hub.lifecycle.revokeVersion(f.admin, intake.version_id, '撤销候选');
  const unavailable = await admin.post(path).set('Idempotency-Key', 'one').send({}).expect(409);
  assert.equal(unavailable.body.error.code, 'EVALUATION_UNAVAILABLE');
});

async function submitKeyChange(f: TestHub, intake: Awaited<ReturnType<typeof receiveSkill>>) {
  return f.hub.publications.submit(
    f.admin,
    {
      source_intake_id: intake.id,
      version_id: intake.version_id,
      category: 'uncategorized',
      scenario_ids: [],
      applies_to: { languages: ['TypeScript'] },
      distribution: { mode: 'approved_audience', audience: ['public'] },
      purpose: '核对候选凭据声明',
      base_release_id: (await f.hub.assetAccess.getAsset(intake.asset_id)).current_release_id,
      requires_api_key: true,
    },
    randomUUID(),
  );
}

test('审核重试沿用申请声明和幂等回执，不能复用已发布的成功结果', async (t) => {
  const { f, stub } = await evaluationHub(t);
  const intake = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  await approveEvaluationCandidate(f, await submitPublication(f, intake));
  const released = await finishModelEvaluation(f);
  stub.setHandler(evaluationModelHandler({ transparency: () => ({ status: 503, json: {} }) }));
  const candidate = await submitKeyChange(f, intake);
  const owner = await signIn(f);
  const path = '/api/management/versions/' + intake.version_id + '/evaluations';
  const body = { publication_request_id: candidate.id };
  const reviewPath = '/api/publication-requests/' + candidate.id + '/evaluation';
  const stage = await claimStage(f, 'transparency');
  await f.hub.evaluationRunner.process(stage);
  const before = reviewEvaluationResponseSchema.parse(
    (await owner.get(reviewPath).expect(200)).body,
  );
  assert.equal(before.candidate?.state, 'partial');
  assert.equal(before.candidate.requires_api_key, true);

  const retried = await owner.post(path).set('Idempotency-Key', 'review').send(body).expect(202);
  assert.equal(retried.body.evaluation.reused_from, before.candidate.id);
  const replay = await owner.post(path).set('Idempotency-Key', 'review').send(body).expect(202);
  assert.deepEqual(replay.body, retried.body);
  const other = await owner.post(path).set('Idempotency-Key', 'review').send({}).expect(409);
  assert.equal(other.body.error.code, 'IDEMPOTENCY_CONFLICT');
  const after = reviewEvaluationResponseSchema.parse(
    (await owner.get(reviewPath).expect(200)).body,
  );
  assert(after.candidate);
  assert.equal(after.candidate.id, retried.body.evaluation.id);
  assert.equal(after.candidate.stages.find((s) => s.id === 'transparency')?.state, 'pending');
  const reuse = await owner.post(path).set('Idempotency-Key', 'release').send({}).expect(200);
  assert.equal(reuse.body.evaluation.id, released.id);
  const next = await receiveSkill(f, { assetId: intake.asset_id, version: '2.0.0' });
  await owner
    .post('/api/management/versions/' + next.version_id + '/evaluations')
    .set('Idempotency-Key', 'other-version')
    .send(body)
    .expect(404);
  assert.equal((await f.store.where('audit', 'action', 'evaluation.requested')).length, 2);
});

test('首轮评测耗尽手动次数后仍向获授权会话展示匹配发布的进度与失败', async (t) => {
  const start = Date.UTC(2026, 10, 24);
  t.mock.timers.enable({ apis: ['Date'], now: start + 3600000 });
  const { f } = await evaluationHub(t, {}, 0);
  const { intake } = await publishSkill(f);
  await f.worker.tick();
  const [structure] = await f.store.listVersionEvaluations(intake.version_id);
  await f.store.remove('resource_evaluations', structure.id);
  f.hub.config.evaluationDailyRequests = 300;
  await submitKeyChange(f, intake);
  const owner = await signIn(f);
  const anonymous = httpClient(f);
  const url = '/api/assets/' + intake.asset_id + '/versions/' + intake.version_id + '/evaluation';
  const quota = await f.store.insert('evaluation_schedule', {
    id: 'resource-evaluations',
    window_start: start,
    reserved: 300,
    updated_at: new Date().toISOString(),
  });
  const waiting = evaluationResponseSchema.parse((await owner.get(url).expect(200)).body);
  assert.equal(waiting.evaluation, null);
  assert.equal(waiting.updating, false);
  assert.equal(waiting.latest_attempt_id, undefined);
  assert.equal(waiting.can_request, false);
  assert.equal(waiting.next_window_at, '2026-11-25T00:00:00.000Z');
  await f.store.put('evaluation_schedule', { ...quota, reserved: 0 });
  const attempt = await f.hub.evaluations.manual(f.admin, intake.version_id, 'first');
  for (const key of ['second', 'last'])
    await f.hub.evaluations.manual(f.admin, intake.version_id, key);
  const row = await f.store.get('resource_evaluations', attempt.evaluation.id);
  assert(row && !row.requires_api_key);
  const running = evaluationResponseSchema.parse((await owner.get(url).expect(200)).body);
  assert.equal(running.evaluation, null);
  assert.equal(running.can_request, false);
  assert.equal(running.updating, true);
  assert.equal(running.latest_attempt_id, row.id);
  assert.equal(running.next_window_at, undefined);
  await f.store.put('evaluation_schedule', quota);
  const delayed = evaluationResponseSchema.parse((await owner.get(url).expect(200)).body);
  assert.equal(delayed.next_window_at, '2026-11-25T00:00:00.000Z');
  const publicView = evaluationResponseSchema.parse((await anonymous.get(url).expect(200)).body);
  assert.equal(publicView.updating, false);
  assert.equal(publicView.latest_attempt_id, undefined);
  assert.equal(publicView.next_window_at, undefined);
  await f.store.put('resource_evaluations', {
    ...row,
    state: 'failed',
    finished_at: new Date().toISOString(),
    revision: row.revision + 1,
  });
  const failed = evaluationResponseSchema.parse((await owner.get(url).expect(200)).body);
  assert.equal(failed.updating, false);
  assert.equal(failed.latest_attempt_id, row.id);
  assert.equal(failed.next_window_at, undefined);
});

test('供应方错误或非法输出在可选补发仍失败时保留结构分，只能手动重跑失败的模型阶段', async (t) => {
  freezeUtcDay(t);
  const { f, stub } = await evaluationHub(t, { transparency: () => ({ status: 503, json: {} }) });
  const intake = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  const request = await submitPublication(f, intake);
  const stage = await claimStage(f, 'transparency');
  await f.hub.evaluationRunner.process(stage);
  const first = (await f.store.get('resource_evaluations', stage.aggregate_id))!;
  assert.equal(first.state, 'partial');
  assert.equal(first.dimensions[0].status, 'scored');
  assert.equal(first.stages.at(-1)?.failure_code, 'AI_PROVIDER_FAILED');
  await approveEvaluationCandidate(f, request);
  await f.hub.evaluations.schedule();
  assert.equal(await f.hub.jobs.claim('idle', ['resource_evaluation']), undefined);
  assert.equal(stub.requests.length, 34);
  assert.equal(first.recovery_requests, 1);
  const retry = await f.hub.evaluations.manual(f.admin, intake.version_id, randomUUID());
  assert(!retry.reused);
  assert.equal(retry.evaluation.reused_from, first.id);
  const secondStage = await claimEvaluation(f);
  assert.equal(secondStage.input.stage, 'transparency');
  stub.setHandler(() => ({ json: openAiJson({ unrelated: '私有' }) }));
  await f.hub.evaluationRunner.process(secondStage);
  const second = (await f.store.get('resource_evaluations', secondStage.aggregate_id))!;
  assert.deepEqual(second.stages.slice(0, -1), first.stages.slice(0, -1));
  assert.equal(second.stages.at(-1)?.failure_code, 'AI_OUTPUT_INVALID');
  assert.equal(second.state, 'partial');
  assert.equal(second.recovery_requests, 1);
  assert.equal((await f.store.evaluationSchedule())?.reserved, 36);
});

test('当日余额不足一整轮但够补跑失败阶段时，仍可手动重试并立即调度', async (t) => {
  freezeUtcDay(t);
  const { f, stub } = await evaluationHub(t, { transparency: () => ({ status: 503, json: {} }) });
  const intake = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  await submitPublication(f, intake);
  await f.hub.evaluationRunner.process(await claimStage(f, 'transparency'));
  const owner = await signIn(f);
  const historyUrl = '/api/management/versions/' + intake.version_id + '/evaluations';
  const window = (await f.store.evaluationSchedule())!;
  await f.store.put('evaluation_schedule', { ...window, reserved: 300 });
  const exhausted = managementEvaluationsResponseSchema.parse(
    (await owner.get(historyUrl).expect(200)).body,
  );
  assert.equal(exhausted.can_request, false);
  assert.equal(exhausted.next_window_at, '2026-11-25T00:00:00.000Z');
  await f.store.put('evaluation_schedule', { ...window, reserved: 299 });
  const enough = managementEvaluationsResponseSchema.parse(
    (await owner.get(historyUrl).expect(200)).body,
  );
  assert.equal(enough.can_request, true);
  assert.equal(enough.next_window_at, null);
  stub.setHandler(evaluationModelHandler());
  await f.hub.evaluations.manual(f.admin, intake.version_id, randomUUID());
  const retry = await claimEvaluation(f);
  assert.equal(retry.input.stage, 'transparency');
  await f.hub.evaluationRunner.process(retry);
  assert.equal((await f.store.get('resource_evaluations', retry.aggregate_id))?.state, 'succeeded');
  assert.equal((await f.store.evaluationSchedule())?.reserved, 300);
});

test('同主体的另一版本在排队前后均能沿用部分结果，只派发未完成阶段', async (t) => {
  freezeUtcDay(t);
  const { f, stub } = await evaluationHub(t, { transparency: () => ({ status: 503, json: {} }) });
  const intake = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  const request = await submitPublication(f, intake);
  const final = await claimStage(f, 'transparency');
  const waiting = await queueEvaluationCopy(f, request, '1.1.0');
  await f.hub.evaluationRunner.process(final);
  const source = await f.store.get('resource_evaluations', final.aggregate_id);
  assert.equal(source?.state, 'partial');
  // 冻结时钟下两条登记时间相同时按随机 ID 排序；推进时钟保证先排队者先启动。
  t.mock.timers.tick(1);
  const later = await queueEvaluationCopy(f, request, '1.2.0');
  assert.equal(later.evaluation.reused_from, source.id);
  assert.deepEqual(later.evaluation.stages.slice(0, -1), source.stages.slice(0, -1));
  assert.equal(later.evaluation.stages.at(-1)?.state, 'pending');
  stub.setHandler(evaluationModelHandler());
  const retry = await claimEvaluation(f);
  assert.equal(retry.aggregate_id, waiting.evaluation.id);
  assert.equal(retry.input.stage, 'transparency');
  await f.hub.evaluationRunner.process(retry);
  await f.hub.evaluations.schedule();
  const finished = (await f.store.listVersionEvaluations(waiting.version.id))[0];
  assert.equal(finished.state, 'succeeded');
  assert.equal(finished.reused_from, source.id);
  assert.deepEqual(finished.stages.slice(0, -1), source.stages.slice(0, -1));
  assert.equal((await f.store.listVersionEvaluations(later.version.id))[0].state, 'succeeded');
  assert.deepEqual(await f.store.where('jobs', 'aggregate_id', later.evaluation.id), []);
  assert.equal((await f.store.evaluationSchedule())?.reserved, 35);
});

test('多条部分结果均可沿用时取成功阶段最多的一条，而非最近登记的一条', async (t) => {
  freezeUtcDay(t);
  const { f } = await evaluationHub(t, { transparency: () => ({ status: 503, json: {} }) });
  const intake = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  const request = await submitPublication(f, intake);
  const final = await claimStage(f, 'transparency');
  await f.hub.evaluationRunner.process(final);
  const complete = (await f.store.get('resource_evaluations', final.aggregate_id))!;
  assert.equal(complete.state, 'partial');
  const failedStage = complete.stages.find((s) => s.id === 'transparency')!;
  const failedDimension = complete.dimensions.find((d) => d.id === 'transparency')!;
  const source = (await f.store.get('versions', request.version_id))!;
  const other = await f.store.insert('versions', {
    ...source,
    id: randomUUID(),
    version_label: '1.1.0',
  });
  // 同一主体较晚登记的另一条部分结果，指令阶段也失败。
  await f.store.insert('resource_evaluations', {
    ...complete,
    id: randomUUID(),
    version_id: other.id,
    requested_at: new Date(Date.parse(complete.requested_at) + 60000).toISOString(),
    stages: complete.stages.map((s) =>
      s.id === 'instructions' ? { ...failedStage, id: 'instructions' } : s,
    ),
    dimensions: complete.dimensions.map((d) =>
      d.id === 'instructions' ? { ...failedDimension, id: 'instructions' } : d,
    ),
  });
  const later = await queueEvaluationCopy(f, request, '1.2.0');
  assert.equal(later.evaluation.reused_from, complete.id);
  assert.deepEqual(later.evaluation.stages.slice(0, -1), complete.stages.slice(0, -1));
  assert.equal(later.evaluation.stages.at(-1)?.state, 'pending');
});

test('跨版本沿用已完成的边界透明阶段时保留来源的扫描规则版本', async (t) => {
  freezeUtcDay(t);
  for (const overrides of [{}, { instructions: () => ({ status: 503, json: {} }) }]) {
    const { f } = await evaluationHub(t, overrides);
    const intake = await receiveSkill(f);
    await f.hub.evaluationRunner.process(await claimEvaluation(f));
    const request = await submitPublication(f, intake);
    const final = await claimStage(f, 'transparency');
    await f.hub.evaluationRunner.process(final);
    const source = (await f.store.get('resource_evaluations', final.aggregate_id))!;
    assert.equal(source.stages.find((s) => s.id === 'transparency')?.state, 'succeeded');
    assert.equal(source.scan_ruleset, request.ruleset_version);
    if ('instructions' in overrides) {
      assert.partialDeepStrictEqual(
        source.stages.find((s) => s.id === 'instructions'),
        {
          state: 'failed',
          failure_code: 'AI_PROVIDER_FAILED',
          requests: 2,
          recovery_requests: 1,
        },
      );
    }
    const upgraded = { ...request, ruleset_version: '2099-01-01.1' };
    const { evaluation } = await queueEvaluationCopy(f, upgraded, '1.1.0');
    assert.equal(evaluation.reused_from, source.id);
    assert.equal(evaluation.state, source.state === 'succeeded' ? 'succeeded' : 'queued');
    assert.equal(evaluation.scan_ruleset, source.scan_ruleset);
  }
});

test('额度耗尽时排在队尾的撤销和跨版本复用仍会结算', async (t) => {
  freezeUtcDay(t);
  const { f } = await evaluationHub(t, {}, 33);
  const intake = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  const request = await submitPublication(f, intake);
  const final = await claimStage(f, 'transparency');
  const restricted = {
    ...request,
    distribution: { ...request.distribution, audience: ['organization'] },
  };
  const waiting = [];
  for (let i = 0; i < 9; i++)
    waiting.push(await queueEvaluationCopy(f, restricted, '2.0.' + i, 'submission'));
  const copy = await queueEvaluationCopy(f, request, '3.0.0');
  const revoked = await queueEvaluationCopy(f, request, '4.0.0');
  await f.store.put('versions', { ...revoked.version, availability: 'revoked' });
  await f.hub.evaluationRunner.process(final);
  for (let pass = 0; pass < 3; pass++) await f.hub.evaluations.schedule();
  for (const item of waiting)
    assert.equal((await f.store.get('resource_evaluations', item.evaluation.id))?.state, 'queued');
  const copied = (await f.store.listVersionEvaluations(copy.version.id))[0];
  assert.equal(copied.state, 'succeeded');
  assert.equal(copied.reused_from, final.aggregate_id);
  const cancelled = (await f.store.listVersionEvaluations(revoked.version.id))[0];
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.failure_code, 'EVALUATION_UNAVAILABLE');
  assert.deepEqual(await f.store.where('jobs', 'aggregate_id', copied.id), []);
  assert.deepEqual(await f.store.where('jobs', 'aggregate_id', cancelled.id), []);
  assert.equal((await f.store.evaluationSchedule())?.reserved, 33);
});

test('日额度不足不启动新的完整评测，已在途阶段丢失最后名额时顺延到 UTC 次日', async (t) => {
  const day = 86400000;
  const start = Date.UTC(2026, 10, 24);
  t.mock.timers.enable({ apis: ['Date'], now: start + day - 1 });
  const { f, stub } = await evaluationHub(t, undefined, 33);
  const intake = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  const request = await submitPublication(f, intake);
  await f.store.insert('evaluation_schedule', {
    id: 'resource-evaluations',
    window_start: start,
    reserved: 1,
    updated_at: new Date().toISOString(),
  });
  await f.hub.evaluations.schedule();
  const full = (await f.store.where('resource_evaluations', 'version_id', request.version_id)).find(
    (r) => r.scope === 'full',
  )!;
  assert.equal(full.state, 'queued');
  assert.equal(stub.requests.length, 0);
  t.mock.timers.setTime(start + day);
  const job = await claimEvaluation(f);
  await f.store.put('evaluation_schedule', {
    id: 'resource-evaluations',
    window_start: start + day,
    reserved: 33,
    updated_at: new Date().toISOString(),
  });
  await f.hub.evaluationRunner.process(job);
  const waiting = await f.store.get('jobs', job.id);
  assert.equal(waiting?.state, 'queued');
  assert.equal(waiting.run_after, start + 2 * day);
  assert.equal(stub.requests.length, 0);
  t.mock.timers.setTime(waiting.run_after - 1);
  await f.hub.evaluations.schedule();
  assert.equal(await f.hub.jobs.claim('before-midnight', ['resource_evaluation']), undefined);
  t.mock.timers.setTime(waiting.run_after);
  const resumed = await claimEvaluation(f);
  assert.equal(resumed.id, waiting.id);
  await f.hub.evaluationRunner.process(resumed);
  assert.partialDeepStrictEqual(await f.store.evaluationSchedule(), {
    window_start: waiting.run_after,
    reserved: 1,
  });
  assert.equal(stub.requests.length, 1);
});

test('无默认模型或日额度为零时，提交与手动受理均沿用静态评测', async (t) => {
  const { f, stub } = await evaluationHub(t, undefined, 0);
  t.mock.property(process, 'env', {
    ...process.env,
    CAPABILITY_HUB_AI_CONFIG: join(f.directory, 'absent-shell-ai.json'),
  });
  for (const fixture of [f, await createTestHub(t)]) {
    const item = await receiveSkill(fixture);
    await submitPublication(fixture, item);
    const manual = await fixture.hub.evaluations.manual(
      fixture.admin,
      item.version_id,
      randomUUID(),
    );
    assert(manual.reused);
    const job = await claimEvaluation(fixture);
    assert.equal(job.input.stage, 'static');
    await fixture.hub.evaluationRunner.process(job);
    const [record] = await fixture.store.listVersionEvaluations(item.version_id);
    assert.equal(record.scope, 'static');
    assert.equal(record.state, 'succeeded');
    assert.equal(await fixture.store.evaluationSchedule(), undefined);
  }
  assert.equal(stub.requests.length, 0);
});

test('模型响应到达前租约已被接管，旧执行无法提交，也不能退还已派发的调用', async (t) => {
  freezeUtcDay(t);
  const started = deferred(),
    release = deferred();
  const { f, stub } = await evaluationHub(t, {
    transparency: async () => {
      started.resolve();
      await release.promise;
      return { json: openAiJson(transparent) };
    },
  });
  const item = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  await submitPublication(f, item);
  const first = await claimStage(f, 'transparency');
  const attempt = f.hub.evaluationRunner.process(first);
  await started.promise;
  await f.store.put('jobs', { ...first, lease_until: 0 });
  const second = await claimEvaluation(f);
  assert.equal(second.id, first.id);
  release.resolve();
  await assert.rejects(attempt, (e) => e instanceof HubError && e.code === 'LEASE_LOST');
  await f.hub.evaluationRunner.process(second);
  const record = await f.store.get('resource_evaluations', first.aggregate_id);
  assert.equal(record?.state, 'succeeded');
  assert.equal(record.stages.at(-1)?.requests, 2);
  assert.equal((await f.store.evaluationSchedule())?.reserved, 34);
  assert.equal(stub.requests.length, 34);
});

test('Worker 续租抛错即中止在途评测，留给接手者从原阶段继续', async (t) => {
  const entered = deferred();
  const release = deferred();
  const renewal = deferred();
  const stopped = deferred();
  const { f } = await evaluationHub(t, {
    'trigger-cases': async () => {
      entered.resolve();
      await release.promise;
      return { json: openAiJson({ cases: evaluationTriggerCases }) };
    },
  });
  const item = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  await submitPublication(f, item);
  // 真实计时只作失败上限：心跳或中止缺失时让用例报错，而不是挂住测试进程。
  const watchdog = setTimeout(() => {
    const timeout = new Error('等待评测续租或中止超时');
    for (const signal of [entered, renewal, stopped]) signal.reject(timeout);
  }, 10_000);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const renew = f.hub.jobs.renew.bind(f.hub.jobs);
  t.mock.method(f.hub.jobs, 'renew', async (job: Parameters<typeof renew>[0]) => {
    if (job.kind !== 'resource_evaluation') return renew(job);
    renewal.resolve();
    throw new Error('测试存储暂时不可用');
  });
  const tick = f.worker.tick();
  tick.then(() => stopped.resolve(), stopped.reject);
  try {
    await Promise.race([
      entered.promise,
      stopped.promise.then(() => assert.fail('出题请求到达前 Worker 已结束')),
    ]);
    t.mock.timers.tick(20000);
    await renewal.promise;
    // 提供方仍未答复；只有中止在途调用后，Worker 才会结束本轮。
    await stopped.promise;
    const [row] = await f.store.listVersionEvaluations(item.version_id);
    assert.equal(row.stages.find((s) => s.id === 'trigger-cases')?.state, 'pending');
    assert.equal((await f.store.evaluationSchedule())?.reserved, 1);
    const job = (await f.store.get('jobs', row.active_job_id!))!;
    await f.store.put('jobs', { ...job, lease_until: 0 });
    const resumed = await claimEvaluation(f);
    assert.equal(resumed.id, job.id);
    assert.equal(resumed.input.stage, 'trigger-cases');
  } finally {
    clearTimeout(watchdog);
    release.resolve();
    await tick.catch(() => {});
  }
});

test('版本撤销、资产封禁和评测器变化会取消在途阶段并阻止出站', async (t) => {
  for (const change of ['revoked', 'blocked', 'profile'] as const) {
    const { f, stub } = await evaluationHub(t);
    const item = await receiveSkill(f);
    await f.hub.evaluationRunner.process(await claimEvaluation(f));
    await submitPublication(f, item);
    const job = await claimEvaluation(f);
    if (change === 'revoked')
      await f.hub.lifecycle.revokeVersion(f.admin, item.version_id, '测试撤销');
    if (change === 'blocked') {
      const asset = await f.hub.assetAccess.getAsset(item.asset_id);
      await f.hub.lifecycle.updateState(
        f.admin,
        asset.id,
        { lifecycle: 'blocked', reason: '测试封禁' },
        '"' + asset.revision + '"',
      );
    }
    if (change === 'profile') f.hub.ai.runtime.config.profiles[0].model = 'another-loopback-model';
    await f.hub.evaluationRunner.process(job);
    const row = await f.store.get('resource_evaluations', job.aggregate_id);
    assert.equal(row?.state, 'cancelled');
    assert.equal(
      row.failure_code,
      change === 'profile' ? 'EVALUATOR_CHANGED' : 'EVALUATION_UNAVAILABLE',
    );
    assert.equal(stub.requests.length, 0);
  }
});

test('回填只登记当前发布，先选择近三十天使用更多的 Skill，已有同输入结果时跳过', async (t) => {
  const { f } = await evaluationHub(t, undefined, 0);
  const first = await publishSkill(f, { slug: 'lower-usage' });
  const second = await publishSkill(f, { slug: 'higher-usage' });
  const scan = (await f.store.get('scans', second.intake.scan_run_id))!;
  const legacyRuleset = '2026-01-01.1';
  await f.store.insert('scans', {
    ...scan,
    id: randomUUID(),
    ruleset_version: legacyRuleset,
    finished_at: new Date(Date.now() + 1).toISOString(),
  });
  await f.store.audit('system', 'skill.loaded', second.intake.version_id);
  await f.store.audit('system', 'content.download', second.intake.version_id);
  await f.store.audit('system', 'skill.installation_prepared', first.intake.version_id);
  f.hub.config.evaluationDailyRequests = 300;
  await f.hub.evaluations.schedule();
  assert(!(await f.store.all('resource_evaluations')).some((r) => r.scope === 'full'));
  f.hub.config.evaluationBackfill = true;
  await f.hub.evaluations.schedule();
  const queued = (await f.store.all('resource_evaluations')).filter(
    (r) => r.trigger === 'backfill',
  );
  assert.equal(queued.length, 1);
  assert.equal(queued[0].version_id, second.intake.version_id);
  assert.equal(queued[0].scan_ruleset, legacyRuleset);
  assert.equal(queued[0].priority, 20);
  await f.hub.evaluations.schedule();
  await f.hub.evaluations.schedule();
  assert.equal(
    (await f.store.all('resource_evaluations')).filter((r) => r.trigger === 'backfill').length,
    2,
  );
});

test('启用模型前提交的申请在批准时补建完整评测，并随批准事务一起回滚', async (t) => {
  const { f } = await evaluationHub(t, undefined, 0);
  const item = await receiveSkill(f);
  const request = await submitPublication(f, item);
  // 格式 2 备份可恢复出待审申请，但没有接收阶段的评测记录。
  const [prior] = await f.store.listVersionEvaluations(item.version_id);
  await f.store.remove('resource_evaluations', prior.id);
  f.hub.config.evaluationDailyRequests = 300;
  await assertPublicationRollback(
    t,
    f,
    () => approveEvaluationCandidate(f, request),
    async () => {
      assert.equal((await f.store.all('releases')).length, 1);
      const row = (await f.store.listVersionEvaluations(item.version_id)).find(
        (r) => r.scope === 'full',
      );
      assert.equal(row?.trigger, 'release');
      assert.equal(row.priority, 60);
    },
  );
  assert.equal((await f.store.all('releases')).length, 0);
  assert.equal((await f.store.get('requests', request.id))?.state, 'pending');
  assert(!(await f.store.listVersionEvaluations(item.version_id)).some((r) => r.scope === 'full'));
  await approveEvaluationCandidate(f, request);
  const staticJob = await claimEvaluation(f);
  assert.equal(staticJob.input.stage, 'static');
  await f.hub.evaluationRunner.process(staticJob);
  const next = await f.store.get('resource_evaluations', staticJob.aggregate_id);
  assert.equal(next?.state, 'running');
  assert.equal(next.stages[0].state, 'succeeded');
  const nextJob = await f.store.get('jobs', next.active_job_id);
  assert.equal(nextJob?.kind, 'resource_evaluation');
  assert.equal(nextJob.input.stage, 'trigger-cases');
});

test('只在两项授权均覆盖目标资产时受理手动评测', async (t) => {
  const f = await createTestHub(t);
  const item = await receiveSkill(f);
  const other = await receiveSkill(f, { slug: 'other-skill' });
  const client = await signIn(f, 'reader');
  const maintain = await f.hub.administration.createRole(f.admin, {
    name: '评测维护者',
    permissions: ['asset:maintain'],
  });
  const execute = await f.hub.administration.createRole(f.admin, {
    name: '评测执行者',
    permissions: ['ai:execute'],
  });
  const grant = (role_id: string, scope_id: string) =>
    f.hub.administration.grantRole(f.admin, {
      principal_id: f.reader.id,
      role_id,
      scope_type: 'asset',
      scope_id,
    });
  await grant(maintain.id, item.asset_id);
  await grant(execute.id, other.asset_id);
  const post = (version: string) =>
    client
      .post('/api/management/versions/' + version + '/evaluations')
      .set('Idempotency-Key', randomUUID())
      .send({});
  await post(item.version_id).expect(403);
  await post(other.version_id).expect(403);
  await grant(execute.id, item.asset_id);
  await post(item.version_id).expect(200);
});

test('超时的模型阶段只计一次；装填截断降低置信度且扫描摘要不带告警原文', async (t) => {
  const { f, stub } = await evaluationHub(t);
  f.hub.ai.runtime.config.profiles[0].request_timeout_ms = 1000;
  const item = await receiveSkill(f, { body: '出站需要说明。\n'.repeat(2000) });
  const scan = await f.store.get('scans', item.scan_run_id);
  assert(scan);
  await f.store.insert('scans', {
    ...scan,
    id: randomUUID(),
    finished_at: new Date(Date.now() + 1000).toISOString(),
    findings: [
      {
        id: randomUUID(),
        rule_id: 'SECRET_CANDIDATE',
        severity: 'warning',
        file: 'SKILL.md',
        line: 8,
        evidence_summary: '不可外发的告警摘录',
      },
    ],
  });
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  await submitPublication(f, item);
  const job = await claimStage(f, 'transparency');
  await f.hub.evaluationRunner.process(job);
  const dim = (await f.store.get('resource_evaluations', job.aggregate_id))?.dimensions.at(-1);
  assert.equal(dim?.confidence, 'low');
  assert(dim.flags?.includes('coverage_limited'));
  const wire = JSON.stringify(stub.requests.at(-1)!.body);
  assert(wire.includes('SECRET_CANDIDATE'));
  assert(!wire.includes('不可外发的告警摘录'));
  assert(wire.includes('疑似凭据，原文已省略'));
  for (const request of stub.requests)
    assert(Buffer.byteLength(JSON.stringify(request.body)) <= 32768);
  f.hub.ai.runtime.config.profiles[0].model = 'slow-loopback';
  stub.setHandler(evaluationModelHandler({ transparency: () => ({ hang: true }) }));
  await f.hub.evaluations.manual(f.admin, item.version_id, randomUUID());
  const slow = await claimStage(f, 'transparency');
  await f.hub.evaluationRunner.process(slow);
  const result = await f.store.get('resource_evaluations', slow.aggregate_id);
  assert.equal(result?.state, 'partial');
  assert.equal(result.stages.at(-1)?.requests, 1);
  assert.equal(stub.requests.length, 66);
});

test('重新领取多调用阶段时，当日余额不足以做完一组问句就顺延，已派发次数保留', async (t) => {
  const midnight = Date.UTC(2026, 10, 25);
  t.mock.timers.enable({ apis: ['Date'], now: midnight - 1 });
  const { f, stub } = await evaluationHub(t, {}, 33);
  const item = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  await submitPublication(f, item);
  const job = await claimStage(f, 'trigger-routing');
  const quota = (await f.store.evaluationSchedule())!;
  await f.store.put('evaluation_schedule', { ...quota, reserved: 32 });
  assert.equal(await f.hub.evaluationRunner.process(job), 'queued');
  const waiting = (await f.store.get('jobs', job.id))!;
  assert.equal(waiting.run_after, midnight);
  assert.equal((await f.store.evaluationSchedule())?.reserved, 32);
  assert.equal(stub.requests.length, 1);
  await f.hub.evaluations.schedule();
  assert.equal(await f.hub.jobs.claim('before-midnight', ['resource_evaluation']), undefined);
  t.mock.timers.setTime(midnight);
  const resumed = await claimEvaluation(f);
  assert.equal(resumed.id, waiting.id);
  await f.hub.evaluationRunner.process(resumed);
  const row = (await f.store.get('resource_evaluations', job.aggregate_id))!;
  assert.equal(row.stages.find((stage) => stage.id === 'trigger-routing')?.requests, 16);
  assert.partialDeepStrictEqual(await f.store.evaluationSchedule(), {
    window_start: midnight,
    reserved: 16,
  });
  assert.equal(stub.requests.length, 17);
});

test('重领阶段按新租约实际派发数为其他请求留足额度', async (t) => {
  freezeUtcDay(t);
  const { f } = await evaluationHub(t, {}, 300, 2);
  const routing = async (slug: string) => {
    const item = await receiveSkill(f, { slug });
    await f.hub.evaluationRunner.process(await claimEvaluation(f));
    await submitPublication(f, item);
    return claimStage(f, 'trigger-routing');
  };
  const first = await routing('first-skill');
  const second = await routing('second-skill');
  const stages = f.hub.evaluations.stages;
  await stages.prepare(first);
  await stages.reserve(first, randomUUID());
  await stages.reserve(first, randomUUID());
  assert.equal(await stages.reserveRecovery(first, randomUUID(), 96), true);
  await f.store.put('jobs', { ...first, lease_until: 0 });
  const takeover = await claimEvaluation(f);
  assert.equal(takeover.id, first.id);
  await stages.prepare(takeover);
  const execution = randomUUID();
  for (let i = 0; i < 3; i++) await stages.reserve(takeover, execution);
  assert.equal(await stages.reserveRecovery(takeover, execution, 96), true);
  const row = await f.store.get('resource_evaluations', first.aggregate_id);
  assert.equal(row?.recovery_requests, 2);
  assert.partialDeepStrictEqual(
    row.stages.find((stage) => stage.id === 'trigger-routing'),
    {
      requests: 7,
      recovery_requests: 2,
      execution_id: execution,
    },
  );
  const window = (await f.store.evaluationSchedule())!;
  await f.store.put('evaluation_schedule', { ...window, reserved: 207 });
  assert.equal(
    await f.hub.evaluations.admissionWindow(f.hub.evaluations.evaluatorDigest!),
    'next_window',
  );
  await f.store.put('evaluation_schedule', { ...window, reserved: 206 });
  assert.equal(
    await f.hub.evaluations.admissionWindow(f.hub.evaluations.evaluatorDigest!),
    'available',
  );
  await f.store.put('evaluation_schedule', { ...window, reserved: 271 });
  await stages.prepare(second);
  await stages.reserve(second, randomUUID());
  assert.equal((await f.store.evaluationSchedule())?.reserved, 272);
});

test('长用例叠加逐项说明超过记录上限时，阶段仍保存可核对的判定和引用', async (t) => {
  const { f } = await evaluationHub(t);
  const item = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  await submitPublication(f, item);
  const job = await claimStage(f, 'transparency');
  const row = (await f.store.get('resource_evaluations', job.aggregate_id))!;
  assert(row.cases);
  const fill = '\u0001';
  for (const c of row.cases.trigger) c.query = c.query.padEnd(300, fill);
  for (const c of row.cases.tasks) {
    c.prompt = c.prompt.padEnd(1200, fill);
    c.expected = c.expected.padEnd(600, fill);
    c.assertions = c.assertions.map((assertion) => assertion.padEnd(200, fill));
  }
  for (const stage of row.stages)
    for (const pair of stage.assertion_results ?? []) {
      pair.with_skill.quote = '据'.repeat(165);
      pair.without_skill.quote = '据'.repeat(165);
    }
  const size = () => Buffer.byteLength(JSON.stringify(row));
  for (const check of row.dimensions.flatMap((d) => d.checks)) {
    if (size() >= 126 * 1024) break;
    check.note = '注'.repeat(300);
    check.suggestion = '议'.repeat(300);
  }
  assert(size() > 122 * 1024 && size() < 128 * 1024);
  await f.store.put('resource_evaluations', row);
  const note = '详'.repeat(300);
  const checks = ['requirements', 'credentials', 'side_effects', 'network'].map((id) => ({
    id: 'transparency.' + id,
    verdict: 'pass' as const,
    evidence: [citation],
    note,
    suggestion: note,
  }));
  assert.equal(
    await f.hub.evaluations.stages.complete(job, {
      dimension: { id: 'transparency', status: 'scored', score: 100, confidence: 'medium', checks },
    }),
    'succeeded',
  );
  const saved = (await f.store.get('resource_evaluations', row.id))!;
  assert.equal(saved.state, 'succeeded');
  assert(Buffer.byteLength(JSON.stringify(saved)) <= 128 * 1024);
  assert.deepEqual(saved.cases, row.cases);
  const dimension = saved.dimensions.find((d) => d.id === 'transparency')!;
  assert.equal(dimension.score, 100);
  assert.deepEqual(
    dimension.checks.map((c) => c.evidence),
    checks.map((c) => c.evidence),
  );
  assert(dimension.checks.every((c) => (c.note?.length ?? 0) < note.length));
});

async function finishModelEvaluation(f: TestHub) {
  const job = await claimStage(f, 'transparency');
  await f.hub.evaluationRunner.process(job);
  const row = await f.store.get('resource_evaluations', job.aggregate_id);
  assert.equal(row?.state, 'succeeded');
  return row;
}

test('正式路由按冻结受众选干扰项，受众收窄后同一申请的不同读者得到不同混淆投影', async (t) => {
  const sentChoices: string[][] = [];
  const { f } = await evaluationHub(
    t,
    {
      'trigger-routing': (req) => {
        const { choices } = JSON.parse(evaluationModelInput(req)) as {
          choices: { name: string; description: string }[];
        };
        for (const choice of choices)
          assert.deepEqual(Object.keys(choice).sort(), ['description', 'name']);
        sentChoices.push(choices.map((choice) => choice.name));
        return { json: openAiJson({ choice: 'near-skill', reason: '依据名称选择' }) };
      },
    },
    0,
  );
  const visible = await publishSkill(f, { slug: 'near-skill' });
  await publishSkill(f, {
    slug: 'org-skill',
    distribution: { mode: 'approved_audience', audience: ['organization'] },
  });
  await publishSkill(f, {
    slug: 'group-skill',
    distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
  });
  const item = await receiveSkill(f);
  f.hub.config.evaluationDailyRequests = 300;
  await f.hub.evaluations.manual(f.admin, item.version_id, randomUUID());
  const manual = await finishModelEvaluation(f);
  assert.equal(manual.audience_class, 'signed_in');
  const signed = [...sentChoices];
  assert.equal(signed.length, 16);
  assert(signed.every((names) => names.includes('org-skill') && !names.includes('group-skill')));
  const request = await submitPublication(f, item);
  const full = await finishModelEvaluation(f);
  assert.notEqual(full.id, manual.id);
  const publicChoices = sentChoices.slice(signed.length);
  assert.equal(publicChoices.length, 16);
  assert(
    publicChoices.every(
      (names) =>
        names.length === 4 &&
        names.includes('near-skill') &&
        !names.includes('org-skill') &&
        !names.includes('group-skill'),
    ),
  );
  const original = await f.hub.assetAccess.latestReleaseForVersion(
    (await f.store.get('versions', visible.intake.version_id))!,
  );
  assert.deepEqual(full.context?.distractor_release_ids, [original.id]);
  assert(full.context?.synthetic_set && full.context.pool_digest !== manual.context?.pool_digest);
  assert.equal(full.confusions?.length, 8);
  assert(full.confusions.every((c) => c.release_id === original.id));
  const url = '/api/publication-requests/' + request.id + '/evaluation';
  const historyUrl = '/api/management/versions/' + item.version_id + '/evaluations';
  const reviewer = await signIn(f, 'reviewer');
  const owner = await signIn(f);
  const visibleDetail = reviewEvaluationResponseSchema.parse(
    (await reviewer.get(url).expect(200)).body,
  ).candidate;
  assert(visibleDetail?.confusions?.every((c) => c.name === 'near-skill'));
  f.hub.config.evaluationDailyRequests = 0;
  await publishSkill(f, {
    slug: 'near-skill',
    assetId: visible.intake.asset_id,
    version: '2.0.0',
    body: '收窄分发范围。',
    distribution: { mode: 'approved_audience', audience: ['principal:' + f.admin.id] },
  });
  for (const path of [url, historyUrl]) {
    const ownerDetail = await owner.get(path).expect(200);
    assert(JSON.stringify(ownerDetail.body).includes('near-skill'));
    const limited = await reviewer
      .get(path)
      .set('If-None-Match', ownerDetail.headers.etag)
      .expect(200);
    assert.notEqual(limited.headers.etag, ownerDetail.headers.etag);
    const text = JSON.stringify(limited.body);
    assert(text.includes('另一项资源'));
    assert(!text.includes('near-skill') && !text.includes(original.id));
  }
});

test('公开基线只取紧邻上一发布，须同时满足其原受众与资产当前受众', async (t) => {
  const f = await createTestHub(t);
  const first = await publishSkill(f);
  const assetId = first.intake.asset_id;
  const middle = await publishSkill(f, {
    assetId,
    version: '1.1.0',
    body: '团队内部版本。',
    distribution: { mode: 'approved_audience', audience: ['group:' + f.teamId] },
  });
  const latest = await publishSkill(f, { assetId, version: '1.2.0', body: '团队公开版本。' });
  await f.worker.tick();
  const url = '/api/assets/' + assetId + '/versions/' + latest.intake.version_id + '/evaluation';
  const reviewer = await signIn(f, 'reviewer');
  const reader = await signIn(f, 'reader');
  const anon = httpClient(f);
  const entitled = evaluationResponseSchema.parse((await reviewer.get(url).expect(200)).body);
  assert(entitled.evaluation && entitled.baseline?.version_label === middle.intake.version_label);
  assert.equal(entitled.comparison_status, 'available');
  for (const client of [anon, reader]) {
    const result = evaluationResponseSchema.parse((await client.get(url).expect(200)).body);
    assert(result.evaluation && result.baseline === null);
    assert.equal(result.comparison_status, 'none');
  }
  await publishSkill(f, {
    assetId,
    version: '1.3.0',
    body: '个人分发版本。',
    distribution: { mode: 'approved_audience', audience: ['principal:' + f.reader.id] },
  });
  await anon.get(url).expect(404);
  await reviewer.get(url).expect(404);
  assert.equal(
    evaluationResponseSchema.parse((await reader.get(url).expect(200)).body).baseline,
    null,
  );
});

test('审核对比以该申请的发布基线计算十分回归，低置信度和评测器变化各自排除', async (t) => {
  const { f, stub } = await evaluationHub(t);
  const first = await receiveSkill(f);
  const initial = await submitPublication(f, first);
  const base = await finishModelEvaluation(f);
  await approveEvaluationCandidate(f, initial);
  const next = await receiveSkill(f, {
    assetId: first.asset_id,
    version: '1.1.0',
    body: '按团队约定核对命名与模块。',
  });
  const request = await submitPublication(f, next);
  const chosen = new Set(
    evaluationTriggerCases
      .filter((c) => c.kind === 'should_trigger')
      .slice(0, 6)
      .concat(evaluationTriggerCases.filter((c) => c.kind === 'near_miss').slice(0, 2))
      .map((c) => c.query.normalize('NFKC')),
  );
  let samples = 0;
  stub.setHandler(
    evaluationModelHandler({
      'trigger-routing': (req) => {
        const { query } = JSON.parse(evaluationModelInput(req)) as { query: string };
        return {
          json: openAiJson({
            choice: chosen.has(query.normalize('NFKC')) ? 'sample-skill' : null,
            reason: '按请求匹配',
          }),
        };
      },
      instructions: () => {
        const verdict = samples++ % 2 ? 'fail' : 'pass';
        return {
          json: openAiJson({
            checks: evaluationInstructionChecks().map((c) => ({ ...c, verdict })),
          }),
        };
      },
      transparency: () => ({
        json: openAiJson({ ...transparent, network: { ...modelCheck, verdict: 'partial' } }),
      }),
    }),
  );
  const full = await finishModelEvaluation(f);
  const url = '/api/publication-requests/' + request.id + '/evaluation';
  const reviewer = await signIn(f, 'reviewer');
  await httpClient(f).get(url).expect(401);
  await (await signIn(f, 'reader')).get(url).expect(403);
  const read = async () =>
    reviewEvaluationResponseSchema.parse((await reviewer.get(url).expect(200)).body);
  const pending = await read();
  assert.equal(pending.candidate?.id, full.id);
  assert.equal(pending.current?.id, base.id);
  assert.equal(
    pending.candidate?.dimensions.find((d) => d.id === 'instructions')?.confidence,
    'low',
  );
  assert.equal(pending.candidate?.dimensions.find((d) => d.id === 'triggering')?.score, 75);
  assert.deepEqual(pending.regressions, [
    { id: 'transparency', label: '边界透明', previous: 100, score: 90, drop: 10 },
  ]);
  await approveEvaluationCandidate(f, request);
  assert.deepEqual((await read()).regressions, pending.regressions);
  const publicUrl =
    '/api/assets/' + first.asset_id + '/versions/' + next.version_id + '/evaluation';
  const previous = evaluationResponseSchema.parse(
    (await httpClient(f).get(publicUrl).expect(200)).body,
  );
  assert.equal(previous.baseline?.version_label, first.version_label);
  f.hub.ai.runtime.config.profiles[0].model = 'different-loopback';
  await f.hub.evaluations.manual(f.admin, next.version_id, randomUUID());
  await finishModelEvaluation(f);
  const changed = await read();
  assert.notEqual(changed.candidate?.comparable_key, changed.current?.comparable_key);
  assert.deepEqual(changed.regressions, []);
  const publicChanged = evaluationResponseSchema.parse(
    (await httpClient(f).get(publicUrl).expect(200)).body,
  );
  assert.equal(publicChanged.baseline, null);
  assert.equal(publicChanged.comparison_status, 'incomparable');
});

test('干扰项发布新版本后沿用已冻结的公开描述，当前受众收窄时移除该项', async (t) => {
  const slug = 'frozen-neighbor';
  const oldDescription = '冻结时公开的归档说明';
  const nextDescription = '后续发布的不同说明';
  const files = (description: string) => [
    {
      path: 'SKILL.md',
      bytes: Buffer.from(
        ['---', 'name: ' + slug, 'description: ' + description, '---', '', '归档交付文档。'].join(
          '\n',
        ),
      ),
      executable: false,
    },
  ];
  for (const restricted of [false, true]) {
    const routes: string[] = [];
    const { f } = await evaluationHub(
      t,
      {
        'trigger-routing': (request) => {
          routes.push(evaluationModelInput(request));
          return { json: openAiJson({ choice: null, reason: '均不适用' }) };
        },
      },
      0,
    );
    const first = await publishSkill(f, { slug, files: files(oldDescription) });
    const release = (await f.store.where('releases', 'version_id', first.intake.version_id))[0];
    const next = await receiveSkill(f, {
      assetId: first.intake.asset_id,
      slug,
      version: '2.0.0',
      files: files(nextDescription),
    });
    const replacement = await submitPublication(f, next, {
      mode: 'approved_audience',
      audience: restricted ? ['group:' + f.teamId] : ['public'],
    });
    const target = await receiveSkill(f);
    await f.worker.tick();
    f.hub.config.evaluationDailyRequests = 300;
    await submitPublication(f, target);
    const routing = await claimStage(f, 'trigger-routing');
    const evaluation = await f.store.get('resource_evaluations', routing.aggregate_id);
    assert.equal(evaluation?.version_id, target.version_id);
    assert.deepEqual(evaluation.context?.distractor_release_ids, [release.id]);

    await approveEvaluationCandidate(f, replacement);
    const asset = await f.hub.assetAccess.getAsset(first.intake.asset_id);
    const previous = await f.store.get('versions', first.intake.version_id);
    assert(previous);
    assert.equal(await f.hub.assetAccess.canRead(null, asset, previous), !restricted);
    assert.equal(await f.hub.evaluationRunner.process(routing), 'succeeded');
    assert.equal(routes.length, 16);
    for (const input of routes) {
      const { choices } = JSON.parse(input) as { choices: { name: string; description: string }[] };
      assert.equal(
        choices.find((option) => option.name === slug)?.description,
        restricted ? undefined : oldDescription,
      );
      assert(!input.includes(nextDescription));
      if (restricted) assert(!input.includes(oldDescription));
    }
  }
});

test('并行多调用阶段在紧张的窗口给已出站的一组留足额度', async (t) => {
  freezeUtcDay(t);
  const entered = deferred();
  const release = deferred();
  let firstRequests = 0;
  let secondRequests = 0;
  const stub = await serveModelStub(
    t,
    evaluationModelHandler({
      'trigger-routing': async (request) => {
        const choices = (
          JSON.parse(evaluationModelInput(request)) as { choices: { name: string }[] }
        ).choices;
        if (choices.some((choice) => choice.name === 'first-skill')) {
          if (++firstRequests === 2) entered.resolve();
          await release.promise;
        } else secondRequests++;
        return { json: openAiJson({ choice: null, reason: '均不适用' }) };
      },
    }),
  );
  const profile = stub.profile('openai');
  const f = await createTestHub(t, {
    workerConcurrency: 3,
    evaluationConcurrency: 2,
    evaluationDailyRequests: 300,
    ai: aiConfigurationSchema.parse({ profiles: [profile], default_profile: profile.id }),
  });
  async function claimRouting(slug: string) {
    const item = await receiveSkill(f, { slug });
    await f.hub.evaluationRunner.process(await claimEvaluation(f));
    await submitPublication(f, item);
    return claimStage(f, 'trigger-routing');
  }
  const first = await claimRouting('first-skill');
  const second = await claimRouting('second-skill');
  const window = (await f.store.evaluationSchedule())!;
  await f.store.put('evaluation_schedule', { ...window, reserved: 282 });
  const started = f.hub.evaluationRunner.process(first);
  const timeout = setTimeout(() => entered.reject(new Error('等待并发路由请求超时')), 10_000);
  try {
    await Promise.race([
      entered.promise,
      started.then((state) => assert.fail('首个路由阶段提前结束，状态为 ' + state)),
    ]);
    assert.equal(await f.hub.evaluationRunner.process(second), 'queued');
    assert.equal(secondRequests, 0);
    assert.equal((await f.store.evaluationSchedule())?.reserved, 284);
  } finally {
    clearTimeout(timeout);
    release.resolve();
    await started;
  }
  assert.equal(firstRequests, 16);
  assert.equal((await f.store.evaluationSchedule())?.reserved, 298);
  assert.equal((await f.store.get('jobs', first.id))?.state, 'succeeded');
});

test('组织候选复用不可读历史版本时，审核员只获得本次候选的证据与阶段进度', async (t) => {
  const { f } = await evaluationHub(t);
  const first = await receiveSkill(f);
  const hidden = await submitPublication(f, first, {
    mode: 'approved_audience',
    audience: ['principal:' + f.admin.id],
  });
  const previous = await finishModelEvaluation(f);
  await approveEvaluationCandidate(f, hidden);
  const next = await receiveSkill(f, { assetId: first.asset_id, version: '1.1.0' });
  const request = await submitPublication(f, next, {
    mode: 'approved_audience',
    audience: ['organization'],
  });
  const url = '/api/publication-requests/' + request.id + '/evaluation';
  const owner = await signIn(f);
  const reviewer = await signIn(f, 'reviewer');
  const own = reviewEvaluationResponseSchema.parse((await owner.get(url).expect(200)).body);
  assert.equal(own.candidate?.reused_from, previous.id);
  assert.equal(own.current?.id, previous.id);
  const limited = reviewEvaluationResponseSchema.parse((await reviewer.get(url).expect(200)).body);
  assert.equal(limited.current, null);
  assert.equal(limited.candidate?.reused_from, null);
  assert.deepEqual(limited.candidate.dimensions, own.candidate.dimensions);
  assert(limited.candidate.stages.every((stage) => stage.state === 'succeeded'));
  const raw = JSON.stringify(limited);
  assert(!raw.includes(previous.id));
  for (const stage of previous.stages)
    if (stage.execution_id) assert(!raw.includes(stage.execution_id));
});

test('目录干扰项先保留词项最接近的四个当前发布，再从其余发布中补三个且不重复', async (t) => {
  const { f } = await evaluationHub(t, {}, 0);
  const near: string[] = [];
  const others: string[] = [];
  for (let i = 0; i < 9; i++) {
    const close = i < 4;
    const result = await publishSkill(f, {
      slug: 'catalog-item-' + i,
      appliesTo: { keywords: close ? ['Ｃｈｅｃｋｌｉｓｔ'] : ['翻译'] },
    });
    const asset = await f.hub.assetAccess.getAsset(result.intake.asset_id);
    assert(asset.current_release_id);
    (close ? near : others).push(asset.current_release_id);
  }
  const item = await receiveSkill(f);
  f.hub.config.evaluationDailyRequests = 300;
  await submitPublication(f, item, undefined, { keywords: ['checklist'] });
  const generation = await claimStage(f, 'trigger-cases');
  await f.hub.evaluationRunner.process(generation);
  const row = await f.store.get('resource_evaluations', generation.aggregate_id);
  const selected = row?.context?.distractor_release_ids;
  assert(selected);
  assert.equal(selected.length, 7);
  assert.equal(new Set(selected).size, 7);
  assert.deepEqual(new Set(selected.slice(0, 4)), new Set(near));
  assert(selected.slice(4).every((id) => others.includes(id)));
});

test('旧标准只展示符合发布冻结声明的结果，当前评测进展改变公开投影和缓存', async (t) => {
  const { f } = await evaluationHub(t, {}, 0);
  const { intake } = await publishSkill(f);
  await f.worker.tick();
  const [completed] = await f.store.listVersionEvaluations(intake.version_id);
  assert.equal(completed.state, 'succeeded');
  const url = '/api/assets/' + intake.asset_id + '/versions/' + intake.version_id + '/evaluation';
  const anonymous = httpClient(f);
  const owner = await signIn(f);
  const reviewer = await signIn(f, 'reviewer');
  const reader = await signIn(f, 'reader');
  const historyUrl = '/api/management/versions/' + intake.version_id + '/evaluations';
  async function card() {
    const list = (await anonymous.get('/api/assets').expect(200)).body as SearchResultResponse;
    assert.equal(list.items[0].current_release.version_id, intake.version_id);
    return list.items[0].current_release.evaluation;
  }
  await f.store.remove('resource_evaluations', completed.id);
  const historical = {
    ...completed,
    id: randomUUID(),
    scope: 'full' as const,
    rubric_version: '2026-11-24.2',
    audience_class: 'public' as const,
    requires_api_key: false,
    evaluator_digest: 'sha256:' + sha256('prior-evaluator'),
    subject_digest: 'sha256:' + sha256('prior-public-content'),
    stages: [...completed.stages, { id: 'transparency', state: 'succeeded' as const, requests: 1 }],
  };
  for (const frozen of [
    { audience_class: 'signed_in' as const, requires_api_key: false },
    { audience_class: 'public' as const, requires_api_key: true },
  ])
    for (const rubric_version of [historical.rubric_version, completed.rubric_version])
      await f.store.insert('resource_evaluations', {
        ...historical,
        ...frozen,
        id: randomUUID(),
        rubric_version,
        subject_digest: 'sha256:' + sha256(JSON.stringify(frozen)),
      });
  const missing = evaluationResponseSchema.parse((await anonymous.get(url).expect(200)).body);
  assert.equal(missing.evaluation, null);
  assert.equal(missing.updating, false);
  await f.store.insert('resource_evaluations', historical);
  const legacyResponse = await anonymous.get(url).expect(200);
  const legacy = evaluationResponseSchema.parse(legacyResponse.body);
  assert.equal(legacy.current_rubric_version, completed.rubric_version);
  assert.equal(legacy.evaluation?.id, historical.id);
  assert.equal(legacy.evaluation.rubric_version, historical.rubric_version);
  assert.deepEqual(legacy.evaluation.limitations, ['scripts_not_executed']);
  assert.equal(legacy.comparison_status, 'none');
  assert.equal(legacy.baseline, null);
  assert.equal(legacy.updating, false);
  assert.equal(await card(), undefined);
  const disabled = managementEvaluationsResponseSchema.parse(
    (await owner.get(historyUrl).expect(200)).body,
  );
  assert.equal(disabled.model_enabled, false);
  assert.equal(disabled.can_request, false);
  f.hub.config.evaluationDailyRequests = 300;
  await f.hub.evaluations.manual(f.admin, intake.version_id, randomUUID());
  const updating = await anonymous
    .get(url)
    .set('If-None-Match', legacyResponse.headers.etag)
    .expect(200);
  const before = evaluationResponseSchema.parse(updating.body);
  assert.equal(before.evaluation?.id, historical.id);
  assert.equal(before.updating, true);
  assert.equal(before.can_request, false);
  assert.equal(before.can_view_details, false);
  assert.equal(await card(), undefined);
  for (const [client, details, action] of [
    [owner, true, true],
    [reviewer, true, false],
    [reader, false, false],
  ] as const) {
    const authorized = evaluationResponseSchema.parse((await client.get(url).expect(200)).body);
    assert.equal(authorized.can_view_details, details);
    assert.equal(authorized.can_request, action);
  }
  await owner.get(url).set('If-None-Match', updating.headers.etag).expect(200);
  await anonymous.get(url).set('If-None-Match', updating.headers.etag).expect(304);
  const current = await finishModelEvaluation(f);
  const after = evaluationResponseSchema.parse(
    (await anonymous.get(url).set('If-None-Match', updating.headers.etag).expect(200)).body,
  );
  assert.equal(after.evaluation?.id, current.id);
  assert.equal(after.updating, false);
  assert.deepEqual(await card(), {
    dimensions: after.evaluation.dimensions
      .filter((d) => d.score !== null)
      .map(({ id, score, band, confidence }) => ({ id, score, band, confidence })),
  });
});

test('展示权限与 UTC 排队状态按读者、待办作业及资产手动次数即时更新', async (t) => {
  const { f, stub } = await evaluationHub(t, {}, 33);
  const intake = await receiveSkill(f);
  await f.hub.evaluationRunner.process(await claimEvaluation(f));
  const request = await submitPublication(f, intake);
  const historyUrl = '/api/management/versions/' + intake.version_id + '/evaluations';
  const reviewUrl = '/api/publication-requests/' + request.id + '/evaluation';
  const owner = await signIn(f);
  const reviewer = await signIn(f, 'reviewer');
  const historyResponse = await owner.get(historyUrl).expect(200);
  const history = managementEvaluationsResponseSchema.parse(historyResponse.body);
  const reviewResponse = await reviewer.get(reviewUrl).expect(200);
  const review = reviewEvaluationResponseSchema.parse(reviewResponse.body);
  assert.equal(history.current_rubric_version, review.candidate?.rubric_version);
  assert.equal(review.current_rubric_version, history.current_rubric_version);
  assert.equal(history.model_enabled, true);
  assert.equal(history.can_request, true);
  assert.equal(review.can_request, false);
  assert.equal(history.next_window_at, null);
  assert.equal(review.next_window_at, null);
  f.hub.config.evaluationDailyRequests = 32;
  const short = managementEvaluationsResponseSchema.parse(
    (await owner.get(historyUrl).expect(200)).body,
  );
  assert.equal(short.can_request, false);
  assert.equal(short.next_window_at, null);
  f.hub.config.evaluationDailyRequests = 33;
  const day = 86400000;
  const start = Math.floor(Date.now() / day) * day;
  const next = new Date(start + day).toISOString();
  const quota = {
    id: 'resource-evaluations' as const,
    window_start: start,
    reserved: 1,
    updated_at: new Date().toISOString(),
  };
  await f.store.insert('evaluation_schedule', quota);
  const waiting = managementEvaluationsResponseSchema.parse(
    (await owner.get(historyUrl).set('If-None-Match', historyResponse.headers.etag).expect(200))
      .body,
  );
  assert.equal(waiting.next_window_at, next);
  assert.equal(waiting.can_request, false);
  const compare = reviewEvaluationResponseSchema.parse(
    (await reviewer.get(reviewUrl).set('If-None-Match', reviewResponse.headers.etag).expect(200))
      .body,
  );
  assert.equal(compare.next_window_at, next);
  await f.store.put('evaluation_schedule', { ...quota, reserved: 0 });
  const first = await claimEvaluation(f);
  await f.store.put('evaluation_schedule', { ...quota, reserved: 33 });
  await f.hub.evaluationRunner.process(first);
  const delayed = managementEvaluationsResponseSchema.parse(
    (await owner.get(historyUrl).expect(200)).body,
  );
  assert.equal(delayed.items.find((row) => row.scope === 'full')?.state, 'running');
  assert.equal(delayed.next_window_at, next);
  assert.equal(stub.requests.length, 0);
  f.hub.config.evaluationDailyRequests = 300;
  const queue = await f.store.get('jobs', first.id);
  assert(queue);
  await f.store.put('jobs', { ...queue, run_after: 0 });
  const ready = managementEvaluationsResponseSchema.parse(
    (await owner.get(historyUrl).expect(200)).body,
  );
  assert.equal(ready.next_window_at, null);
  assert.equal(ready.can_request, true);
  for (const key of ['manual-1', 'manual-2', 'manual-3'])
    await f.hub.evaluations.manual(f.admin, intake.version_id, key);
  const capped = managementEvaluationsResponseSchema.parse(
    (await owner.get(historyUrl).expect(200)).body,
  );
  assert.equal(capped.can_request, false);
  assert.equal(capped.model_enabled, true);
  assert.equal(capped.next_window_at, null);
});

test('审核详情的评测入口跟随候选权限与发布受众，提交身份不能保留入口', async (t) => {
  const f = await createTestHub(t);
  const item = await receiveSkill(f);
  const role = await f.hub.administration.createRole(f.admin, {
    name: '发布时维护与共享',
    permissions: ['asset:maintain', 'source:share'],
  });
  const grant = await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const request = await f.hub.publications.submit(
    await f.hub.identity.principal(f.reader.id),
    {
      source_intake_id: item.id,
      version_id: item.version_id,
      category: 'uncategorized',
      scenario_ids: [],
      applies_to: { languages: ['TypeScript'] },
      distribution: { mode: 'approved_audience', audience: ['principal:' + f.admin.id] },
      purpose: '仅授权指定账号读取已发布内容',
      base_release_id: null,
    },
    randomUUID(),
  );
  const publicRequest = '/api/publication-requests/' + request.id;
  const compare = publicRequest + '/evaluation';
  const reviewer = await signIn(f, 'reviewer');
  const submitter = await signIn(f, 'reader');
  for (const client of [reviewer, submitter]) {
    assert.equal((await client.get(publicRequest).expect(200)).body.can_read_evaluation, true);
    await client.get(compare).expect(200);
  }
  await approveEvaluationCandidate(
    { ...f, reviewer: await f.hub.identity.principal(f.reviewer.id) },
    request,
  );
  assert.equal((await reviewer.get(publicRequest).expect(200)).body.can_read_evaluation, false);
  await reviewer.get(compare).expect(404);
  assert.equal((await submitter.get(publicRequest).expect(200)).body.can_read_evaluation, true);
  await f.hub.administration.removeGrant(f.admin, 'role_bindings', grant.id);
  assert.equal((await submitter.get(publicRequest).expect(200)).body.can_read_evaluation, false);
  await submitter.get(compare).expect(403);
});
