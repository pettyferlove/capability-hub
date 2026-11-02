import type { PublicationDraftPolicy } from '@capability-hub/contracts';
import type { ScenarioResponse } from '@capability-hub/contracts/http';
import { useQuery } from '../api/use-query.js';
import { subtleStyles } from '../styles/recipes.js';

/** 已登记场景按 ID 显示，申请中新定义的名称和说明取自冻结快照。 */
export function ScenarioSummary({
  policy,
}: {
  policy: Pick<PublicationDraftPolicy, 'scenario_ids' | 'proposed_scenarios'>;
}) {
  const { data } = useQuery<ScenarioResponse[]>(
    policy.scenario_ids.length ? '/api/scenarios' : null,
  );
  return (
    <ul aria-label="适用场景" className="grid gap-2 break-words">
      {policy.scenario_ids.map((id) => (
        <li key={id}>{data?.find((s) => s.id === id)?.name ?? id}</li>
      ))}
      {policy.proposed_scenarios?.map((item) => (
        <li key={item.name}>
          <strong>{item.name}</strong>
          <small className="ml-2 text-muted-ink">本次提出</small>
          <p className={subtleStyles}>{item.description}</p>
        </li>
      ))}
    </ul>
  );
}
