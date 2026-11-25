import {
  AiError,
  AiRuntime,
  type AiAuthorization,
  type ExecutionRecord,
  type ResourceResolver,
} from '@capability-hub/ai';
import { createHubAgentRegistry } from '@capability-hub/hub-agents';
import {
  createAiStore,
  exchangePurgeBatchSize,
  HubAiQueue,
  purgeAiExchanges,
} from '@capability-hub/infrastructure/ai';
import type {
  IdentityService,
  JobQueue,
  AssetContentService,
  AssetAccessService,
  AgentEvidenceService,
  PublicationQueryService,
} from '@capability-hub/application';
import type { RecordStore } from '@capability-hub/application/ports';
import { has, hasInAnyScope } from '@capability-hub/domain/rbac';
import { HubError } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type { VersionRecord } from '@capability-hub/domain/models';
import type { ServerConfig } from '../config/server-config.js';

const businessOperations = new Set(['resource-audit', 'feedback-triage', 'publication-review']);
type ResourceAccessMode = 'execute' | 'inspect' | 'shared-feedback' | 'audit-write';

function isUnavailableResource(error: unknown) {
  return (
    error instanceof HubError &&
    ['FORBIDDEN', 'NOT_FOUND', 'CONTENT_UNAVAILABLE'].includes(error.code)
  );
}

function requireAiConsole(principal: Principal, execute = false) {
  if (!has(principal, 'ai:inspect'))
    throw new AiError('AI_FORBIDDEN', '当前账号无权访问 Agent 执行记录');
  if (execute && !has(principal, 'ai:execute'))
    throw new AiError('AI_FORBIDDEN', '当前账号无权执行平台级 AI 操作');
}

function automaticTriageKey(feedbackId: string) {
  return `feedback-triage:auto:${feedbackId}`;
}

function approvesAssessment(response: unknown) {
  return (
    !!response &&
    typeof response === 'object' &&
    'approved' in response &&
    response.approved === true
  );
}

/**
 * 服务端 AI 装配：用身份、作业队列、资产访问与证据服务构造 {@link AiRuntime}，
 * 并在每次访问前重查账号状态与执行引用的业务资源——失去权限或资源不可访问即抛
 * `AiError('AI_FORBIDDEN')`，因此停用账号的会话不会读到历史执行。
 */
export class HubAiServices {
  readonly runtime: AiRuntime;
  private readonly exchangeRetentionDays: number;
  private lastExchangePurge = 0;
  // 目标无权直接拒绝；仅历史依据不可交付时返回原因，允许首份审计跳过该条记录。
  private readonly checkResources: (
    principal: Principal,
    execution: ExecutionRecord,
    mode: ResourceAccessMode,
  ) => Promise<string | undefined>;
  constructor(
    private readonly identity: IdentityService,
    private readonly store: RecordStore,
    jobs: JobQueue,
    private readonly access: AssetAccessService,
    content: AssetContentService,
    config: ServerConfig,
    private readonly evidence: AgentEvidenceService,
    private readonly publications: PublicationQueryService,
  ) {
    const aiStore = createAiStore(store);
    this.exchangeRetentionDays = config.aiExchangeRetentionDays;
    this.checkResources = async (principal, execution, mode) => {
      if (execution.payload.execution_mode === 'inline') {
        requireAiConsole(principal);
        if (mode !== 'inspect') throw new AiError('AI_FORBIDDEN', '自动执行记录只可查看');
        return;
      }
      if (execution.payload.operation_id === 'publication-review') {
        const input = execution.payload.input;
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          typeof input.publication_request_id !== 'string'
        )
          throw new AiError('AI_CONFIGURATION', '缺少审核申请');
        try {
          await publications.requireAgentAccess(
            principal,
            input.publication_request_id,
            mode === 'inspect' ? 'inspect' : 'execute',
          );
        } catch (error) {
          if (error instanceof HubError && error.code === 'REVIEW_STALE')
            throw new AiError('AI_CONFLICT', '申请已处理或审核上下文已变化');
          throw error;
        }
      } else if (businessOperations.has(execution.payload.operation_id)) {
        const input = execution.payload.input;
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          typeof input.version_id !== 'string'
        )
          throw new AiError('AI_CONFIGURATION', '业务目标不完整');
        const { asset } = await evidence.version(principal.id, input.version_id, false);
        if (execution.payload.operation_id === 'feedback-triage') {
          if (typeof input.feedback_id !== 'string')
            throw new AiError('AI_CONFIGURATION', '反馈目标不完整');
          const feedback = await evidence.feedbackTarget(principal.id, input.feedback_id, false);
          if (feedback.version_id !== input.version_id)
            throw new AiError('AI_CONFLICT', '反馈与资源版本不匹配');
          if (mode === 'shared-feedback' && !feedback.can_manage)
            throw new AiError('AI_FORBIDDEN', '无权查看该反馈的共享研判');
        }
        if (
          !has(principal, 'ai:execute', access.assetContext(asset)) &&
          !(mode === 'inspect' && has(principal, 'ai:inspect'))
        )
          throw new AiError('AI_FORBIDDEN', '当前账号无权在此范围执行 AI 操作');
        if (
          mode === 'audit-write' &&
          (await this.hasPendingSubmission(principal.id, input.version_id))
        )
          throw new AiError(
            'AI_CONFLICT',
            '你提交的该版本发布申请正在审核，暂不能发起或采纳资源审计。',
          );
      } else {
        requireAiConsole(principal, mode !== 'inspect');
      }
      const refs = execution.payload.evidence_refs;
      if (refs) {
        for (const id of refs) {
          try {
            await evidence.version(principal.id, id, false);
          } catch (error) {
            if (isUnavailableResource(error)) return '执行引用的业务资源不可访问';
            throw error;
          }
        }
      } else if (
        (execution.payload.operation_id === 'resource-audit' ||
          execution.payload.operation_id === 'feedback-triage') &&
        execution.payload.usage.tools
      ) {
        // 旧比较未记基线；只有工具记录齐全，且比较没有交付任何结果时才沿用旧报告。
        const count = execution.payload.usage.tools;
        const query = { execution_id: execution.id, limit: Math.min(count, 1000) };
        const starts = await aiStore.list('ai_events', { ...query, event_types: ['tool.started'] });
        if (
          starts.length !== count ||
          starts.some((row) => typeof row.payload.data.tool_id !== 'string')
        )
          return '无法核实历史执行的工具依据';
        const comparisons = starts.filter((row) => row.payload.data.tool_id === 'compare-release');
        if (comparisons.length) {
          const failed = await aiStore.list('ai_events', {
            ...query,
            event_types: ['tool.failed'],
          });
          const discarded = new Set(
            failed
              .filter((row) => row.payload.data.tool_id === 'compare-release')
              .map((row) => row.payload.data.invocation_id),
          );
          if (
            comparisons.some(
              ({ payload: { data } }) =>
                typeof data.invocation_id !== 'string' || !discarded.has(data.invocation_id),
            )
          )
            return '无法核实历史执行的比较依据';
        }
      }
      for (const artifact of await aiStore.list('ai_artifacts', {
        execution_id: execution.id,
        limit: 1000,
      })) {
        if (!artifact.payload.name.startsWith('resource:')) continue;
        const value = artifact.payload.content;
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value) ||
          typeof value.id !== 'string'
        )
          throw new AiError('AI_RECOVERY_UNCERTAIN', '资源证据不完整');
        const match = /^version:([^/]+)\/(.+)$/.exec(value.id);
        if (!match) throw new AiError('AI_RECOVERY_UNCERTAIN', '资源证据不完整');
        try {
          await access.requireReadableVersion(principal, match[1]);
        } catch (error) {
          if (isUnavailableResource(error)) return '执行引用的资源权限已变化';
          throw error;
        }
      }
    };
    const authorization: AiAuthorization = {
      authorize: async (ownerId, action, execution, target) => {
        try {
          const principal = await identity.principal(ownerId);
          if (
            !hasInAnyScope(principal, 'ai:execute') ||
            (execution && execution.owner_id !== ownerId)
          )
            throw new AiError('AI_FORBIDDEN', '当前账号无权执行 AI 操作');
          if (execution) {
            const auditWrite =
              execution.payload.operation_id === 'resource-audit' &&
              (action === 'submit' ||
                (action === 'respond' &&
                  typeof target === 'object' &&
                  approvesAssessment(target.response)));
            await this.recheckResources(
              principal,
              execution,
              auditWrite ? 'audit-write' : 'execute',
            );
          }
        } catch (error) {
          if (error instanceof HubError) throw new AiError('AI_FORBIDDEN', '账号或授权已失效');
          throw error;
        }
      },
    };
    const resources: ResourceResolver = {
      resolve: async (ownerId, reference, signal) => {
        signal.throwIfAborted();
        const match = /^version:([^/]+)\/(.+)$/.exec(reference);
        if (!match)
          throw new AiError('AI_CONFIGURATION', '资源引用格式为 version:<版本 ID>/<文件路径>');
        const principal = await identity.principal(ownerId);
        const version = await access.requireReadableVersion(principal, match[1]);
        const file = await content.getFile(principal, version.id, match[2]);
        if (file.bytes.byteLength > 128000) throw new AiError('AI_BUDGET_EXCEEDED', '资源内容过大');
        signal.throwIfAborted();
        return {
          id: reference,
          version: version.id,
          digest: version.content_digest,
          title: match[2],
          text: new TextDecoder('utf-8', { fatal: true }).decode(file.bytes),
        };
      },
    };
    this.runtime = new AiRuntime(
      aiStore,
      new HubAiQueue(store, jobs),
      createHubAgentRegistry(evidence, publications),
      {
        authorization,
        resources,
        credentials: {
          resolve: (reference) => {
            const value = process.env[reference];
            if (!value) throw new AiError('AI_CONFIGURATION', '模型凭据环境变量未配置');
            return Promise.resolve(value);
          },
        },
        ...(config.aiExchangeRetentionDays > 0 && {
          exchanges: { subject: (execution) => this.exchangeSubject(execution) },
        }),
      },
      config.ai,
    );
  }
  /** 队列执行的往返原文以业务目标版本为主体，删除未发布版本时据此清理。 */
  private async exchangeSubject(execution: ExecutionRecord) {
    if (!businessOperations.has(execution.payload.operation_id)) return '';
    const input = execution.payload.input;
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    if (execution.payload.operation_id === 'publication-review')
      return typeof input.publication_request_id === 'string'
        ? ((await this.store.get('requests', input.publication_request_id))?.version_id ?? null)
        : null;
    return typeof input.version_id === 'string' && input.version_id ? input.version_id : null;
  }

  /**
   * 内联原文要求所有引用版本的分发读权；开场提示还要复核生成时的两层发布受众与策略来源。
   * 队列原文的业务引用已由执行级授权覆盖。
   */
  async canReadExchange(
    principal: Principal,
    resourceRefs: readonly string[],
    execution: ExecutionRecord,
  ) {
    const catalogPrompts = execution.payload.operation_id === 'catalog-prompts';
    if (catalogPrompts && !resourceRefs.length) return false;
    try {
      for (const ref of resourceRefs) {
        if (!catalogPrompts) {
          await this.access.requireReadableVersion(principal, ref);
          continue;
        }
        const [kind, versionId, releaseId, resolvedId, extra] = ref.split(':');
        if (
          kind !== 'catalog-release' ||
          !versionId ||
          !releaseId ||
          !resolvedId ||
          extra !== undefined
        )
          return false;
        const version = await this.access.requireReadableVersion(principal, versionId);
        for (const id of releaseId === resolvedId ? [releaseId] : [releaseId, resolvedId]) {
          const release = await this.store.get('releases', id);
          if (
            !release ||
            release.asset_id !== version.asset_id ||
            release.version_id !== version.id ||
            !(await this.access.matchesAudience(principal, release))
          )
            return false;
        }
      }
      return true;
    } catch (error) {
      if (isUnavailableResource(error)) return false;
      throw error;
    }
  }

  /** 读取时即执行留存期限，不依赖 Worker 的删除进度。 */
  async retainedExchangeRefs(executionId: string, callId?: string) {
    if (!this.exchangeRetentionDays) return [];
    const cutoff = Date.now() - this.exchangeRetentionDays * 86_400_000;
    return this.runtime.store.listExchangeRefs(executionId, callId, cutoff);
  }

  /** 每轮只删一批；有积压时下轮继续，已清空才冷却十分钟。 */
  async purgeExchanges(now = Date.now()) {
    if (now - this.lastExchangePurge < 600_000) return 0;
    this.lastExchangePurge = now;
    const removed = await purgeAiExchanges(this.store, this.exchangeRetentionDays, now);
    if (removed === exchangePurgeBatchSize) this.lastExchangePurge = 0;
    return removed;
  }
  private async recheckResources(
    principal: Principal,
    execution: ExecutionRecord,
    mode: ResourceAccessMode = 'execute',
  ) {
    const reason = await this.checkResources(principal, execution, mode);
    if (reason) throw new AiError('AI_FORBIDDEN', reason);
  }

  async consolePrincipal(principal: Principal) {
    const fresh = await this.identity.principal(principal.id);
    requireAiConsole(fresh);
    return fresh;
  }

  async submissionPrincipal(principal: Principal, operationId: string) {
    const fresh = await this.principal(principal);
    if (!businessOperations.has(operationId)) requireAiConsole(fresh, true);
    if (this.runtime.registry.get(operationId).execution_mode === 'inline')
      throw new AiError('AI_FORBIDDEN', '此 Agent 仅由业务流程触发');
    return fresh;
  }

  async catalog(principal: Principal, includeInline: boolean) {
    const fresh = await this.consolePrincipal(principal);
    const catalog = this.runtime.catalog();
    const platform = has(fresh, 'ai:execute');
    const scoped = hasInAnyScope(fresh, 'ai:execute');
    catalog.operations = catalog.operations.filter((item) =>
      item.execution_mode === 'inline'
        ? includeInline
        : platform || (scoped && businessOperations.has(item.id)),
    );
    return catalog;
  }

  async modelOptions(principal: Principal) {
    await this.principal(principal);
    const { default_profile, profiles } = this.runtime.config;
    return { default_profile, profiles: profiles.map(({ id, label }) => ({ id, label })) };
  }

  async ensurePublicationReview(principal: Principal, requestId: string) {
    // 查找与入队共享写事务，避免并发打开时创建多份首报。
    return this.runtime.store.tx(async () => {
      await this.publications.requireAgentAccess(principal, requestId, 'execute');
      const existing = await this.latestOwnedExecution(
        principal.id,
        'publication-review',
        'publication_request_id',
        requestId,
      );
      return (
        existing ??
        this.runtime.submit(principal.id, 'publication-review', {
          publication_request_id: requestId,
        })
      );
    });
  }

  async ensureResourceAudit(principal: Principal, versionId: string) {
    return this.runtime.store.tx(async () => {
      const fresh = await this.principal(principal);
      const existing = await this.latestOwnedExecution(
        fresh.id,
        'resource-audit',
        'version_id',
        versionId,
        async (row) => {
          try {
            return !(await this.checkResources(fresh, row, 'audit-write'));
          } catch (error) {
            if (isUnavailableResource(error))
              throw new AiError('AI_FORBIDDEN', '执行引用的业务资源不可访问');
            throw error;
          }
        },
      );
      return existing ?? this.runtime.submit(fresh.id, 'resource-audit', { version_id: versionId });
    });
  }

  private async latestOwnedExecution(
    ownerId: string,
    operation: 'publication-review' | 'resource-audit',
    key: 'publication_request_id' | 'version_id',
    id: string,
    canReuse?: (row: ExecutionRecord) => Promise<boolean>,
  ) {
    let after: { position: number; id: string } | undefined;
    for (;;) {
      const rows = await this.runtime.store.list('ai_executions', {
        owner_id: ownerId,
        lookup_key: operation,
        descending: true,
        after,
        limit: 100,
      });
      for (const row of rows) {
        const input = row.payload.input;
        if (
          input &&
          typeof input === 'object' &&
          !Array.isArray(input) &&
          input[key] === id &&
          (!canReuse || (await canReuse(row)))
        )
          return row;
      }
      if (rows.length < 100) return;
      const last = rows[rows.length - 1];
      after = { position: last.position, id: last.id };
    }
  }

  private async hasPendingSubmission(ownerId: string, versionId: string) {
    const requests = await this.store.where('requests', 'version_id', versionId);
    return requests.some(
      (request) => request.state === 'pending' && request.submitted_by === ownerId,
    );
  }

  async autoTriage(version: VersionRecord, feedbackId: string) {
    if (!this.runtime.config.profiles.length) return;
    await this.runtime.store.tx(async () => {
      const intake = await this.store.get('intakes', version.intake_id);
      const submitFor = (id: string) =>
        this.autoSubmit(id, 'feedback-triage', version.id, feedbackId);
      if (intake && (await submitFor(intake.requested_by))) return;
      const asset = await this.access.getAsset(version.asset_id);
      const candidates = await this.identity.userIdsWithPermission(
        'asset:maintain',
        this.access.assetContext(asset),
      );
      for (const id of candidates) if (id !== intake?.requested_by && (await submitFor(id))) return;
    });
  }

  async autoSubmit(
    principal: Principal | string,
    operation: 'resource-audit' | 'feedback-triage',
    versionId: string,
    feedbackId?: string,
  ) {
    if (!this.runtime.config.profiles.length) return false;
    return this.runtime.store.tx(async () => {
      const ownerId = typeof principal === 'string' ? principal : principal.id;
      try {
        await this.identity.activeUser(ownerId);
      } catch (error) {
        if (error instanceof HubError && [401, 403, 404].includes(error.status)) return false;
        throw error;
      }
      const fresh = await this.identity.principal(ownerId);
      if (!hasInAnyScope(fresh, 'ai:execute')) return false;
      // 先检查可选业务权限，避免在嵌套提交事务失败后吞掉异常却污染外层事务。
      try {
        const { asset } = await this.evidence.version(fresh.id, versionId, false);
        if (!has(fresh, 'ai:execute', this.access.assetContext(asset))) return false;
        if (operation === 'feedback-triage' && !this.access.canMaintain(fresh, asset)) return false;
      } catch (error) {
        if (error instanceof HubError && [403, 404, 409].includes(error.status)) return false;
        throw error;
      }
      if (operation === 'resource-audit' && (await this.hasPendingSubmission(ownerId, versionId)))
        return false;
      // 上传与重扫共享同一固定版本的任务；自动触发不重试失败任务。
      const sharedKey =
        operation === 'feedback-triage' && feedbackId ? automaticTriageKey(feedbackId) : undefined;
      let after: { position: number; id: string } | undefined;
      for (;;) {
        const page = await this.runtime.store.list('ai_executions', {
          owner_id: sharedKey ? undefined : fresh.id,
          lookup_key: sharedKey ?? operation,
          after,
          limit: 100,
        });
        if (
          page.some((item) => {
            const input = item.payload.input;
            return (
              input &&
              typeof input === 'object' &&
              !Array.isArray(input) &&
              input.version_id === versionId &&
              input.feedback_id === feedbackId
            );
          })
        )
          return true;
        if (page.length < 100) break;
        const last = page[page.length - 1];
        after = { position: last.position, id: last.id };
      }
      const execution = await this.runtime.submit(fresh.id, operation, {
        version_id: versionId,
        ...(feedbackId ? { feedback_id: feedbackId } : {}),
      });
      if (sharedKey)
        await this.runtime.store.put('ai_executions', { ...execution, lookup_key: sharedKey });
      return true;
    });
  }

  private async canReadSharedTriage(
    principal: Principal,
    row: ExecutionRecord,
    versionId?: string,
  ) {
    const input = row.payload.input;
    // 仅自动分派写入共享键。手动研判即使针对相同反馈，也保持个人任务的可见范围。
    if (
      row.payload.operation_id !== 'feedback-triage' ||
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      typeof input.feedback_id !== 'string' ||
      row.lookup_key !== automaticTriageKey(input.feedback_id) ||
      (versionId && versionId !== input.version_id)
    )
      return false;
    try {
      await this.recheckResources(principal, row, 'shared-feedback');
      return true;
    } catch (error) {
      if (error instanceof HubError && [403, 404, 409].includes(error.status)) return false;
      if (error instanceof AiError && ['AI_FORBIDDEN', 'AI_NOT_FOUND'].includes(error.code))
        return false;
      throw error;
    }
  }

  async sharedTriage(principal: Principal, feedbackId: string, versionId?: string) {
    return this.runtime.store.tx(async () => {
      const fresh = await this.identity.principal(principal.id);
      const [row] = await this.runtime.store.list('ai_executions', {
        lookup_key: automaticTriageKey(feedbackId),
        limit: 1,
      });
      if (row && (await this.canReadSharedTriage(fresh, row, versionId))) {
        const owner = await this.store.get('users', row.owner_id);
        return { execution: row, ownerName: owner?.display_name ?? row.owner_id };
      }
    });
  }

  async principal(principal: Principal, execution?: ExecutionRecord, inspect = false) {
    const fresh = await this.identity.principal(principal.id);
    if (!hasInAnyScope(fresh, 'ai:execute') && !(inspect && has(fresh, 'ai:inspect')))
      throw new AiError('AI_FORBIDDEN', '当前账号无权访问 AI 任务');
    if (execution && execution.owner_id !== fresh.id && !(inspect && has(fresh, 'ai:inspect'))) {
      if (inspect && (await this.canReadSharedTriage(fresh, execution))) return fresh;
      throw new AiError('AI_NOT_FOUND', 'AI 执行不存在');
    }
    try {
      if (execution) await this.recheckResources(fresh, execution, inspect ? 'inspect' : 'execute');
    } catch (error) {
      if (error instanceof HubError)
        throw new AiError('AI_FORBIDDEN', '执行引用的业务资源不可访问');
      throw error;
    }
    return fresh;
  }
}
