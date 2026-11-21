import {
  shortModelLimits,
  ShortModelError,
  type AiRuntime,
  type ModelProfile,
} from '@capability-hub/ai';
import {
  applyUsePatch,
  catalogUses,
  descriptionSentences,
  emptyCriteria,
  locateQuote,
  matchCandidates,
  passesHardFilters,
  proveRequirement,
  type AssetAccessService,
  type CandidateMatch,
  type CatalogDiscoveryService,
  type CatalogService,
  type DiscoveryCandidate,
  type DiscoveryCriteria,
  type DiscoveryUse,
  type EvidenceReason,
} from '@capability-hub/application';
import type { RecordStore } from '@capability-hub/application/ports';
import {
  discoveryCriteriaSchema,
  discoveryTurnRequestSchema,
  type DiscoveryStageEvent,
} from '@capability-hub/contracts';
import type {
  DiscoveryDirectionResponse,
  DiscoveryEntryResponse,
  DiscoveryJudgment,
  DiscoveryResultResponse,
  DiscoveryTurnResponse,
} from '@capability-hub/contracts/http';
import { fail, HubError } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import {
  catalogDiscoveryOperation,
  discoveryDecisionSchema,
  discoveryInstructions,
  type DiscoveryDecision,
  type DiscoveryModelInput,
  type DiscoveryPatch,
} from '@capability-hub/hub-agents';
import type { LogContext } from '@capability-hub/logging/server';
import type { ServerConfig } from '../config/server-config.js';
import type { CatalogPromptService } from './catalog-prompt-service.js';
import { catalogCards, cardBudget, resolveDiscoveryPicks } from './discovery-cards.js';
import { DiscoverySigner, type DiscoveryContext } from './discovery-context.js';
import { DiscoveryLimiter } from './discovery-limiter.js';

/** 本轮访问者：浏览器会话或匿名；会话标识只参与访客标记，不外传。 */
interface DiscoveryViewer {
  principal: Principal | null;
  sessionId: string | undefined;
}

/** 主体由当前事务重新解析；连接地址仅参与匿名限流。 */
interface DiscoveryTurnScope {
  readViewer: () => Promise<DiscoveryViewer>;
  clientAddress: string;
  signal: AbortSignal;
  requestId: string;
  /** 流式进度不含未复核的模型文本。 */
  progress?: (stage: DiscoveryStageEvent) => void;
}

/** 模型挑出、已通过核对的一项及其判断。 */
interface Judged {
  candidate: DiscoveryCandidate;
  judgment: DiscoveryJudgment;
}

interface Direction extends Omit<DiscoveryUse, 'field'> {
  criteria: DiscoveryCriteria;
  /** 模型为该方向挑出的版本；由目录用途归纳的方向没有。 */
  picks?: Judged[];
}

type ShownDirection = Extract<DiscoveryContext['shown'], { kind: 'directions' }>['items'][number];

/** 本轮送出的卡片引用号到当时固定版本的映射。 */
type RefMap = Map<string, DiscoveryCandidate>;

interface PreparedMessage {
  viewer: Principal | null;
  viewerKey: string;
  profile: ModelProfile;
  context: DiscoveryContext | undefined;
  suggestionRef: string | undefined;
  input: string;
  refs: RefMap;
  complete: boolean;
}

interface TurnState {
  viewer: Principal | null;
  viewerKey: string;
  goal: string | null;
  releases: DiscoveryContext['releases'];
  suggestions: string[];
  pendingDimension: string | null;
  unsure: number;
  criteria: DiscoveryCriteria;
  candidates: DiscoveryCandidate[];
}

/** 客户端在会话或目录读取时离开不属于服务器故障，也不能继续创建模型执行。 */
export function requireDiscoveryRequest(signal: AbortSignal) {
  if (signal.aborted) fail(409, 'DISCOVERY_CANCELLED', '本轮已停止');
}

function unavailable(): never {
  return fail(409, 'DISCOVERY_BASIS_UNAVAILABLE', '原依据已不可用，请重新说明');
}

function quoted(values: string[]) {
  return values.map((value) => `「${value}」`).join('');
}

function sameText(a: string, b: string) {
  return a.normalize('NFKC').trim().toLowerCase() === b.normalize('NFKC').trim().toLowerCase();
}

function retainSources(
  previous: DiscoveryContext['releases'] | undefined,
  candidates: Iterable<DiscoveryCandidate>,
) {
  const releases = { ...previous };
  for (const candidate of candidates) releases[candidate.release.id] = candidate.resolvedReleaseId;
  return releases;
}

/** 供应商与 SDK 的细节不出现在公开错误里，只区分出错环节。 */
function modelFailure(error: unknown) {
  if (!(error instanceof ShortModelError)) return error;
  switch (error.reason) {
    case 'configuration':
      return new HubError(503, 'DISCOVERY_MODEL_UNAVAILABLE', '对话模型配置不可用，请联系管理员');
    case 'input_too_large':
      return new HubError(
        422,
        'DISCOVERY_INPUT_TOO_LARGE',
        '本轮内容超过对话上限，请精简后重新提问',
      );
    case 'timeout':
      return new HubError(504, 'DISCOVERY_TIMEOUT', '模型响应超时，请重试', {}, true);
    case 'rate_limited':
      return new HubError(429, 'DISCOVERY_PROVIDER_BUSY', '模型服务繁忙，请稍后重试', {}, true);
    case 'cancelled':
      return new HubError(409, 'DISCOVERY_CANCELLED', '本轮已停止');
    case 'output_too_large':
      return new HubError(502, 'DISCOVERY_OUTPUT_INVALID', '模型响应超过本轮大小上限', {}, true);
    case 'invalid_output':
      return new HubError(
        502,
        'DISCOVERY_OUTPUT_INVALID',
        error.output ? error.message : '模型没有给出有效结果，请重试或换个说法',
        {},
        true,
      );
    default:
      return new HubError(
        502,
        'DISCOVERY_PROVIDER_FAILED',
        '模型服务暂时不可用，请稍后重试',
        {},
        true,
      );
  }
}

/**
 * 首页提问不改目录、不建聊天或幂等记录。AI 执行进入统一账本，问题与回答不落库、不写日志。
 * 出站前后各开一次短事务：先核对访客、模式和本轮沿用内容的发布依据并取最小输入，
 * 等待模型时不持有事务；返回后用新快照重新授权，再生成回应、计数和固定版本卡片。
 */
export class DiscoveryService {
  private readonly signer: DiscoverySigner;
  constructor(
    private readonly store: RecordStore,
    private readonly catalog: CatalogService,
    private readonly discovery: CatalogDiscoveryService,
    private readonly prompts: CatalogPromptService,
    private readonly access: AssetAccessService,
    private readonly config: ServerConfig,
    private readonly logs: LogContext,
    private readonly runtime: AiRuntime,
    private readonly limiter = new DiscoveryLimiter(),
  ) {
    this.signer = new DiscoverySigner(config.secret);
  }

  /** 配置了默认模型即为对话模式；不试拨模型。 */
  get profile(): ModelProfile | undefined {
    return this.config.ai.profiles.find((profile) => profile.id === this.config.ai.default_profile);
  }

  async entry(readViewer: () => Promise<DiscoveryViewer>): Promise<DiscoveryEntryResponse> {
    return await this.store.tx(async () => {
      const viewer = await readViewer();
      const dialogue = !!this.profile;
      return {
        mode: dialogue ? 'dialogue' : 'keywords',
        viewer_key: this.signer.viewer(viewer.principal, viewer.sessionId),
        suggestions: dialogue ? await this.prompts.visiblePrompts(viewer.principal) : [],
      };
    });
  }

  async turn(body: unknown, scope: DiscoveryTurnScope): Promise<DiscoveryTurnResponse> {
    requireDiscoveryRequest(scope.signal);
    const initial = await this.store.tx(async () => {
      const viewer = await scope.readViewer();
      requireDiscoveryRequest(scope.signal);
      const request = discoveryTurnRequestSchema.parse(body);
      const profile = this.profile;
      const mode = profile ? 'dialogue' : 'keywords';
      const viewerKey = this.signer.viewer(viewer.principal, viewer.sessionId);
      if (request.viewer_key !== viewerKey)
        fail(409, 'DISCOVERY_VIEWER_CHANGED', '登录状态已变化，原问题和结果已清除，请重新提问');
      if (request.expected_mode !== mode)
        fail(
          409,
          'DISCOVERY_MODE_CHANGED',
          profile
            ? '本站已启用对话式发现，问题会交由本站配置的模型处理，请确认后重新发送'
            : '本站当前没有可用模型，已改为关键词匹配，请确认后重新发送',
        );
      if (request.action === 'filter' || request.action === 'direction') {
        const context = this.signer.verify(request.context, mode, viewerKey);
        return request.action === 'filter'
          ? await this.filterTurn(viewer.principal, viewerKey, context, request.criteria)
          : await this.directionTurn(viewer.principal, viewerKey, context, request.index);
      }
      if (!profile) return await this.keywordTurn(viewer.principal, request.text);
      const context = request.context
        ? this.signer.verify(request.context, mode, viewerKey)
        : undefined;
      return await this.prepareMessage(viewer.principal, viewerKey, profile, request, context);
    });
    requireDiscoveryRequest(scope.signal);
    if ('mode' in initial) return initial;
    return await this.messageTurn(scope, initial);
  }

  private async keywordTurn(
    viewer: Principal | null,
    text: string,
  ): Promise<DiscoveryTurnResponse> {
    const result = await this.catalog.search(viewer, { q: text, limit: 8 });
    return {
      mode: 'keywords',
      type: 'matches',
      total: result.total,
      items: result.items.map((item) => {
        const audience = item.current_release.distribution.audience;
        return {
          asset_id: item.asset_id,
          slug: item.slug,
          kind: item.kind,
          version_id: item.current_release.version_id,
          version_label: item.current_release.version_label,
          category: item.current_release.category,
          owner_name: item.owner.name,
          visibility_label:
            audience.length === 1 && audience[0] === `group:${item.owner.id}`
              ? '团队可见'
              : item.current_release.visibility_label,
          published_at: item.current_release.published_at,
          description: item.description,
          has_scripts: item.current_release.has_scripts,
          match_reasons: item.match_reasons.map((reason) => ({
            field: reason.startsWith('名称')
              ? ('name' as const)
              : reason === '描述匹配'
                ? ('description' as const)
                : ('tag' as const),
            text: reason,
          })),
          unverified: [],
        };
      }),
    };
  }

  /** 整段模型状态可混用任何已送来源；不能仅重查选中项，固定版本上新则仍按原发布核对。 */
  private async requireSources(
    viewer: Principal | null,
    context: DiscoveryContext,
    candidates: DiscoveryCandidate[],
  ) {
    const visible = new Map(
      candidates.map((candidate) => [candidate.release.id, candidate.resolvedReleaseId]),
    );
    for (const [id, resolved] of Object.entries(context.releases)) {
      if (visible.get(id) === resolved) continue;
      const release = await this.store.get('releases', id);
      if (
        !release ||
        (id !== resolved && !(await this.access.matchesAudience(viewer, release))) ||
        !(await this.discovery.basisValid(viewer, {
          asset_id: release.asset_id,
          version_id: release.version_id,
          release_id: resolved,
        }))
      )
        unavailable();
    }
    for (const ref of context.suggestions)
      if (!(await this.prompts.findPrompt(viewer, ref))) unavailable();
    if (
      context.criteria.scenario_id &&
      !(await this.discovery.scenarios(viewer)).some(
        (scenario) => scenario.id === context.criteria.scenario_id,
      )
    )
      unavailable();
  }

  private async filterTurn(
    viewer: Principal | null,
    viewerKey: string,
    context: DiscoveryContext,
    input: DiscoveryCriteria,
  ) {
    const candidates = await this.discovery.candidates(viewer);
    await this.requireSources(viewer, context, candidates);
    const criteria = discoveryCriteriaSchema.parse(input);
    if (
      criteria.scenario_id &&
      !(await this.discovery.scenarios(viewer)).some(
        (scenario) => scenario.id === criteria.scenario_id,
      )
    )
      fail(422, 'DISCOVERY_SCENARIO_UNAVAILABLE', '所选场景当前不可用');
    return await this.matchesTurn(
      {
        viewer,
        viewerKey,
        goal: context.goal,
        releases: context.releases,
        suggestions: context.suggestions,
        pendingDimension: null,
        unsure: 0,
        criteria,
        candidates,
      },
      '',
    );
  }

  private async prepareMessage(
    viewer: Principal | null,
    viewerKey: string,
    profile: ModelProfile,
    request: { text: string; suggestion_ref?: string },
    context: DiscoveryContext | undefined,
  ): Promise<PreparedMessage> {
    if (request.suggestion_ref && !(await this.prompts.findPrompt(viewer, request.suggestion_ref)))
      unavailable();
    const candidates = await this.discovery.candidates(viewer);
    if (context) await this.requireSources(viewer, context, candidates);
    const criteria = context?.criteria ?? emptyCriteria;
    const scenario = criteria.scenario_id
      ? ((await this.discovery.scenarios(viewer)).find((item) => item.id === criteria.scenario_id)
          ?.name ?? null)
      : null;
    const shown = context?.shown;
    const value: DiscoveryModelInput = {
      message: request.text,
      goal: context?.goal ?? null,
      criteria: {
        keywords: criteria.keywords,
        requirements: criteria.requirements,
        kind: criteria.kind,
        category: criteria.category,
        scenario,
        audience: criteria.audience,
        has_scripts: criteria.has_scripts,
      },
      pending_dimension: context?.pending_dimension ?? null,
      unsure_count: context?.unsure ?? 0,
      shown:
        shown && shown.kind !== 'none'
          ? { kind: shown.kind, count: shown.items.length, refs: shown.items.map(() => null) }
          : { kind: 'none', count: 0, refs: [] },
      catalog: [],
      catalog_complete: true,
    };
    // 卡片只来自此刻对访问者可读的发布；上一轮展示项只送仍在卡片里的引用号，不送其文案。
    const deck = catalogCards(
      candidates,
      [request.text, value.goal ?? '', ...criteria.keywords, ...criteria.requirements].join(' '),
      cardBudget(shortModelLimits(profile).maxRequestBytes, discoveryInstructions, value),
    );
    value.catalog = deck.cards;
    value.catalog_complete = deck.complete;
    if (shown && shown.kind !== 'none')
      value.shown.refs = shown.items.map((item) => {
        const target = 'basis' in item ? item.basis : item;
        for (const [ref, candidate] of deck.refs)
          if (candidate.asset.id === target.asset_id && candidate.version.id === target.version_id)
            return ref;
        return null;
      });
    return {
      viewer,
      viewerKey,
      profile,
      context,
      suggestionRef: request.suggestion_ref,
      input: JSON.stringify(value),
      refs: deck.refs,
      complete: deck.complete,
    };
  }

  private async messageTurn(
    scope: DiscoveryTurnScope,
    { viewer, viewerKey, profile, context, suggestionRef, input, refs, complete }: PreparedMessage,
  ): Promise<DiscoveryTurnResponse> {
    const progress = scope.progress;
    progress?.({ stage: 'catalog', resources: refs.size, complete });
    let reported = 0;
    // 模型尚未给完引用，草稿可能会被整段丢弃；此时只推送写作进度，不转发任何原文。
    const onPartial = (partial: unknown) => {
      if (reported === 240 || !partial || typeof partial !== 'object') return;
      const reply = 'reply' in partial && typeof partial.reply === 'string' && partial.reply;
      const question =
        'question' in partial && typeof partial.question === 'string' && partial.question;
      const text = reply || question;
      if (!text) return;
      const characters = Array.from(text.slice(0, 240)).length;
      if (reported && characters < reported + 8) return;
      reported = characters;
      progress?.({ stage: 'writing', characters });
    };
    const verify = async (decision: DiscoveryDecision) => {
      const current = await scope.readViewer();
      requireDiscoveryRequest(scope.signal);
      // 模型返回前失权、换号或依据被撤回，都丢弃这次输出。
      if (this.signer.viewer(current.principal, current.sessionId) !== viewerKey)
        fail(409, 'DISCOVERY_VIEWER_CHANGED', '登录状态已变化，原问题和结果已清除，请重新提问');
      if (suggestionRef && !(await this.prompts.findPrompt(current.principal, suggestionRef)))
        unavailable();
      const candidates = await this.discovery.candidates(current.principal);
      if (context) await this.requireSources(current.principal, context, candidates);
      // 自由文本也可能提到没被选中的卡片；复核整批输入，不能只检查最终的 picks。
      const pending = new Map<string, string>();
      for (const sent of refs.values()) pending.set(sent.release.id, sent.resolvedReleaseId);
      for (const candidate of candidates) {
        if (!pending.size) break;
        if (pending.get(candidate.release.id) === candidate.resolvedReleaseId)
          pending.delete(candidate.release.id);
      }
      if (pending.size) unavailable();
      const state: TurnState = {
        viewer: current.principal,
        viewerKey,
        goal: decision.goal || context?.goal || null,
        releases: retainSources(context?.releases, refs.values()),
        suggestions: [
          ...new Set([...(context?.suggestions ?? []), ...(suggestionRef ? [suggestionRef] : [])]),
        ],
        pendingDimension: null,
        unsure: 0,
        criteria: context?.criteria ?? emptyCriteria,
        candidates,
      };
      if (decision.action === 'refer') return await this.referTurn(state, decision, context, refs);
      if (decision.action === 'guide') return await this.guideTurn(state, decision, context, refs);
      return await this.searchTurn(state, decision, refs);
    };
    const started = performance.now();
    try {
      return await this.runtime.runInline(
        {
          operationId: catalogDiscoveryOperation.id,
          ownerId: viewer?.id ?? 'anonymous',
          profileId: profile.id,
          signal: scope.signal,
        },
        async (run) => {
          let release: (() => void) | undefined;
          const result = await run.call('turn', {
            operation: 'catalog-discovery/turn',
            instructions: discoveryInstructions,
            input,
            schema: discoveryDecisionSchema,
            limits: {
              maxOutputTokens: profile.max_output_tokens,
              timeoutMs: profile.request_timeout_ms,
            },
            reserve: () => {
              release = this.limiter.acquire(
                viewer ? `user:${viewer.id}` : `ip:${scope.clientAddress}`,
              );
            },
            release: () => release?.(),
            ...(progress && { onPartial }),
          });
          progress?.({ stage: 'verify' });
          const response = await this.store.tx(() => verify(result.value));
          this.logs.logger.info({
            event: 'discovery.turn',
            request_id: scope.requestId,
            duration_ms: result.duration_ms,
            input_tokens: result.usage.input_tokens,
            output_tokens: result.usage.output_tokens,
          });
          return response;
        },
      );
    } catch (error) {
      this.logs.logger.warn({
        event: 'discovery.turn_failed',
        request_id: scope.requestId,
        duration_ms: Math.round(performance.now() - started),
        reason:
          error instanceof ShortModelError
            ? error.reason
            : error instanceof HubError
              ? error.code
              : 'internal',
        ...(error instanceof ShortModelError && error.output ? { output: error.output } : {}),
      });
      throw modelFailure(error);
    }
  }

  /** 把模型补丁并入条件；场景名只在访问者可用的场景中解析，歧义时交给用户选择。 */
  private async applyPatch(state: TurnState, patch: DiscoveryPatch) {
    const base = state.criteria;
    const dropped = patch.drop_requirements ?? [];
    const merged = {
      ...base,
      keywords: patch.keywords ?? base.keywords,
      requirements: [
        ...base.requirements.filter(
          (requirement) => !dropped.some((item) => sameText(item, requirement)),
        ),
        ...(patch.requirements ?? []),
      ],
      kind: patch.kind === undefined ? base.kind : patch.kind,
      category: patch.category === undefined ? base.category : patch.category,
      audience: patch.audience ?? base.audience,
      has_scripts: patch.has_scripts === undefined ? base.has_scripts : patch.has_scripts,
    };
    let ambiguous: { id: string; name: string }[] = [];
    let unknownScenario: string | null = null;
    if (patch.scenario === null) merged.scenario_id = null;
    else if (patch.scenario) {
      const scenarios = await this.discovery.scenarios(state.viewer);
      const exact = scenarios.filter((scenario) => sameText(scenario.name, patch.scenario!));
      const fuzzy = exact.length
        ? exact
        : scenarios.filter((scenario) => {
            const name = scenario.name.normalize('NFKC').toLowerCase();
            const wanted = patch.scenario!.normalize('NFKC').toLowerCase();
            return name.includes(wanted) || wanted.includes(name);
          });
      if (fuzzy.length === 1) merged.scenario_id = fuzzy[0].id;
      else if (fuzzy.length > 1) ambiguous = fuzzy;
      else unknownScenario = patch.scenario;
    }
    merged.requirements = [
      ...new Map(merged.requirements.map((r) => [r.toLowerCase(), r])).values(),
    ].slice(0, 5);
    const criteria = discoveryCriteriaSchema.parse(merged);
    return { criteria, ambiguous, unknownScenario };
  }

  private async searchTurn(state: TurnState, decision: DiscoveryDecision, refs: RefMap) {
    const { patch } = decision;
    const applied = await this.applyPatch(state, patch);
    const next = { ...state, criteria: applied.criteria };
    if (applied.ambiguous.length) {
      const directions: Direction[] = [];
      for (const scenario of applied.ambiguous) {
        const criteria = { ...next.criteria, scenario_id: scenario.id };
        const representative = state.candidates.find((candidate) =>
          passesHardFilters(candidate, criteria),
        );
        if (representative)
          directions.push({
            label: scenario.name.slice(0, 28),
            intent: (
              descriptionSentences(representative.version.metadata.description)[0] ??
              representative.asset.slug
            ).slice(0, 200),
            patch: { scenario_id: scenario.id },
            representative,
            criteria,
          });
      }
      if (directions.length > 1)
        return this.directionsTurn(
          next,
          directions,
          `「${patch.scenario}」对应多个场景，请选一个：`,
        );
    }
    const lead = applied.unknownScenario
      ? `没有找到名为「${applied.unknownScenario}」的可用场景，本轮未按场景筛选。`
      : '';
    const picks = resolveDiscoveryPicks(decision.picks, refs, next.candidates, next.criteria);
    // 有挑选被拦下时不用模型的回应，避免它提到没有展示的资源。
    return await this.judgedTurn(
      next,
      picks,
      lead,
      picks.length === decision.picks.length ? decision.reply : '',
    );
  }

  private async guideTurn(
    state: TurnState,
    decision: DiscoveryDecision,
    context: DiscoveryContext | undefined,
    refs: RefMap,
  ) {
    const applied = await this.applyPatch(state, decision.patch);
    const next: TurnState = {
      ...state,
      criteria: applied.criteria,
    };
    if (!state.candidates.length) return await this.judgedTurn(next, [], '', '');
    const filtered = state.candidates.filter((candidate) =>
      passesHardFilters(candidate, next.criteria),
    );
    // 说不清且没有新线索，或又要问同一维度时，改从目录的实际用途给方向，不重复盘问。
    const repeated =
      !!context?.pending_dimension &&
      !!decision.dimension &&
      sameText(context.pending_dimension, decision.dimension);
    const unsure = decision.unsure || repeated;
    const grounded: Direction[] = [];
    if (!unsure)
      for (const direction of decision.directions) {
        const picks = resolveDiscoveryPicks(direction.picks, refs, filtered, next.criteria);
        const representative = picks[0]?.candidate;
        if (
          !representative ||
          grounded.some((item) => item.representative.asset.id === representative.asset.id)
        )
          continue;
        const requirements = direction.patch.requirements ?? [];
        const patch = requirements.length ? { requirements } : {};
        grounded.push({
          label: direction.label,
          intent: direction.intent,
          patch,
          representative,
          criteria: applyUsePatch(next.criteria, patch),
          picks,
        });
      }
    const fromModel = grounded.length > 0 && grounded.length === decision.directions.length;
    const directions = grounded.length
      ? grounded
      : catalogUses(
          filtered,
          [next.goal ?? '', ...next.criteria.keywords, ...next.criteria.requirements].join(' '),
          new Set((await this.discovery.scenarios(state.viewer)).map(({ id }) => id)),
          next.criteria.scenario_id,
        ).map((use) => ({ ...use, criteria: applyUsePatch(next.criteria, use.patch) }));
    const following: TurnState = {
      ...next,
      pendingDimension: decision.dimension || null,
      unsure: unsure ? (context?.unsure ?? 0) + 1 : 0,
    };
    if (!directions.length)
      return await this.judgedTurn(
        following,
        [],
        '',
        filtered.length
          ? '目录里暂时没有与此相关、能确认用途的资源。可以换个说法、放宽条件，或浏览资源目录。'
          : '当前条件下目录里没有资源，可以放宽类型、分类、场景或可见范围。',
      );
    if (directions.length === 1) return await this.singleUseTurn(following, directions[0]);
    const reply =
      fromModel && decision.question
        ? decision.question
        : unsure
          ? (context?.unsure ?? 0) > 0
            ? '没关系。下面是目录里确实能做、彼此不同的事，可以先看看哪个接近；它们只是有依据的用途，还不代表满足你的需要。'
            : '没关系，换个方式：目录里与此相关、彼此不同的用途有这些，你更接近哪一个？'
          : '目录里与此相关的用途有这些，你更接近哪一个？也可以直接补充你的情况。';
    return this.directionsTurn(following, directions, reply);
  }

  /** 只有一种用途时展示一个代表版本和它能做的事，不拼出第二个选项。 */
  private async singleUseTurn(state: TurnState, use: Direction) {
    const proofs = (use.patch.requirements ?? []).flatMap(
      (requirement) => proveRequirement(use.representative, requirement) ?? [],
    );
    const item = await this.describe(use.representative, proofs, [], use.picks?.[0]?.judgment);
    const context: DiscoveryContext = {
      ...this.baseContext(state),
      shown: {
        kind: 'results',
        items: [{ asset_id: item.asset_id, version_id: item.version_id }],
      },
    };
    return {
      mode: 'dialogue' as const,
      type: 'guide' as const,
      reply: `目录里与此相关、能确认的用途目前只有一类：${use.label}。下面是代表版本和它能做的事。`,
      goal: state.goal,
      criteria: state.criteria,
      directions: [],
      items: [item],
      context: this.signer.sign(context, 'dialogue', state.viewerKey),
    };
  }

  private directionsTurn(
    state: TurnState,
    directions: Direction[],
    reply: string,
  ): DiscoveryTurnResponse {
    const shown = directions.slice(0, 3);
    const context: DiscoveryContext = {
      ...this.baseContext(state),
      releases: retainSources(
        state.releases,
        shown.map((direction) => direction.representative),
      ),
      shown: {
        kind: 'directions',
        items: shown.map((direction) => ({
          label: direction.label,
          patch: direction.patch,
          basis: {
            asset_id: direction.representative.asset.id,
            version_id: direction.representative.version.id,
          },
          ...(direction.picks && {
            picks: direction.picks.map(({ candidate, judgment }) => ({
              asset_id: candidate.asset.id,
              version_id: candidate.version.id,
              ...judgment,
            })),
          }),
        })),
      },
    };
    return {
      mode: 'dialogue',
      type: 'guide',
      reply,
      goal: state.goal,
      criteria: state.criteria,
      directions: shown.map((direction): DiscoveryDirectionResponse => ({
        label: direction.label,
        intent: direction.intent,
        example: {
          slug: direction.representative.asset.slug,
          kind: direction.representative.asset.kind,
        },
        criteria: direction.criteria,
      })),
      items: [],
      context: this.signer.sign(context, 'dialogue', state.viewerKey),
    };
  }

  /** 模型挑出的结果按它给的顺序展示，顺序即后续指代的序号；没有回应时用服务端的固定说明。 */
  private async judgedTurn(
    state: TurnState,
    picks: Judged[],
    lead: string,
    reply: string,
  ): Promise<DiscoveryTurnResponse> {
    const requirements = state.criteria.requirements;
    const text =
      reply ||
      (!state.candidates.length
        ? '当前可见目录中暂无资源。'
        : picks.length
          ? `挑出 ${picks.length} 个可能适用的资源，理由见各项。`
          : requirements.length
            ? `当前可见目录里没有能满足${quoted(requirements)}的资源。可以放宽条件，或浏览资源目录。`
            : '目录里暂时没有能帮上忙的资源。可以换个说法，或浏览资源目录。');
    const context: DiscoveryContext = {
      ...this.baseContext(state),
      shown: picks.length
        ? {
            kind: 'results',
            items: picks.map(({ candidate }) => ({
              asset_id: candidate.asset.id,
              version_id: candidate.version.id,
            })),
          }
        : { kind: 'none' },
    };
    return {
      mode: 'dialogue',
      type: 'matches',
      reply: lead + text,
      goal: state.goal,
      criteria: state.criteria,
      total: picks.length,
      items: await Promise.all(
        picks.map(({ candidate, judgment }) => this.describe(candidate, [], [], judgment)),
      ),
      partial: [],
      missing: picks.length ? [] : requirements,
      context: this.signer.sign(context, 'dialogue', state.viewerKey),
    };
  }

  /** 展开上一轮的方向：有模型为它挑出的版本就重新授权后直接列出，不再请求模型；否则按方向条件查目录。 */
  private async followDirection(state: TurnState, direction: ShownDirection, index: number) {
    const criteria = applyUsePatch(state.criteria, direction.patch);
    if (
      direction.patch.scenario_id &&
      !(await this.discovery.scenarios(state.viewer)).some(
        ({ id }) => id === direction.patch.scenario_id,
      )
    )
      unavailable();
    const next: TurnState = { ...state, criteria };
    const lead = `按第 ${index} 个方向「${direction.label}」查找：`;
    if (!direction.picks?.length) return await this.matchesTurn(next, lead);
    const picks: Judged[] = [];
    for (const pick of direction.picks) {
      const candidate = await this.discovery.version(state.viewer, pick.asset_id, pick.version_id);
      if (!candidate || !passesHardFilters(candidate, criteria)) continue;
      const judgment: DiscoveryJudgment = {
        fit: pick.fit,
        reason: pick.reason,
        quote: (pick.quote && locateQuote(candidate, pick.quote)?.text) || null,
      };
      picks.push({ candidate, judgment });
    }
    return await this.judgedTurn(next, picks, lead, '');
  }

  private async directionTurn(
    viewer: Principal | null,
    viewerKey: string,
    context: DiscoveryContext,
    index: number,
  ) {
    const candidates = await this.discovery.candidates(viewer);
    await this.requireSources(viewer, context, candidates);
    const { shown } = context;
    if (shown.kind !== 'directions' || index > shown.items.length)
      fail(409, 'DISCOVERY_DIRECTION_UNAVAILABLE', '上一轮没有这个方向，请重新提问');
    return await this.followDirection(
      {
        viewer,
        viewerKey,
        goal: context.goal,
        releases: context.releases,
        suggestions: context.suggestions,
        pendingDimension: null,
        unsure: 0,
        criteria: context.criteria,
        candidates,
      },
      shown.items[index - 1],
      index,
    );
  }

  /**
   * 有必需项时只有全部证实的版本计入总数；只证实一部分的另列为仍需核对，一项都证实不了的不展示。
   * 展示顺序即后续指代的序号。
   */
  private async matchesTurn(state: TurnState, lead: string): Promise<DiscoveryTurnResponse> {
    const { verified, partial } = matchCandidates(state.candidates, state.criteria);
    const items = verified.slice(0, 8);
    const pending = partial.slice(0, Math.max(0, Math.min(3, 8 - items.length)));
    const requirements = state.criteria.requirements;
    const unproven = requirements.filter(
      (requirement) =>
        !state.candidates.some(
          (candidate) =>
            passesHardFilters(candidate, state.criteria) &&
            proveRequirement(candidate, requirement),
        ),
    );
    let reply: string;
    if (!state.candidates.length) reply = '当前可见目录中暂无资源。';
    else if (items.length)
      reply = requirements.length
        ? `找到 ${verified.length} 个发布信息能证实${quoted(requirements)}的资源。`
        : state.criteria.keywords.length
          ? `按关键词找到 ${verified.length} 个相关资源；它们只是相关词命中，是否适用请看各自的依据。`
          : `按当前条件列出 ${verified.length} 个资源。`;
    else if (requirements.length)
      reply =
        `当前可见目录里没有发布信息能证实${quoted(unproven.length ? unproven : requirements)}的资源。` +
        (pending.length
          ? '下面的资源只证实了部分要求，仍需核对。'
          : '可以放宽条件，或浏览资源目录。');
    else reply = '当前条件下没有找到资源。可以放宽类型、分类、场景或关键词，或浏览资源目录。';
    const describeAll = (matches: CandidateMatch[]) =>
      Promise.all(
        matches.map((match) => this.describe(match.candidate, match.reasons, match.unverified)),
      );
    const shownItems = [...items, ...pending];
    const context: DiscoveryContext = {
      ...this.baseContext(state),
      shown: shownItems.length
        ? {
            kind: 'results',
            items: shownItems.map((match) => ({
              asset_id: match.candidate.asset.id,
              version_id: match.candidate.version.id,
            })),
          }
        : { kind: 'none' },
    };
    return {
      mode: 'dialogue',
      type: 'matches',
      reply: lead + reply,
      goal: state.goal,
      criteria: state.criteria,
      total: verified.length,
      items: await describeAll(items),
      partial: await describeAll(pending),
      missing: items.length ? [] : unproven,
      context: this.signer.sign(context, 'dialogue', state.viewerKey),
    };
  }

  /** 按上一轮实际展示的顺序解析指代，不重新检索取第几名，也不因上新、重排或缺项补位。 */
  private async referTurn(
    state: TurnState,
    decision: DiscoveryDecision,
    context: DiscoveryContext | undefined,
    refs: RefMap,
  ): Promise<DiscoveryTurnResponse> {
    const shown = context?.shown;
    const clarify = (reply: string): DiscoveryTurnResponse => ({
      mode: 'dialogue',
      type: 'reference',
      reply,
      goal: state.goal,
      criteria: state.criteria,
      item: null,
      context: this.signer.sign(
        { ...this.baseContext(state), shown: { kind: 'none' } },
        'dialogue',
        state.viewerKey,
      ),
    });
    if (
      !shown ||
      shown.kind === 'none' ||
      decision.index < 1 ||
      decision.index > shown.items.length
    )
      return clarify('没能确定你指的是哪一项。请说明是第几个，或直接描述你的需要。');
    if (shown.kind === 'directions')
      return await this.followDirection(state, shown.items[decision.index - 1], decision.index);
    const target = shown.items[decision.index - 1];
    const candidate = await this.discovery.version(
      state.viewer,
      target.asset_id,
      target.version_id,
    );
    if (!candidate) return clarify(`第 ${decision.index} 项：该版本已不可用或你无权查看。`);
    const checks = [
      ...new Map(
        [decision.check, ...state.criteria.requirements]
          .filter(Boolean)
          .map((check) => [check.toLowerCase(), check]),
      ).values(),
    ].slice(0, 5);
    const proofs = checks.map((check) => ({ check, proof: proveRequirement(candidate, check) }));
    const lines = proofs.map(({ check, proof }) =>
      proof ? `「${check}」：发布信息写明“${proof.text}”。` : `「${check}」：发布信息未说明。`,
    );
    const summary = descriptionSentences(candidate.version.metadata.description)[0];
    // 模型的判断只在它评的正是这一固定版本时采用，否则只给发布信息核对。
    const pick = decision.picks.find((item) => {
      const sent = refs.get(item.ref);
      return sent?.asset.id === candidate.asset.id && sent.version.id === candidate.version.id;
    });
    const judgment: DiscoveryJudgment | undefined = pick && {
      fit: pick.fit,
      reason: pick.reason,
      quote: (pick.quote && locateQuote(candidate, pick.quote)?.text) || null,
    };
    const item = await this.describe(
      candidate,
      proofs.flatMap(({ proof }) => (proof ? [proof] : [])),
      proofs.flatMap(({ check, proof }) => (proof ? [] : [check])),
      judgment,
    );
    return {
      mode: 'dialogue',
      type: 'reference',
      reply:
        `第 ${decision.index} 项是 ${candidate.asset.slug}（${candidate.version.version_label}）。` +
        (judgment && decision.reply
          ? decision.reply
          : lines.length
            ? lines.join('')
            : summary
              ? `发布简介：${summary}`
              : ''),
      goal: state.goal,
      criteria: state.criteria,
      item,
      context: this.signer.sign(
        { ...this.baseContext(state), shown: { kind: 'results', items: [target] } },
        'dialogue',
        state.viewerKey,
      ),
    };
  }

  private baseContext(state: TurnState): Omit<DiscoveryContext, 'shown'> {
    return {
      goal: state.goal?.slice(0, 200) ?? null,
      pending_dimension: state.pendingDimension?.slice(0, 28) ?? null,
      releases: state.releases,
      suggestions: state.suggestions,
      criteria: state.criteria,
      unsure: Math.min(state.unsure, 20),
    };
  }

  private async describe(
    candidate: DiscoveryCandidate,
    reasons: EvidenceReason[],
    unverified: string[],
    judgment?: DiscoveryJudgment,
  ): Promise<DiscoveryResultResponse> {
    const { asset, version, release } = candidate;
    const audience = release.distribution.audience;
    return {
      asset_id: asset.id,
      slug: asset.slug,
      kind: asset.kind,
      version_id: version.id,
      version_label: version.version_label,
      category: release.category,
      owner_name: (await this.store.get('groups', asset.owner_group_id))?.name ?? '团队',
      visibility_label:
        audience.length === 1 && audience[0] === `group:${asset.owner_group_id}`
          ? '团队可见'
          : await this.access.formatVisibility(release.distribution),
      published_at: release.published_at,
      description: version.metadata.description,
      has_scripts: version.metadata.has_scripts ?? false,
      match_reasons: reasons.map((reason) => ({ ...reason })),
      unverified,
      ...(judgment && { judgment }),
    };
  }
}
