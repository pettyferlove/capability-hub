import { OperationRegistry } from '@capability-hub/ai';
import type { AgentEvidenceService, PublicationQueryService } from '@capability-hub/application';
import {
  catalogDiscoveryOperation,
  catalogPromptsOperation,
} from './business/catalog-discovery.js';
import { registerBusinessOperations } from './business/operations.js';
import { registerPublicationReview } from './business/publication-review.js';
import { registerAgentLab } from './examples/agent-lab.js';
import { registerAssistant } from './examples/assistant.js';

export * from './business/catalog-discovery.js';

/**
 * 首页操作无需证据服务；面向具体资源和发布申请的操作由宿主在依赖就绪后注册。
 */
export function createHubAgentRegistry(
  evidence?: AgentEvidenceService,
  publications?: PublicationQueryService,
) {
  const registry = new OperationRegistry();
  registerAssistant(registry);
  registerAgentLab(registry);
  registry.register(catalogDiscoveryOperation);
  registry.register(catalogPromptsOperation);
  if (evidence) registerBusinessOperations(registry, evidence);
  if (evidence && publications) registerPublicationReview(registry, evidence, publications);
  return registry;
}
