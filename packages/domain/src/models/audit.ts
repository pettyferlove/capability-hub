import type { AuditActorSnapshot, AuditSubjectSnapshot } from '../audit.js';
import type { IsoDateTime } from './base.js';

export interface AuditRecord {
  id: string;
  occurred_at: IsoDateTime;
  actor_id: string;
  action: string;
  entity_id: string;
  result: 'success' | 'failure';
  reason: string;
  metadata: Record<string, unknown>;
  actor?: AuditActorSnapshot;
  subject?: AuditSubjectSnapshot;
}
