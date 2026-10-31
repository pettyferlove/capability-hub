import { clientIcons } from './client-icons.js';
import {
  agentClientIds,
  agentClients,
  agentClientSchema,
  type AgentClient,
} from '@capability-hub/contracts';
import { SelectField } from './SelectField.js';

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
