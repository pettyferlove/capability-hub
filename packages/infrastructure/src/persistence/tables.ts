import type { TableName } from '@capability-hub/domain/models';

/**
 * 通用记录表的完整清单（按依赖顺序：被引用的表在前），用于整库遍历、备份与恢复。
 * `hub_revision` 不在其中——它是单行计数器而非记录表；AI 表另由 `aiTables` 提供。
 */
export const tables = [
  'users',
  'groups',
  'memberships',
  'roles',
  'role_bindings',
  'sources',
  'assets',
  'bindings',
  'intakes',
  'versions',
  'scans',
  'requests',
  'releases',
  'jobs',
  'audit',
  'sessions',
  'tokens',
  'oauth_clients',
  'oauth_grants',
  'oauth_requests',
  'oauth_credentials',
  'git_credentials',
  'idempotency',
  'login_attempts',
  'cli_logins',
  'scenarios',
  'recommendations',
  'asset_feedback',
] as const satisfies readonly TableName[];
