import { clientIcons } from './client-icons.js';
import {
  agentClientIds,
  agentClients,
  agentClientSchema,
  type AgentClient,
} from '@capability-hub/contracts';
import { SelectField } from './SelectField.js';

/**
 * 选择目标 Agent 客户端；选项与图标来自 contracts 里的 `agentClients`，新增客户端只需改契约表。
 * 回传值已经过 `agentClientSchema` 校验，调用方拿到的一定是合法 id，不必再兜底。
 */
export function AgentClientSelect({
  value,
  onChange,
}: {
  value: AgentClient;
  onChange: (value: AgentClient) => void;
}) {
  return (
    <label>
      Agent 客户端
      <SelectField
        optionIcons={clientIcons}
        value={value}
        onValueChange={(next) => onChange(agentClientSchema.parse(next))}
      >
        {agentClientIds.map((id) => (
          <option key={id} value={id}>
            {agentClients[id].label}
          </option>
        ))}
      </SelectField>
    </label>
  );
}
