import type { Finding } from '../content.js';
import type { IsoDateTime } from './base.js';

export type IntakeState = 'received' | 'fetching' | 'scanning' | 'ready' | 'failed' | 'cancelled';

export interface IntakeProgress {
  step: 'received' | 'fetching' | 'scanning' | 'snapshot';
  started_at: IsoDateTime;
}

export interface IntakeRecord {
  id: string;
  source_id: string;
  asset_id: string;
  requested_by: string;
  version_label: string;
  source_revision: number;
  state: IntakeState;
  phase: string;
  progress: IntakeProgress[];
  created_at: IsoDateTime;
  payload_ref?: string;
  filename?: string;
  keywords?: string[];
  binding_id?: string | null;
  source_sync_job_id?: string;
  source_generation?: number | null;
  origin_ref?: string;
  origin_commit?: string;
  origin_path?: string;
  version_id?: string | null;
  content_digest?: string | null;
  scan_run_id?: string | null;
  processing_ruleset?: string;
  finished_at?: IsoDateTime | null;
  rescan_of?: string;
  historical?: boolean;
  error_code?: string | null;
  error_message?: string | null;
  retryable?: boolean;
}

export interface ScanRecord {
  id: string;
  version_id: string;
  ruleset_version: string;
  scanner_version: string;
  state: 'passed' | 'blocked';
  findings: Finding[];
  finished_at: IsoDateTime;
}
