import type { TokenUsageBucket } from '@capability-hub/ai/ports';
import type { TokenUsagePeriod, TokenUsageResponse } from '@capability-hub/contracts';
import type { HubServices } from '../bootstrap/hub-services.js';

type Metrics = TokenUsageResponse['totals'];
const dayMs = 86_400_000;
const beijingOffset = 8 * 3_600_000;

function empty(): Metrics {
  return {
    requests: 0,
    input_tokens: 0,
    output_tokens: 0,
    unknown_requests: 0,
    pending_requests: 0,
    partial_input_tokens: 0,
    partial_output_tokens: 0,
  };
}

function accumulate(target: Metrics, row: TokenUsageBucket) {
  target.requests += row.requests;
  if (row.status === 'succeeded') {
    target.input_tokens += row.input_tokens;
    target.output_tokens += row.output_tokens;
  } else if (row.status === 'pending') {
    target.pending_requests += row.requests;
  } else {
    target.unknown_requests += row.requests;
    target.partial_input_tokens += row.input_tokens;
    target.partial_output_tokens += row.output_tokens;
  }
}

function addGroup(groups: Map<string, Metrics>, key: string, row: TokenUsageBucket) {
  const metrics = groups.get(key) ?? empty();
  accumulate(metrics, row);
  groups.set(key, metrics);
}

function distribution(groups: Map<string, Metrics>, names: Map<string, string>) {
  return Array.from(groups, ([id, usage]) => ({ id, label: names.get(id) ?? id, ...usage })).sort(
    (a, b) =>
      b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens) ||
      b.requests - a.requests ||
      a.id.localeCompare(b.id, 'en'),
  );
}

function trend(groups: Map<string, Metrics>, from: number | null, today: string) {
  const first =
    from === null
      ? [...groups.keys()].sort()[0]
      : new Date(from + beijingOffset).toISOString().slice(0, 10);
  const result: TokenUsageResponse['trend'] = [];
  if (!first) return result;
  const cursor = new Date((from === null ? first + '-01' : first) + 'T00:00:00Z');
  const last = Date.parse(today + 'T00:00:00Z');
  while (cursor.getTime() <= last) {
    const bucket = cursor.toISOString().slice(0, from === null ? 7 : 10);
    result.push({ bucket, ...(groups.get(bucket) ?? empty()) });
    if (from === null) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

/** 每个维度从同一批调用分别累计，跨日继续的执行按各次请求的开始时间归属。 */
export async function tokenUsage(
  hub: HubServices,
  period: TokenUsagePeriod,
): Promise<TokenUsageResponse> {
  const observedAt = new Date();
  const today = new Date(observedAt.getTime() + beijingOffset).toISOString().slice(0, 10);
  const days = { today: 1, '7d': 7, '30d': 30 } as const;
  const from =
    period === 'all' ? null : Date.parse(today + 'T00:00:00+08:00') - (days[period] - 1) * dayMs;
  const start = from === null ? null : new Date(from).toISOString();
  const granularity = period === 'all' ? 'month' : 'day';
  const runtime = hub.ai.runtime;
  const rows = await runtime.store.summarizeTokenUsage(
    start,
    observedAt.toISOString(),
    granularity,
  );
  const totals = empty();
  const dates = new Map<string, Metrics>();
  const agents = new Map<string, Metrics>();
  const profiles = new Map<string, Metrics>();
  const users = new Map<string, Metrics>();
  const ownerNames = new Map<string, string>();
  for (const row of rows) {
    accumulate(totals, row);
    addGroup(dates, row.bucket, row);
    addGroup(agents, row.operation_id, row);
    addGroup(profiles, row.profile, row);
    addGroup(users, row.owner_id, row);
    if (row.owner_label) ownerNames.set(row.owner_id, row.owner_label);
  }
  const catalog = runtime.catalog();
  return {
    period,
    from: start,
    observed_at: observedAt.toISOString(),
    granularity,
    totals,
    trend: trend(dates, from, today),
    by_agent: distribution(
      agents,
      new Map(catalog.operations.map((agent) => [agent.id, agent.title])),
    ),
    by_profile: distribution(
      profiles,
      new Map(catalog.profiles.map((profile) => [profile.id, profile.label])),
    ),
    by_user: distribution(users, ownerNames),
  };
}
