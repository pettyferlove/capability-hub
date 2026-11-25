import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test, type TestContext } from 'node:test';
import { aiConfigurationSchema } from '@capability-hub/ai';
import { hasInAnyScope } from '@capability-hub/domain/rbac';
import {
  evaluationDimensions,
  evaluationMaxRecoveryRequests,
  evaluationRubricVersion,
  evaluationStageRequests,
} from '@capability-hub/domain/evaluation';
import { calibrationSamples } from '../fixtures/evaluation/samples.js';
import {
  createTestHub,
  receiveSkill,
  submitPublication,
  type TestHub,
} from '../support/application.js';
import {
  summarizeCalibration,
  type CalibrationObservation,
} from '../support/evaluation-calibration.js';

const stages = Object.keys(evaluationStageRequests);
const maxRequests =
  evaluationMaxRecoveryRequests +
  Object.values(evaluationStageRequests).reduce<number>((sum, n) => sum + n, 0);

async function liveConfiguration() {
  const path = process.env.AI_LIVE_CONFIG;
  if (!path) throw new Error('请用 AI_LIVE_CONFIG 指定受保护的模型配置文件');
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    throw new Error('无法读取或解析 AI_LIVE_CONFIG 指定的模型配置');
  }
  const result = aiConfigurationSchema.safeParse(input);
  if (!result.success) throw new Error('AI_LIVE_CONFIG 未通过模型配置校验');
  const profile = result.data.profiles.find((p) => p.id === result.data.default_profile);
  if (!profile || !process.env[profile.credential_ref])
    throw new Error('请配置默认模型档案及其引用的凭据环境变量');
  if (result.data.max_requests < evaluationStageRequests['trigger-routing'])
    throw new Error('max_requests 不足以在一个触发路由阶段完成 16 次调用');
  return { ...result.data, profiles: [profile] };
}

type Sample = Awaited<ReturnType<typeof calibrationSamples>>[number];
type Config = Awaited<ReturnType<typeof liveConfiguration>>;
type Variant = CalibrationObservation['variant'];

async function sampleHub(t: TestContext, config: Config) {
  // 每次测量使用独立数据库，让三轮基线经过真实的去重、调度和续租路径。
  const f = await createTestHub(t, {
    ai: config,
    evaluationDailyRequests: maxRequests,
    evaluationBackfill: false,
  });
  // 上传者只有样本维护权限，接收流程因此不会另发资源审计的模型请求。
  await f.hub.administration.addMembership(f.admin, { user_id: f.reader.id, group_id: f.teamId });
  const role = await f.hub.administration.createRole(f.admin, {
    name: '标定样本作者',
    permissions: ['asset:create', 'asset:maintain', 'source:share'],
  });
  await f.hub.administration.grantRole(f.admin, {
    principal_id: f.reader.id,
    role_id: role.id,
    scope_type: 'team',
    scope_id: f.teamId,
  });
  const author = await f.hub.identity.principal(f.reader.id);
  assert(!hasInAnyScope(author, 'ai:execute'));
  return { ...f, admin: author };
}

async function measure(f: TestHub, sample: Sample, variant: Variant) {
  const intake = await receiveSkill(f, { slug: sample.slug, files: sample.variants[variant] });
  await f.worker.tick();
  await submitPublication(f, intake);
  for (let i = 0; i <= stages.length; i++) {
    await f.worker.tick();
    const result = (await f.store.listVersionEvaluations(intake.version_id)).find(
      (row) => row.scope === 'full',
    );
    if (!result || result.state === 'queued' || result.state === 'running') continue;
    return {
      state: result.state,
      evaluator: result.evaluator_digest,
      dimensions: result.dimensions.map(({ id, status, score, confidence, flags }) => ({
        id,
        status,
        score,
        confidence,
        flags,
      })),
      stages: result.stages.map(({ id, state, requests, failure_code }) => ({
        id,
        state,
        requests: requests ?? 0,
        failure_code,
      })),
    };
  }
  throw new Error('本轮评测未在预期阶段数内结束');
}

async function readUsage(f: TestHub) {
  const buckets = await f.hub.ai.runtime.store.summarizeTokenUsage(
    null,
    new Date().toISOString(),
    'day',
  );
  const usage = {
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    unconfirmed_requests: 0,
    other_requests: 0,
  };
  for (const bucket of buckets) {
    usage.requests += bucket.requests;
    if (bucket.operation_id !== 'resource-evaluation') usage.other_requests += bucket.requests;
    if (bucket.status === 'succeeded') {
      usage.input_tokens += bucket.input_tokens;
      usage.output_tokens += bucket.output_tokens;
    } else {
      usage.unconfirmed_requests += bucket.requests;
    }
  }
  return usage;
}

test('在默认模型档案上标定资源评测的五个维度与操纵检测', async (t) => {
  const config = await liveConfiguration();
  const samples = await calibrationSamples();
  const variants: Variant[] = [
    'baseline',
    'baseline',
    'baseline',
    ...evaluationDimensions,
    'manipulation',
  ];
  const observations: CalibrationObservation[] = [];
  const totals = {
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    unconfirmed_requests: 0,
    other_requests: 0,
    unmeasured_runs: 0,
  };
  let stopped = false;
  for (const sample of samples) {
    for (const [index, variant] of variants.entries()) {
      if (stopped) break;
      const repeat = variant === 'baseline' ? index + 1 : 1;
      await t.test([sample.slug, variant, repeat].join('/'), async (sub) => {
        let f: TestHub | undefined;
        try {
          f = await sampleHub(sub, config);
          const row = await measure(f, sample, variant);
          const observation = { sample: sample.slug, variant, repeat, dimensions: row.dimensions };
          observations.push(observation);
          sub.diagnostic(JSON.stringify({ ...row, sample: sample.slug, variant, repeat }));
          // 整次测量没有完成任何模型阶段，继续发送其余样本无法完成本轮标定。
          stopped = !row.stages.some((s) => s.id !== 'static' && s.state === 'succeeded');
        } catch {
          stopped = true;
          throw new Error('标定运行中断，剩余样本已停止；请检查夹具及模型档案');
        } finally {
          if (f) {
            const usage = await readUsage(f).catch(() => undefined);
            if (!usage) {
              totals.unmeasured_runs++;
              stopped = true;
            } else {
              totals.requests += usage.requests;
              totals.input_tokens += usage.input_tokens;
              totals.output_tokens += usage.output_tokens;
              totals.unconfirmed_requests += usage.unconfirmed_requests;
              totals.other_requests += usage.other_requests;
              sub.diagnostic(JSON.stringify({ sample: sample.slug, variant, repeat, ...usage }));
              if (usage.other_requests || usage.requests > maxRequests) stopped = true;
            }
          }
        }
      });
    }
  }
  const report = summarizeCalibration(
    samples.map((sample) => sample.slug),
    observations,
  );
  const passed = report.passed && !stopped;
  t.diagnostic(
    JSON.stringify({ rubric_version: evaluationRubricVersion, ...totals, ...report, passed }),
  );
  assert(passed, '未达到资源评测标定阈值，详见各项统计');
});
