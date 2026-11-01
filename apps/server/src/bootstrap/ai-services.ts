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
import { has } from '@capability-hub/domain/rbac';
import { HubError } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import type { ServerConfig } from '../config/server-config.js';

export class HubAiServices {
  readonly runtime: AiRuntime;
  private readonly recheckResources: (
    principal: Principal,
    execution: ExecutionRecord,
  ) => Promise<void>;
  constructor(
    private readonly identity: IdentityService,
    store: RecordStore,
    jobs: JobQueue,
    access: AssetAccessService,
    content: AssetContentService,
    config: ServerConfig,
    private readonly evidence: AgentEvidenceService,
  ) {
    const aiStore = createAiStore(store);
    this.recheckResources = async (principal, execution) => {
      if (['resource-audit', 'feedback-triage'].includes(execution.payload.operation_id)) {
        const input = execution.payload.input;
        if (
          !input ||
          typeof input !== 'object' ||
          Array.isArray(input) ||
          typeof input.version_id !== 'string'
        )
          throw new AiError('AI_CONFIGURATION', '业务目标不完整');
        await evidence.version(principal.id, input.version_id);
        if (execution.payload.operation_id === 'feedback-triage') {
          if (typeof input.feedback_id !== 'string')
            throw new AiError('AI_CONFIGURATION', '反馈目标不完整');
          const feedback = await evidence.feedbackTarget(principal.id, input.feedback_id);
          if (feedback.version_id !== input.version_id)
            throw new AiError('AI_CONFLICT', '反馈与资源版本不匹配');
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
          if (!has(principal, 'ai:execute') || (execution && execution.owner_id !== ownerId))
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
  async autoSubmit(
    principal: Principal | string,
    operation: 'resource-audit' | 'feedback-triage',
    versionId: string,
    feedbackId?: string,
  ) {
    if (!this.runtime.config.profiles.length) return;
    await this.runtime.store.tx(async () => {
      const ownerId = typeof principal === 'string' ? principal : principal.id;
      try {
        await this.identity.activeUser(ownerId);
      } catch (error) {
        if (error instanceof HubError && [401, 403, 404].includes(error.status)) return;
        throw error;
      }
      const fresh = await this.identity.principal(ownerId);
      if (!has(fresh, 'ai:execute')) return;
      // 先检查可选业务权限，避免在嵌套提交事务失败后吞掉异常却污染外层事务。
      try {
        await this.evidence.version(fresh.id, versionId);
      } catch (error) {
        if (error instanceof HubError && [403, 404, 409].includes(error.status)) return;
        throw error;
      }
      // 上传、重扫及发布申请共享同一固定版本的任务；自动触发不重试失败任务。
      let after: { position: number; id: string } | undefined;
      for (;;) {
        const page = await this.runtime.store.list('ai_executions', {
          owner_id: fresh.id,
          lookup_key: operation,
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
          return;
        if (page.length < 100) break;
        const last = page[page.length - 1];
        after = { position: last.position, id: last.id };
      }
      await this.runtime.submit(fresh.id, operation, {
        version_id: versionId,
        ...(feedbackId ? { feedback_id: feedbackId } : {}),
      });
    });
  }

  async principal(principal: Principal, execution?: ExecutionRecord, inspect = false) {
    const fresh = await this.identity.principal(principal.id);
    if (!has(fresh, 'ai:execute') && !(inspect && has(fresh, 'ai:inspect')))
      throw new AiError('AI_FORBIDDEN', '当前账号无权访问 AI 工作台');
    if (execution && execution.owner_id !== fresh.id && !(inspect && has(fresh, 'ai:inspect')))
      throw new AiError('AI_NOT_FOUND', 'AI 执行不存在');
    try {
      if (execution) await this.recheckResources(fresh, execution);
    } catch (error) {
      if (error instanceof HubError)
        throw new AiError('AI_FORBIDDEN', '执行引用的业务资源不可访问');
      throw error;
    }
    return fresh;
  }
}
