import { OperationRegistry } from '@capability-hub/ai';
import type { AgentEvidenceService } from '@capability-hub/application';
import { registerBusinessOperations } from './business/operations.js';
import { registerAgentLab } from './examples/agent-lab.js';
import { registerAssistant } from './examples/assistant.js';

export function createHubAgentRegistry(evidence?: AgentEvidenceService) {
  const registry = new OperationRegistry();
  registerAssistant(registry);
  registerAgentLab(registry);
  if (evidence) registerBusinessOperations(registry, evidence);
  return registry;
}
