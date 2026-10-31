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
  ) {
    const aiStore = createAiStore(store);
    this.recheckResources = async (principal, execution) => {
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
      createHubAgentRegistry(),
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
  async principal(principal: Principal, execution?: ExecutionRecord, inspect = false) {
    const fresh = await this.identity.principal(principal.id);
    if (!has(fresh, 'ai:execute') && !(inspect && has(fresh, 'ai:inspect')))
      throw new AiError('AI_FORBIDDEN', '当前账号无权访问 AI 工作台');
    if (execution && execution.owner_id !== fresh.id && !(inspect && has(fresh, 'ai:inspect')))
      throw new AiError('AI_NOT_FOUND', 'AI 执行不存在');
    if (execution) await this.recheckResources(fresh, execution);
    return fresh;
  }
}
