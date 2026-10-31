import type { AuditActorSnapshot, AuditCategory, AuditSubjectSnapshot } from '../audit.js';

export interface AuditEventResponse {
  id: string;
  occurred_at: string;
  action: string;
  action_label: string;
  category: AuditCategory;
  result: 'success' | 'failure';
  recorded_result: 'success' | 'failure';
  actor: AuditActorSnapshot & {
    id: string;
    name_source: 'event' | 'current' | 'unavailable';
    avatar_color?: string;
  };
  subject: AuditSubjectSnapshot & {
    id: string;
    name_source: 'event' | 'current' | 'unavailable';
    href: string | null;
  };
  reason: string;
  changes: { label: string; before: string; after: string }[];
  facts: { label: string; value: string }[];
}

export interface AuditLogResponse {
  items: AuditEventResponse[];
  total: number;
  page: number;
  page_size: number;
  summary: { failures: number; identity: number; publication: number; downloads: number };
}
