import type { EpochMilliseconds, IsoDateTime } from './base.js';
import type { IntakeState } from './intake.js';

export interface JobInputMap {
  ai_execution: { execution_id: string };
  intake: Record<string, never>;
  rescan: { version_id: string };
  source_sync: { requested_by: string; source_revision: number };
}

export type JobKind = keyof JobInputMap;

export interface SyncTargetResult {
  id: string;
  binding_id: string;
  intake_id: string;
  state: IntakeState;
  version_id?: string | null;
  error_code?: string | null;
  reused?: boolean;
}

interface JobBase {
  id: string;
  aggregate_id: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  attempt: number;
  run_after: EpochMilliseconds;
  lease_epoch: number;
  lease_until: EpochMilliseconds;
  lease_owner?: string;
  cancel_requested: boolean;
  created_at: IsoDateTime;
  finished_at?: IsoDateTime;
  last_error_code?: string;
  error_message?: string;
  result?: { origin_commit: string; source_revision?: number; targets: SyncTargetResult[] };
}

export type JobRecord = {
  [K in JobKind]: JobBase & { kind: K; input: JobInputMap[K] };
}[JobKind];
