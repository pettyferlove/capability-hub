import type { AuditCategory } from '@capability-hub/domain/audit';
export interface AuditLogQuery {
  q?: string;
  category?: 'all' | AuditCategory;
  result?: 'all' | 'success' | 'failure';
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}
