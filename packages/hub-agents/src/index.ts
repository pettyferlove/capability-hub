import { OperationRegistry } from '@capability-hub/ai';
import type { AgentEvidenceService } from '@capability-hub/application';
import { registerBusinessOperations } from './business/operations.js';
import { registerAgentLab } from './examples/agent-lab.js';
import { registerAssistant } from './examples/assistant.js';

/**
 * 组装 hub 的 AI 操作注册表。`assistant` 与 `agent-lab` 始终注册；资源审计与反馈研判只在传入
 * `evidence` 时注册，缺省即从目录中彻底消失（而不是运行期才失败）。返回的注册表由调用方持有，
 * 注册时就会校验操作 ID 与定义摘要，重复或非法 ID 会抛 `AiError`。
 */
export function createHubAgentRegistry(evidence?: AgentEvidenceService) {
  const registry = new OperationRegistry();
  registerAssistant(registry);
  registerAgentLab(registry);
  if (evidence) registerBusinessOperations(registry, evidence);
  return registry;
}
