import type { RecordMap } from '@capability-hub/domain/models';
import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  jsonb,
  bigint,
  check,
  unique,
  index,
  uniqueIndex,
  foreignKey,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';

export const hub_revision = pgTable(
  'hub_revision',
  {
    id: integer('id').primaryKey(),
    revision: bigint('revision', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
  },
  (_t): PgTableExtraConfigValue[] => [check('hub_revision_id_check', sql`id = 1`)],
);

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['users']>().notNull(),
    username: text('username')
      .generatedAlwaysAs(sql`(data ->> 'username')`)
      .notNull()
      .unique(),
  },
  (_t): PgTableExtraConfigValue[] => [
    check(
      'users_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
  ],
);

export const groups = pgTable(
  'groups',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['groups']>().notNull(),
    name: text('name')
      .generatedAlwaysAs(sql`(data ->> 'name')`)
      .notNull()
      .unique(),
  },
  (_t): PgTableExtraConfigValue[] => [
    check(
      'groups_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['memberships']>().notNull(),
    user_id: text('user_id').generatedAlwaysAs(sql`(data ->> 'user_id')`),
    group_id: text('group_id').generatedAlwaysAs(sql`(data ->> 'group_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'memberships_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    unique().on(t.user_id, t.group_id),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
    foreignKey({ columns: [t.group_id], foreignColumns: [groups.id] }),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['roles']>().notNull(),
    name: text('name')
      .generatedAlwaysAs(sql`(data ->> 'name')`)
      .notNull()
      .unique(),
  },
  (_t): PgTableExtraConfigValue[] => [
    check(
      'roles_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
  ],
);

export const role_bindings = pgTable(
  'role_bindings',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['role_bindings']>().notNull(),
    principal_id: text('principal_id')
      .generatedAlwaysAs(sql`(data ->> 'principal_id')`)
      .notNull(),
    role_id: text('role_id').generatedAlwaysAs(sql`(data ->> 'role_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'role_bindings_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    foreignKey({ columns: [t.role_id], foreignColumns: [roles.id] }),
  ],
);

export const sources = pgTable(
  'sources',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['sources']>().notNull(),
    owner_group_id: text('owner_group_id').generatedAlwaysAs(sql`(data ->> 'owner_group_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'sources_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    foreignKey({ columns: [t.owner_group_id], foreignColumns: [groups.id] }),
  ],
);

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['assets']>().notNull(),
    slug: text('slug')
      .generatedAlwaysAs(sql`(data ->> 'slug')`)
      .notNull()
      .unique(),
    source_id: text('source_id').generatedAlwaysAs(sql`(data ->> 'source_id')`),
    owner_group_id: text('owner_group_id').generatedAlwaysAs(sql`(data ->> 'owner_group_id')`),
    current_release_id: text('current_release_id').generatedAlwaysAs(
      sql`(data ->> 'current_release_id')`,
    ),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'assets_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    foreignKey({ columns: [t.source_id], foreignColumns: [sources.id] }),
    foreignKey({ columns: [t.owner_group_id], foreignColumns: [groups.id] }),
    foreignKey({
      columns: [t.id, t.current_release_id],
      foreignColumns: [releases.asset_id, releases.id],
    }),
  ],
);

export const bindings = pgTable(
  'bindings',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['bindings']>().notNull(),
    source_id: text('source_id').generatedAlwaysAs(sql`(data ->> 'source_id')`),
    asset_id: text('asset_id').generatedAlwaysAs(sql`(data ->> 'asset_id')`),
    path: text('path').generatedAlwaysAs(sql`(data ->> 'path')`),
    retired_at: text('retired_at').generatedAlwaysAs(sql`(data ->> 'retired_at')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'bindings_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    uniqueIndex('binding_asset')
      .on(t.asset_id)
      .where(sql`retired_at IS NULL`),
    uniqueIndex('binding_path')
      .on(t.source_id, t.path)
      .where(sql`retired_at IS NULL`),
    foreignKey({ columns: [t.source_id], foreignColumns: [sources.id] }),
    foreignKey({ columns: [t.asset_id], foreignColumns: [assets.id] }),
  ],
);

export const intakes = pgTable(
  'intakes',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['intakes']>().notNull(),
    asset_id: text('asset_id').generatedAlwaysAs(sql`(data ->> 'asset_id')`),
    source_id: text('source_id').generatedAlwaysAs(sql`(data ->> 'source_id')`),
    binding_id: text('binding_id').generatedAlwaysAs(sql`(data ->> 'binding_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'intakes_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    index('intake_asset').on(t.asset_id),
    foreignKey({ columns: [t.asset_id], foreignColumns: [assets.id] }),
    foreignKey({ columns: [t.source_id], foreignColumns: [sources.id] }),
    foreignKey({ columns: [t.binding_id], foreignColumns: [bindings.id] }),
  ],
);

export const versions = pgTable(
  'versions',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['versions']>().notNull(),
    asset_id: text('asset_id').generatedAlwaysAs(sql`(data ->> 'asset_id')`),
    version_label: text('version_label')
      .generatedAlwaysAs(sql`(data ->> 'version_label')`)
      .notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'versions_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    unique().on(t.asset_id, t.version_label),
    index('versions_asset').on(t.asset_id),
    foreignKey({ columns: [t.asset_id], foreignColumns: [assets.id] }),
  ],
);

export const scans = pgTable(
  'scans',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['scans']>().notNull(),
    version_id: text('version_id').generatedAlwaysAs(sql`(data ->> 'version_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'scans_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    foreignKey({ columns: [t.version_id], foreignColumns: [versions.id] }),
  ],
);

export const requests = pgTable(
  'requests',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['requests']>().notNull(),
    asset_id: text('asset_id').generatedAlwaysAs(sql`(data ->> 'asset_id')`),
    version_id: text('version_id').generatedAlwaysAs(sql`(data ->> 'version_id')`),
    source_intake_id: text('source_intake_id').generatedAlwaysAs(
      sql`(data ->> 'source_intake_id')`,
    ),
    scan_run_id: text('scan_run_id').generatedAlwaysAs(sql`(data ->> 'scan_run_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'requests_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    index('requests_asset').on(t.asset_id),
    index('requests_intake').on(t.source_intake_id),
    foreignKey({ columns: [t.asset_id], foreignColumns: [assets.id] }),
    foreignKey({ columns: [t.version_id], foreignColumns: [versions.id] }),
    foreignKey({ columns: [t.source_intake_id], foreignColumns: [intakes.id] }),
    foreignKey({ columns: [t.scan_run_id], foreignColumns: [scans.id] }),
  ],
);

export const releases = pgTable(
  'releases',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['releases']>().notNull(),
    asset_id: text('asset_id').generatedAlwaysAs(sql`(data ->> 'asset_id')`),
    version_id: text('version_id').generatedAlwaysAs(sql`(data ->> 'version_id')`),
    request_id: text('request_id')
      .generatedAlwaysAs(sql`(data ->> 'request_id')`)
      .unique(),
    release_seq: bigint('release_seq', { mode: 'bigint' }).generatedAlwaysAs(
      sql`((data ->> 'release_seq')::bigint)`,
    ),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'releases_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    unique().on(t.asset_id, t.release_seq),
    unique().on(t.asset_id, t.id),
    index('releases_version').on(t.version_id, t.release_seq),
    foreignKey({ columns: [t.asset_id], foreignColumns: [assets.id] }),
    foreignKey({ columns: [t.version_id], foreignColumns: [versions.id] }),
    foreignKey({ columns: [t.request_id], foreignColumns: [requests.id] }),
  ],
);

export const jobs = pgTable(
  'jobs',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['jobs']>().notNull(),
    aggregate_id: text('aggregate_id')
      .generatedAlwaysAs(sql`(data ->> 'aggregate_id')`)
      .notNull(),
  },
  (_t): PgTableExtraConfigValue[] => [
    check(
      'jobs_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    index('jobs_schedule').on(sql`(data ->> 'state')`, sql`((data ->> 'run_after')::bigint)`),
  ],
);

export const audit = pgTable(
  'audit',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['audit']>().notNull(),
    occurred_at: text('occurred_at')
      .generatedAlwaysAs(sql`(data ->> 'occurred_at')`)
      .notNull(),
  },
  (_t): PgTableExtraConfigValue[] => [
    check(
      'audit_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['sessions']>().notNull(),
    user_id: text('user_id').generatedAlwaysAs(sql`(data ->> 'user_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'sessions_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
  ],
);

export const tokens = pgTable(
  'tokens',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['tokens']>().notNull(),
    user_id: text('user_id').generatedAlwaysAs(sql`(data ->> 'user_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'tokens_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
  ],
);

export const oauth_clients = pgTable(
  'oauth_clients',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['oauth_clients']>().notNull(),
  },
  (_t): PgTableExtraConfigValue[] => [
    check(
      'oauth_clients_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
  ],
);

export const oauth_grants = pgTable(
  'oauth_grants',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['oauth_grants']>().notNull(),
    client_id: text('client_id').generatedAlwaysAs(sql`(data ->> 'client_id')`),
    user_id: text('user_id').generatedAlwaysAs(sql`(data ->> 'user_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'oauth_grants_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    index('oauth_grants_client_id').on(t.client_id),
    index('oauth_grants_user_id').on(t.user_id),
    foreignKey({ columns: [t.client_id], foreignColumns: [oauth_clients.id] }),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
  ],
);

export const oauth_requests = pgTable(
  'oauth_requests',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['oauth_requests']>().notNull(),
    client_id: text('client_id').generatedAlwaysAs(sql`(data ->> 'client_id')`),
    user_id: text('user_id').generatedAlwaysAs(sql`(data ->> 'user_id')`),
    grant_id: text('grant_id').generatedAlwaysAs(sql`(data ->> 'grant_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'oauth_requests_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    index('oauth_requests_client_id').on(t.client_id),
    index('oauth_requests_user_id').on(t.user_id),
    index('oauth_requests_grant_id').on(t.grant_id),
    foreignKey({ columns: [t.client_id], foreignColumns: [oauth_clients.id] }),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
    foreignKey({ columns: [t.grant_id], foreignColumns: [oauth_grants.id] }),
  ],
);

export const oauth_credentials = pgTable(
  'oauth_credentials',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['oauth_credentials']>().notNull(),
    grant_id: text('grant_id').generatedAlwaysAs(sql`(data ->> 'grant_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'oauth_credentials_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    index('oauth_credentials_grant_id').on(t.grant_id),
    foreignKey({ columns: [t.grant_id], foreignColumns: [oauth_grants.id] }),
  ],
);

export const git_credentials = pgTable(
  'git_credentials',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['git_credentials']>().notNull(),
    user_id: text('user_id').generatedAlwaysAs(sql`(data ->> 'user_id')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'git_credentials_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
  ],
);

export const idempotency = pgTable(
  'idempotency',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['idempotency']>().notNull(),
    principal_id: text('principal_id').generatedAlwaysAs(sql`(data ->> 'principal_id')`),
    route: text('route').generatedAlwaysAs(sql`(data ->> 'route')`),
    key: text('key').generatedAlwaysAs(sql`(data ->> 'key')`),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'idempotency_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    unique().on(t.principal_id, t.route, t.key),
    foreignKey({ columns: [t.principal_id], foreignColumns: [users.id] }),
  ],
);

export const login_attempts = pgTable(
  'login_attempts',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['login_attempts']>().notNull(),
    window_expires_at: bigint('window_expires_at', { mode: 'bigint' })
      .generatedAlwaysAs(sql`((data ->> 'window_expires_at')::bigint)`)
      .notNull(),
  },
  (_t): PgTableExtraConfigValue[] => [
    check(
      'login_attempts_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
  ],
);

export const cli_logins = pgTable(
  'cli_logins',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['cli_logins']>().notNull(),
    code: text('code')
      .generatedAlwaysAs(sql`(data ->> 'code')`)
      .unique(),
  },
  (_t): PgTableExtraConfigValue[] => [
    check(
      'cli_logins_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
  ],
);

export const scenarios = pgTable(
  'scenarios',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['scenarios']>().notNull(),
    name: text('name')
      .generatedAlwaysAs(sql`(data ->> 'name')`)
      .notNull()
      .unique(),
  },
  (_t): PgTableExtraConfigValue[] => [
    check(
      'scenarios_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
  ],
);

export const recommendations = pgTable(
  'recommendations',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['recommendations']>().notNull(),
    user_id: text('user_id')
      .generatedAlwaysAs(sql`(data ->> 'user_id')`)
      .notNull(),
    version_id: text('version_id')
      .generatedAlwaysAs(sql`(data ->> 'version_id')`)
      .notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'recommendations_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
    unique().on(t.user_id, t.version_id),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
    foreignKey({ columns: [t.version_id], foreignColumns: [versions.id] }),
  ],
);

export const asset_feedback = pgTable(
  'asset_feedback',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['asset_feedback']>().notNull(),
    asset_id: text('asset_id')
      .generatedAlwaysAs(sql`data ->> 'asset_id'`)
      .notNull(),
    version_id: text('version_id')
      .generatedAlwaysAs(sql`data ->> 'version_id'`)
      .notNull(),
    submitted_by: text('submitted_by')
      .generatedAlwaysAs(sql`data ->> 'submitted_by'`)
      .notNull(),
    request_key: text('request_key')
      .generatedAlwaysAs(sql`data ->> 'request_key'`)
      .notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    check(
      'asset_feedback_data_check',
      sql`( jsonb_typeof(data) = 'object' AND data ->> 'id' = id ) IS TRUE`,
    ),
    unique().on(t.submitted_by, t.request_key),
    index('asset_feedback_asset').on(t.asset_id),
    foreignKey({ columns: [t.asset_id], foreignColumns: [assets.id] }),
    foreignKey({ columns: [t.version_id], foreignColumns: [versions.id] }),
    foreignKey({ columns: [t.submitted_by], foreignColumns: [users.id] }),
  ],
);

export {
  ai_executions,
  ai_events,
  ai_snapshots,
  ai_interactions,
  ai_effects,
  ai_threads,
  ai_messages,
  ai_calls,
  ai_traces,
  ai_artifacts,
} from './ai-schema.js';
