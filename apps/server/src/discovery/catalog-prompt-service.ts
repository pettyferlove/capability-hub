import { randomUUID } from 'node:crypto';
import {
  AiError,
  digest as profileDigest,
  shortModelLimits,
  ShortModelError,
  type AiRuntime,
  type InlineExecution,
  type ModelProfile,
} from '@capability-hub/ai';
import {
  applyUsePatch,
  emptyCriteria,
  proveRequirement,
  type CatalogDiscoveryService,
  type DiscoveryCandidate,
  type DiscoveryCriteria,
  type JobQueue,
  type PromptSourceCandidate,
} from '@capability-hub/application';
import type { RecordStore } from '@capability-hub/application/ports';
import { canonical, sha256 } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import {
  catalogPromptStateId,
  parseRecord,
  type CatalogPromptBasis,
  type CatalogPromptBatch,
  type CatalogPromptItem,
  type CatalogPromptStateRecord,
  type JobRecord,
} from '@capability-hub/domain/models';
import {
  catalogPromptsOperation,
  discoveryDecisionSchema,
  discoveryInstructions,
  promptCandidatesSchema,
  promptGenerationInstructions,
  type DiscoveryDecision,
  type DiscoveryModelInput,
  type PromptGenerationInput,
} from '@capability-hub/hub-agents';
import type { LogContext } from '@capability-hub/logging/server';
import { secretFindings } from '@capability-hub/infrastructure/content/secret-detection';
import type { ServerConfig } from '../config/server-config.js';
import { unsafePrompt } from './catalog-prompt-safety.js';
import {
  catalogCards,
  cardBudget,
  encodedBytes,
  resolveDiscoveryPicks,
} from './discovery-cards.js';
import type { z } from 'zod';

type PromptJob = Extract<JobRecord, { kind: 'catalog_prompt_refresh' }>;

const windowMs = 6 * 3600_000;
const retentionMs = 7 * 24 * 3600_000;
const batchLimit = 4;
const sourceLimit = 12;
const callLimit = 20;

interface SourceView {
  revision: string | null;
  sources: Map<string, PromptSourceCandidate>;
  scenarios: Map<string, string | null>;
}

interface PlannedBatch {
  key: string;
  audience: 'public' | 'restricted';
  sources: PromptSourceCandidate[];
  inputDigest: string;
  input: PromptGenerationInput;
}

/** 每批只提交已完成预检的结果；受限批次提交时一并推进游标。 */
interface Outcome {
  batch?: CatalogPromptBatch;
  cursor?: string;
  failure?: string;
}

function nextWindow(now: number) {
  return (Math.floor(now / windowMs) + 1) * windowMs;
}

function initialState(now: number): CatalogPromptStateRecord {
  return {
    id: catalogPromptStateId,
    next_refresh_at: now,
    active_job_id: null,
    window: null,
    cursor: null,
    batches: [],
    updated_at: new Date(now).toISOString(),
  };
}

function resourceInput(candidate: DiscoveryCandidate): PromptGenerationInput['resources'][number] {
  return {
    kind: candidate.asset.kind,
    description: candidate.version.metadata.description,
    tags: candidate.tags,
    scenarios: candidate.scenarios.map((scenario) => scenario.name),
  };
}

/** 单个来源也可能有很长的标签列表；保留简介，按稳定顺序纳入放得下的场景和标签。 */
function fitResource(input: PromptGenerationInput['resources'][number], budget: number) {
  const bytes = encodedBytes(input);
  if (bytes <= budget) return { input, bytes };
  const smaller = { ...input, scenarios: [] as string[], tags: [] as string[] };
  let used = encodedBytes(smaller);
  if (used > budget) return null;
  for (const key of ['scenarios', 'tags'] as const)
    for (const item of input[key]) {
      const size = encodedBytes(item) + 1;
      if (used + size > budget) continue;
      smaller[key].push(item);
      used += size;
    }
  return { input: smaller, bytes: used };
}

function scenarioKey(name: string) {
  return name.normalize('NFKC').trim().toLowerCase();
}

/**
 * 只采用前台会显示的模型推荐；开场提示还须在该固定版本找到摘录或证实全部必需项。
 * 导向回答只取真正展示的代表项，不保存方向、判断理由或摘录原文。
 */
function preflightBasis(
  decision: DiscoveryDecision,
  candidates: DiscoveryCandidate[],
  refs: Map<string, DiscoveryCandidate>,
  scenarioId: string | null,
): CatalogPromptBasis | null {
  const { patch } = decision;
  if (patch.scenario && !scenarioId) return null;
  const criteria: DiscoveryCriteria = {
    ...emptyCriteria,
    kind: patch.kind ?? null,
    category: patch.category ?? null,
    has_scripts: patch.has_scripts ?? null,
    audience: patch.audience ?? 'readable',
    scenario_id: scenarioId,
    requirements: patch.requirements ?? [],
  };
  const basis = (
    candidate: DiscoveryCandidate,
    quoteField: CatalogPromptBasis['fields'][number] | null,
    requirements: string[],
  ): CatalogPromptBasis | null => {
    const fields = new Set<CatalogPromptBasis['fields'][number]>();
    if (quoteField) fields.add(quoteField);
    else {
      for (const requirement of requirements) {
        const proof = proveRequirement(candidate, requirement);
        if (!proof || proof.field === 'name') return null;
        fields.add(proof.field);
      }
    }
    return fields.size
      ? {
          asset_id: candidate.asset.id,
          version_id: candidate.version.id,
          release_id: candidate.resolvedReleaseId,
          fields: [...fields],
        }
      : null;
  };
  if (decision.action === 'search') {
    for (const pick of resolveDiscoveryPicks(decision.picks, refs, candidates, criteria)) {
      const evidence = basis(pick.candidate, pick.quoteField, criteria.requirements);
      if (evidence) return evidence;
    }
  } else if (decision.action === 'guide' && !decision.unsure) {
    const seen = new Set<string>();
    for (const direction of decision.directions) {
      const [pick] = resolveDiscoveryPicks(direction.picks, refs, candidates, criteria);
      if (!pick || seen.has(pick.candidate.asset.id)) continue;
      seen.add(pick.candidate.asset.id);
      const evidence = basis(
        pick.candidate,
        pick.quoteField,
        applyUsePatch(criteria, direction.patch).requirements,
      );
      if (evidence) return evidence;
    }
  }
  return null;
}

/**
 * 后台开场提示：共享 Worker 每个 UTC 6 小时窗口至多入队一个作业，只读可分发发布的类型、简介、
 * 标签和场景，按受众分批生成，再用访客会发送的原文预检能否回答。每次出站前在租约事务里复核
 * 整批来源并预占窗口额度；每批与其执行成功事件原子提交，失去租约的旧执行者不写入。
 */
export class CatalogPromptService {
  readonly policyDigest = sha256(
    canonical({
      generation: promptGenerationInstructions,
      preflight: discoveryInstructions,
      version: 2,
    }),
  );
  constructor(
    private readonly store: RecordStore,
    private readonly discovery: CatalogDiscoveryService,
    private readonly jobs: JobQueue,
    private readonly config: ServerConfig,
    private readonly logs: LogContext,
    private readonly runtime: AiRuntime,
  ) {}

  private get profile(): ModelProfile | undefined {
    return this.config.ai.profiles.find((profile) => profile.id === this.config.ai.default_profile);
  }

  private usable(batch: CatalogPromptBatch, now: number) {
    return (
      batch.policy_digest === this.policyDigest &&
      now - Date.parse(batch.generated_at) < retentionMs
    );
  }

  /** 当前访客可见的开场提示：匿名只取公开批次，每批整批复核；须在调用方事务内。 */
  async visiblePrompts(viewer: Principal | null) {
    const state = await this.store.get('catalog_prompts', catalogPromptStateId);
    const result: { label: string; text: string; suggestion_ref: string }[] = [];
    const now = Date.now();
    for (const batch of [...(state?.batches ?? [])].sort((a, b) =>
      b.generated_at.localeCompare(a.generated_at),
    )) {
      if (
        !batch.prompts.length ||
        !this.usable(batch, now) ||
        (!viewer && batch.audience !== 'public') ||
        !(await this.discovery.batchValid(viewer, batch))
      )
        continue;
      for (const prompt of batch.prompts) {
        if (result.some((item) => item.text === prompt.text)) continue;
        result.push({
          label: prompt.label,
          text: prompt.text,
          suggestion_ref: prompt.suggestion_ref,
        });
        if (result.length === 4) return result;
      }
    }
    return result;
  }

  /** 定位草稿引用的提示并整批复核；合法标识本身不授予任何读取权限。须在调用方事务内。 */
  async findPrompt(viewer: Principal | null, ref: string): Promise<CatalogPromptItem | undefined> {
    const state = await this.store.get('catalog_prompts', catalogPromptStateId);
    for (const batch of state?.batches ?? []) {
      const prompt = batch.prompts.find((item) => item.suggestion_ref === ref);
      if (!prompt) continue;
      if (
        !this.usable(batch, Date.now()) ||
        (!viewer && batch.audience !== 'public') ||
        !(await this.discovery.batchValid(viewer, batch))
      )
        return;
      return prompt;
    }
  }

  /**
   * 秒级调度只读调度列；到期且没有活动作业时在同一写事务内入队并记录窗口。
   * 指针指向已终结、已取消或不存在的作业时修正为下一个窗口，不重开旧窗口；无模型不入队。
   */
  async schedule(now = Date.now()) {
    const profile = this.profile;
    if (!profile) return;
    const schedule = await this.store.catalogPromptSchedule();
    if (schedule && !schedule.active_job_id && schedule.next_refresh_at > now) return;
    if (schedule?.active_job_id) {
      const job = await this.store.get('jobs', schedule.active_job_id);
      if (job && (job.state === 'queued' || job.state === 'running')) return;
    }
    await this.store.tx(async () => {
      const stored = await this.store.get('catalog_prompts', catalogPromptStateId);
      let state = stored ?? initialState(now);
      if (state.active_job_id) {
        const job = await this.store.get('jobs', state.active_job_id);
        if (job && (job.state === 'queued' || job.state === 'running')) return;
        state = {
          ...state,
          active_job_id: null,
          next_refresh_at: Math.max(state.next_refresh_at, nextWindow(state.window!.start)),
          window: null,
          updated_at: new Date(now).toISOString(),
        };
        if (state.next_refresh_at > now) {
          await this.store.put('catalog_prompts', state);
          return;
        }
      }
      if (state.next_refresh_at > now) return;
      const start = Math.floor(now / windowMs) * windowMs;
      const job = await this.jobs.enqueue('catalog_prompt_refresh', catalogPromptStateId, {
        window_start: start,
        profile_digest: profileDigest(profile),
      });
      const next = parseRecord('catalog_prompts', {
        ...state,
        active_job_id: job.id,
        window: { start, job_id: job.id, reserved: 0, deadline: null },
        updated_at: new Date(now).toISOString(),
      });
      if (stored) await this.store.put('catalog_prompts', next);
      else await this.store.insert('catalog_prompts', next);
    });
  }

  /** Worker 为该类型单独分派；作业终态只由这里写入，不落入内容作业的通用成功或重试。 */
  async process(job: PromptJob, signal: AbortSignal) {
    try {
      const view: SourceView = { revision: null, sources: new Map(), scenarios: new Map() };
      const plan = await this.jobs.withLease(job, async () => {
        const state = await this.activeState(job);
        if (!state || Date.now() >= nextWindow(job.input.window_start))
          return { kind: 'stale' as const };
        const profile = this.profile;
        if (!profile || profileDigest(profile) !== job.input.profile_digest)
          return { kind: 'failed' as const, code: 'PROMPT_MODEL_CHANGED' };
        // 接管时已有预占却无法确认原处理进度：本窗不重发，保留有效旧提示，等下个窗口。
        if (job.attempt > 1 && state.window!.reserved > 0)
          return { kind: 'failed' as const, code: 'PROMPT_RECOVERY_UNCERTAIN' };
        await this.refreshSources(view);
        return {
          kind: 'ready' as const,
          profileId: profile.id,
          ...this.plan(state, view, profile),
        };
      });
      if (signal.aborted) return;
      if (plan.kind === 'stale') return await this.settleStale(job);
      if (plan.kind === 'failed') return await this.settle(job, { failure: plan.code }, null, view);
      try {
        if (!plan.generate.length) return await this.settle(job, {}, plan.keys, view);
        const options = {
          operationId: catalogPromptsOperation.id,
          ownerId: 'system',
          profileId: plan.profileId,
          signal,
        };
        for (const [index, batch] of plan.generate.entries()) {
          const result = await this.runtime.runInline(
            options,
            (run) => this.generate(run, job, batch, signal, view),
            (result) =>
              this.settle(
                job,
                {
                  batch: result.kind === 'batch' ? result.batch : undefined,
                  cursor:
                    result.kind !== 'stopped' && batch.audience === 'restricted'
                      ? batch.key
                      : undefined,
                },
                plan.keys,
                view,
                result.kind === 'stopped' || index === plan.generate.length - 1,
              ),
          );
          if (result.kind === 'stopped') break;
        }
      } catch (error) {
        // 停机或失去租约由接管者处理，不能把未完成的批次写成成功。
        if (signal.aborted) return;
        if (!(error instanceof AiError)) throw error;
        const reason = error instanceof ShortModelError ? error.reason : error.code;
        this.logs.logger.warn({ event: 'catalog_prompts.call_failed', reason });
        const failure =
          reason === 'timeout' || reason === 'AI_DEADLINE_EXCEEDED'
            ? 'PROMPT_PROVIDER_TIMEOUT'
            : error.code === 'AI_BUDGET_EXCEEDED'
              ? 'PROMPT_BUDGET_EXCEEDED'
              : 'PROMPT_PROVIDER_FAILED';
        await this.settle(job, { failure }, plan.keys, view);
      }
    } catch (error) {
      if (error instanceof HubError && error.code === 'LEASE_LOST') return;
      throw error;
    }
  }

  private async activeState(job: PromptJob) {
    const state = await this.store.get('catalog_prompts', catalogPromptStateId);
    return state?.active_job_id === job.id && state.window?.start === job.input.window_start
      ? state
      : undefined;
  }

  /** 每次在租约事务内核对目录修订；没有目录写入时复用本作业快照，不为每个预检遍历目录。 */
  private async refreshSources(view: SourceView) {
    const revision = await this.store.revision();
    if (view.revision === revision) return;
    view.sources.clear();
    view.scenarios.clear();
    for (const source of await this.discovery.promptSources()) {
      view.sources.set(source.version.id, source);
      for (const scenario of source.scenarios) {
        const name = scenarioKey(scenario.name);
        const previous = view.scenarios.get(name);
        view.scenarios.set(
          name,
          previous === undefined || previous === scenario.id ? scenario.id : null,
        );
      }
    }
    view.revision = revision;
  }

  private static unchanged(
    sources: CatalogPromptBatch['sources'],
    current: Map<string, PromptSourceCandidate>,
  ) {
    return sources.every((source) => {
      const now = current.get(source.version_id);
      return (
        now?.asset.id === source.asset_id &&
        now.release.id === source.release_id &&
        now.resolvedReleaseId === source.resolved_release_id
      );
    });
  }

  /** 公开批次只含匿名可读发布，受限批次按受众签名分组且不混用；公开优先，受限按游标轮转。 */
  private plan(state: CatalogPromptStateRecord, view: SourceView, profile: ModelProfile) {
    const groups = new Map<
      string,
      { audience: 'public' | 'restricted'; sources: PromptSourceCandidate[] }
    >();
    for (const source of view.sources.values()) {
      const key = source.publicReadable ? 'public' : source.audienceSignature;
      const group = groups.get(key) ?? {
        audience: source.publicReadable ? ('public' as const) : ('restricted' as const),
        sources: [],
      };
      group.sources.push(source);
      groups.set(key, group);
    }
    const batches: PlannedBatch[] = [];
    const budget = cardBudget(
      shortModelLimits(profile).maxRequestBytes,
      promptGenerationInstructions,
      { resources: [] },
    );
    for (const [group, entry] of groups) {
      let index = 0;
      let sources: PromptSourceCandidate[] = [];
      let input: PromptGenerationInput = { resources: [] };
      let used = 0;
      const flush = () => {
        batches.push({
          key: sha256(canonical({ group, index })),
          audience: entry.audience,
          sources,
          input,
          inputDigest: this.inputDigest(sources, input),
        });
        index++;
        sources = [];
        input = { resources: [] };
        used = 0;
      };
      for (const source of entry.sources) {
        const resource = resourceInput(source);
        if (
          !secretFindings(
            [resource.description, ...resource.tags, ...resource.scenarios].join('\n'),
          ).next().done
        )
          continue;
        const fitted = fitResource(resource, budget);
        if (!fitted) continue;
        if (sources.length && (sources.length >= sourceLimit || used + fitted.bytes + 1 > budget))
          flush();
        if (sources.length) used++;
        used += fitted.bytes;
        sources.push(source);
        input.resources.push(fitted.input);
      }
      if (sources.length) flush();
    }
    const restricted = batches
      .filter((batch) => batch.audience === 'restricted')
      .sort((a, b) => a.key.localeCompare(b.key));
    const turn = restricted.findIndex((batch) => state.cursor !== null && batch.key > state.cursor);
    const now = Date.now();
    const generate = [
      ...batches.filter((batch) => batch.audience === 'public'),
      ...(turn < 0 ? restricted : [...restricted.slice(turn), ...restricted.slice(0, turn)]),
    ]
      .filter((batch) => {
        const existing = state.batches.find((item) => item.audience_signature === batch.key);
        return !(existing?.input_digest === batch.inputDigest && this.usable(existing, now));
      })
      .slice(0, batchLimit);
    return { generate, keys: new Set(batches.map((batch) => batch.key)) };
  }

  /** 摘要覆盖来源、受众、白名单输入、文案规则与模型配置，任一变化都会重新生成。 */
  private inputDigest(sources: PromptSourceCandidate[], input: PromptGenerationInput) {
    return sha256(
      canonical({
        sources: sources.map((source) => ({
          asset: source.asset.id,
          version: source.version.id,
          release: source.release.id,
          resolved: source.resolvedReleaseId,
          audience: source.audienceSignature,
        })),
        input,
        policy: this.policyDigest,
        profile: this.profile ? profileDigest(this.profile) : null,
      }),
    );
  }

  /**
   * 出站前的租约事务：核对原租约与取消、活动作业与窗口、模型配置以及整批来源，
   * 全部通过才预占一次窗口额度。所有批次共用执行时限和请求次数，不得跨 UTC 窗口。
   */
  private async reserve(job: PromptJob, batch: PlannedBatch, view: SourceView) {
    return await this.jobs.withLease(job, async () => {
      const state = await this.activeState(job);
      if (!state || !this.profile || profileDigest(this.profile) !== job.input.profile_digest)
        return { kind: 'stopped' as const };
      const window = state.window!;
      if (window.reserved >= callLimit) return { kind: 'stopped' as const };
      if (window.reserved >= this.config.ai.max_requests)
        throw new AiError('AI_BUDGET_EXCEEDED', '提示刷新已达到模型请求次数上限');
      await this.refreshSources(view);
      if (
        !batch.sources.every((planned) => {
          const current = view.sources.get(planned.version.id);
          return (
            current === planned ||
            (current?.asset.id === planned.asset.id &&
              current.release.id === planned.release.id &&
              current.resolvedReleaseId === planned.resolvedReleaseId &&
              current.scenarios.length === planned.scenarios.length &&
              current.scenarios.every(
                (scenario, i) =>
                  scenario.id === planned.scenarios[i].id &&
                  scenario.name === planned.scenarios[i].name,
              ))
          );
        })
      )
        return { kind: 'changed' as const };
      const now = Date.now();
      const deadline = Math.min(
        window.deadline ??
          now + Math.min(this.config.ai.active_timeout_ms, this.config.ai.execution_timeout_ms),
        nextWindow(window.start),
      );
      if (now < window.start || now >= deadline) throw new ShortModelError('timeout');
      await this.store.put(
        'catalog_prompts',
        parseRecord('catalog_prompts', {
          ...state,
          window: { ...window, reserved: window.reserved + 1, deadline },
          updated_at: new Date(now).toISOString(),
        }),
      );
      if (Date.now() >= deadline) throw new ShortModelError('timeout');
      return { kind: 'reserved' as const, deadline };
    });
  }

  private sourceRefs(batch: PlannedBatch): CatalogPromptBatch['sources'] {
    return batch.sources.map((source) => ({
      asset_id: source.asset.id,
      version_id: source.version.id,
      release_id: source.release.id,
      resolved_release_id: source.resolvedReleaseId,
    }));
  }

  private async call<S extends z.ZodType>(
    run: InlineExecution,
    step: 'generate' | 'preflight',
    schema: S,
    instructions: string,
    input: string,
    signal: AbortSignal,
    deadline: number,
  ): Promise<z.infer<S>> {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ShortModelError('timeout');
    const result = await run.call(step, {
      operation: 'catalog-discovery/prompts',
      instructions,
      input,
      schema,
      signal: AbortSignal.any([signal, AbortSignal.timeout(remaining)]),
    });
    return result.value;
  }

  /** 一批至多一次生成和四次预检；任一来源变化即放弃整批，不再就该批发出请求。 */
  private async generate(
    run: InlineExecution,
    job: PromptJob,
    batch: PlannedBatch,
    signal: AbortSignal,
    view: SourceView,
  ): Promise<
    { kind: 'batch'; batch: CatalogPromptBatch } | { kind: 'stopped' } | { kind: 'changed' }
  > {
    const generation = await this.reserve(job, batch, view);
    if (generation.kind !== 'reserved') return generation;
    const { prompts: candidates } = await this.call(
      run,
      'generate',
      promptCandidatesSchema,
      promptGenerationInstructions,
      JSON.stringify(batch.input),
      signal,
      generation.deadline,
    );
    const prompts: CatalogPromptItem[] = [];
    for (const candidate of candidates) {
      // 先判断能否安全展示：不安全的候选不进入预检、存储或展示。
      if (unsafePrompt(candidate) || prompts.some((item) => item.text === candidate.text)) continue;
      const preflight = await this.reserve(job, batch, view);
      if (preflight.kind !== 'reserved') return preflight;
      const input: DiscoveryModelInput = {
        message: candidate.text,
        goal: null,
        criteria: {
          keywords: [],
          requirements: [],
          kind: null,
          category: null,
          scenario: null,
          audience: 'readable',
          has_scripts: null,
        },
        pending_dimension: null,
        unsure_count: 0,
        shown: { kind: 'none', count: 0, refs: [] },
        catalog: [],
        catalog_complete: true,
      };
      // 预检只拿本批来源当目录，验证这个问题能被它们回答。
      const deck = catalogCards(
        batch.sources,
        candidate.text,
        cardBudget(shortModelLimits(this.profile!).maxRequestBytes, discoveryInstructions, input),
      );
      input.catalog = deck.cards;
      input.catalog_complete = deck.complete;
      const decision = await this.call(
        run,
        'preflight',
        discoveryDecisionSchema,
        discoveryInstructions,
        JSON.stringify(input),
        signal,
        preflight.deadline,
      );
      const name = decision.patch.scenario;
      const id = name ? view.scenarios.get(scenarioKey(name)) : null;
      const scenario = id ? await this.store.get('scenarios', id) : null;
      const basis = preflightBasis(
        decision,
        batch.sources,
        deck.refs,
        scenario?.active ? scenario.id : null,
      );
      if (basis)
        prompts.push({
          suggestion_ref: randomUUID(),
          label: candidate.label,
          text: candidate.text,
          basis,
        });
    }
    return {
      kind: 'batch',
      batch: {
        id: randomUUID(),
        audience: batch.audience,
        audience_signature: batch.key,
        input_digest: batch.inputDigest,
        policy_digest: this.policyDigest,
        sources: this.sourceRefs(batch),
        generated_at: new Date().toISOString(),
        prompts,
      },
    };
  }

  /** 终结作业前可独立提交完整批次；失败批次不替换缓存，下个窗口从仍需刷新的批次继续。 */
  private async settle(
    job: PromptJob,
    outcome: Outcome,
    keys: ReadonlySet<string> | null,
    view: SourceView,
    finishJob = true,
  ) {
    await this.jobs.withLease(job, async (current) => {
      const state = await this.activeState(job);
      const now = Date.now();
      if (!state) {
        if (!outcome.failure) throw new AiError('AI_CANCELLED', '提示刷新窗口已结束');
        return await this.settleStale(job);
      }
      const deadline = Math.min(
        state.window!.deadline ?? Infinity,
        nextWindow(job.input.window_start),
      );
      await this.refreshSources(view);
      const batch = outcome.batch;
      const fresh =
        batch && CatalogPromptService.unchanged(batch.sources, view.sources) ? batch : null;
      const batches = state.batches.filter(
        (item) =>
          item.audience_signature !== fresh?.audience_signature &&
          this.usable(item, now) &&
          CatalogPromptService.unchanged(item.sources, view.sources) &&
          (keys === null || keys.has(item.audience_signature)),
      );
      if (fresh) batches.push(fresh);
      await this.store.put('catalog_prompts', {
        ...state,
        ...(finishJob && {
          active_job_id: null,
          window: null,
          next_refresh_at: nextWindow(job.input.window_start),
        }),
        cursor: outcome.cursor ?? state.cursor,
        batches,
        updated_at: new Date(now).toISOString(),
      });
      if (finishJob)
        await this.store.put('jobs', {
          ...current,
          state: outcome.failure ? 'failed' : 'succeeded',
          ...(outcome.failure
            ? {
                last_error_code: outcome.failure,
                error_message: '首页提示刷新未完成，等待下个窗口',
              }
            : {}),
          finished_at: new Date(now).toISOString(),
          lease_until: 0,
        });
      if (!outcome.failure && Date.now() >= deadline) throw new ShortModelError('timeout');
    });
  }

  /** 过期窗口只清自己的活动指针；已被替换的作业不能改写新窗口。 */
  private async settleStale(job: PromptJob) {
    await this.jobs.withLease(job, async (current) => {
      const state = await this.activeState(job);
      if (state)
        await this.store.put('catalog_prompts', {
          ...state,
          active_job_id: null,
          window: null,
          next_refresh_at: nextWindow(job.input.window_start),
          updated_at: new Date().toISOString(),
        });
      await this.store.put('jobs', {
        ...current,
        state: 'cancelled',
        last_error_code: 'PROMPT_WINDOW_STALE',
        error_message: '提示刷新窗口已结束',
        finished_at: new Date().toISOString(),
        lease_until: 0,
      });
    });
  }
}
