import {
  AiError,
  AiRuntime,
  type AiAuthorization,
  type ExecutionRecord,
  type ResourceResolver,
} from '@capability-hub/ai';
import { createHubAgentRegistry } from '@capability-hub/hub-agents';
import { createAiStore, HubAiQueue } from '@capability-hub/infrastructure/ai';
import type {
  IdentityService,
  JobQueue,
  AssetContentService,
  AssetAccessService,
  AgentEvidenceService,
} from '@capability-hub/application';
import type { RecordStore } from '@capability-hub/application/ports';
import { has, hasInAnyScope } from '@capability-hub/domain/rbac';
import { HubError } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type { VersionRecord } from '@capability-hub/domain/models';
import type { ServerConfig } from '../config/server-config.js';

const businessOperations = new Set(['resource-audit', 'feedback-triage']);

function automaticTriageKey(feedbackId: string) {
  return `feedback-triage:auto:${feedbackId}`;
}

/**
 * 服务端 AI 装配：用身份、作业队列、资产访问与证据服务构造 {@link AiRuntime}，
 * 并在每次访问前重查账号状态与执行引用的业务资源——失去权限或资源不可访问即抛
 * `AiError('AI_FORBIDDEN')`，因此停用账号的会话不会读到历史执行。
 */
export class HubAiServices {
  readonly runtime: AiRuntime;
  private readonly recheckResources: (
    principal: Principal,
    execution: ExecutionRecord,
    mode?: 'execute' | 'inspect' | 'shared-feedback',
  ) => Promise<void>;
  constructor(
    private readonly identity: IdentityService,
    private readonly store: RecordStore,
    jobs: JobQueue,
    private readonly access: AssetAccessService,
    content: AssetContentService,
    config: ServerConfig,
    private readonly evidence: AgentEvidenceService,
  ) {
    const aiStore = createAiStore(store);
    this.recheckResources = async (principal, execution, mode = 'execute') => {
      let scope: ReturnType<AssetAccessService['assetContext']> | undefined;
      if (businessOperations.has(execution.payload.operation_id)) {
        const input = execution.payload.input;
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          typeof input.version_id !== 'string'
        )
          throw new AiError('AI_CONFIGURATION', '业务目标不完整');
        const { asset } = await evidence.version(principal.id, input.version_id, false);
        scope = access.assetContext(asset);
        if (execution.payload.operation_id === 'feedback-triage') {
          if (typeof input.feedback_id !== 'string')
            throw new AiError('AI_CONFIGURATION', '反馈目标不完整');
          const feedback = await evidence.feedbackTarget(principal.id, input.feedback_id, false);
          if (feedback.version_id !== input.version_id)
            throw new AiError('AI_CONFLICT', '反馈与资源版本不匹配');
          if (mode === 'shared-feedback' && !feedback.can_manage)
            throw new AiError('AI_FORBIDDEN', '无权查看该反馈的共享研判');
        }
      }
      if (
        !has(principal, 'ai:execute', scope) &&
        !(mode === 'inspect' && has(principal, 'ai:inspect'))
      )
        throw new AiError('AI_FORBIDDEN', '当前账号无权在此范围执行 AI 操作');
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
          if (error instanceof HubError)
            throw new AiError('AI_FORBIDDEN', '执行引用的资源权限已变化');
          throw error;
        }
      }
    };
    const authorization: AiAuthorization = {
      authorize: async (ownerId, action, execution) => {
        try {
          const principal = await identity.principal(ownerId);
          if (
            !hasInAnyScope(principal, 'ai:execute') ||
            (execution && execution.owner_id !== ownerId)
          )
            throw new AiError('AI_FORBIDDEN', '当前账号无权执行 AI 操作');
          if (action === 'respond' && execution && execution.owner_id !== principal.id)
            throw new AiError('AI_FORBIDDEN', '只能回答自己的交互');
          if (execution) await this.recheckResources(principal, execution);
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
      createHubAgentRegistry(evidence),
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
      },
      config.ai,
    );
  }
  async catalog(principal: Principal) {
    const fresh = await this.principal(principal);
    const catalog = this.runtime.catalog();
    if (!has(fresh, 'ai:execute'))
      catalog.operations = catalog.operations.filter((item) => businessOperations.has(item.id));
    return catalog;
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
      // 上传、重扫及发布申请共享同一固定版本的任务；自动触发不重试失败任务。
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
      throw new AiError('AI_FORBIDDEN', '当前账号无权访问 AI 工作台');
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
