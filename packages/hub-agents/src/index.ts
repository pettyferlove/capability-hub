import { OperationRegistry } from '@capability-hub/ai';
import type { AgentEvidenceService, PublicationQueryService } from '@capability-hub/application';
import { registerBusinessOperations } from './business/operations.js';
import { registerPublicationReview } from './business/publication-review.js';
import { registerAgentLab } from './examples/agent-lab.js';
import { registerAssistant } from './examples/assistant.js';

/**
 * 基础助手与协作演示始终注册。业务操作要求版本证据服务，审核助手还须有申请查询服务。
 */
export function createHubAgentRegistry(
  evidence?: AgentEvidenceService,
  publications?: PublicationQueryService,
) {
  const registry = new OperationRegistry();
  registerAssistant(registry);
  registerAgentLab(registry);
  if (evidence) registerBusinessOperations(registry, evidence);
  if (evidence && publications) registerPublicationReview(registry, evidence, publications);
  return registry;
}
