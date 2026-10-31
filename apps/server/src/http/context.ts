import type { HubServices } from '../bootstrap/hub-services.js';
import type { SourceService } from '@capability-hub/application';
import type { RequestMetrics } from '../observability/operations.js';
import type { HttpSecurity } from './security/http-security.js';
/** 路由共用当前实例的服务，不单独创建存储或 Worker。 */
export interface HttpContext {
  readonly hub: HubServices;
  readonly metrics: RequestMetrics;
  readonly sources: SourceService;
  readonly security: HttpSecurity;
}
