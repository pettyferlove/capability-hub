import type { RecordMap } from '@capability-hub/domain/models';
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  check,
  unique,
  index,
  uniqueIndex,
  foreignKey,
  type SQLiteTableExtraConfigValue,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['users']>().notNull(),
    username: text('username')
      .generatedAlwaysAs(sql`json_extract(data, '$.username')`, { mode: 'stored' })
      .notNull()
      .unique(),
  },
  (_t): SQLiteTableExtraConfigValue[] => [
    check(
      'users_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
  ],
);

export const groups = sqliteTable(
  'groups',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['groups']>().notNull(),
    name: text('name')
      .generatedAlwaysAs(sql`json_extract(data, '$.name')`, { mode: 'stored' })
      .notNull()
      .unique(),
  },
  (_t): SQLiteTableExtraConfigValue[] => [
    check(
      'groups_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
  ],
);

export const memberships = sqliteTable(
  'memberships',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['memberships']>().notNull(),
    user_id: text('user_id').generatedAlwaysAs(sql`json_extract(data, '$.user_id')`, {
      mode: 'stored',
    }),
    group_id: text('group_id').generatedAlwaysAs(sql`json_extract(data, '$.group_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'memberships_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    unique().on(t.user_id, t.group_id),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
    foreignKey({ columns: [t.group_id], foreignColumns: [groups.id] }),
  ],
);

export const roles = sqliteTable(
  'roles',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['roles']>().notNull(),
    name: text('name')
      .generatedAlwaysAs(sql`json_extract(data, '$.name')`, { mode: 'stored' })
      .notNull()
      .unique(),
  },
  (_t): SQLiteTableExtraConfigValue[] => [
    check(
      'roles_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
  ],
);

export const role_bindings = sqliteTable(
  'role_bindings',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['role_bindings']>().notNull(),
    principal_id: text('principal_id')
      .generatedAlwaysAs(sql`json_extract(data, '$.principal_id')`, { mode: 'stored' })
      .notNull(),
    role_id: text('role_id').generatedAlwaysAs(sql`json_extract(data, '$.role_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'role_bindings_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    foreignKey({ columns: [t.role_id], foreignColumns: [roles.id] }),
  ],
);

export const sources = sqliteTable(
  'sources',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['sources']>().notNull(),
    owner_group_id: text('owner_group_id').generatedAlwaysAs(
      sql`json_extract(data, '$.owner_group_id')`,
      { mode: 'stored' },
    ),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'sources_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    foreignKey({ columns: [t.owner_group_id], foreignColumns: [groups.id] }),
  ],
);

export const assets = sqliteTable(
  'assets',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['assets']>().notNull(),
    slug: text('slug')
      .generatedAlwaysAs(sql`json_extract(data, '$.slug')`, { mode: 'stored' })
      .notNull()
      .unique(),
    source_id: text('source_id').generatedAlwaysAs(sql`json_extract(data, '$.source_id')`, {
      mode: 'stored',
    }),
    owner_group_id: text('owner_group_id').generatedAlwaysAs(
      sql`json_extract(data, '$.owner_group_id')`,
      { mode: 'stored' },
    ),
    current_release_id: text('current_release_id').generatedAlwaysAs(
      sql`json_extract(data, '$.current_release_id')`,
      { mode: 'stored' },
    ),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'assets_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    foreignKey({ columns: [t.source_id], foreignColumns: [sources.id] }),
    foreignKey({ columns: [t.owner_group_id], foreignColumns: [groups.id] }),
    foreignKey({
      columns: [t.id, t.current_release_id],
      foreignColumns: [releases.asset_id, releases.id],
    }),
  ],
);

export const bindings = sqliteTable(
  'bindings',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['bindings']>().notNull(),
    source_id: text('source_id').generatedAlwaysAs(sql`json_extract(data, '$.source_id')`, {
      mode: 'stored',
    }),
    asset_id: text('asset_id').generatedAlwaysAs(sql`json_extract(data, '$.asset_id')`, {
      mode: 'stored',
    }),
    path: text('path').generatedAlwaysAs(sql`json_extract(data, '$.path')`, { mode: 'stored' }),
    retired_at: text('retired_at').generatedAlwaysAs(sql`json_extract(data, '$.retired_at')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'bindings_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
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

export const intakes = sqliteTable(
  'intakes',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['intakes']>().notNull(),
    asset_id: text('asset_id').generatedAlwaysAs(sql`json_extract(data, '$.asset_id')`, {
      mode: 'stored',
    }),
    source_id: text('source_id').generatedAlwaysAs(sql`json_extract(data, '$.source_id')`, {
      mode: 'stored',
    }),
    binding_id: text('binding_id').generatedAlwaysAs(sql`json_extract(data, '$.binding_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'intakes_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    index('intake_asset').on(t.asset_id),
    foreignKey({ columns: [t.asset_id], foreignColumns: [assets.id] }),
    foreignKey({ columns: [t.source_id], foreignColumns: [sources.id] }),
    foreignKey({ columns: [t.binding_id], foreignColumns: [bindings.id] }),
  ],
);

export const versions = sqliteTable(
  'versions',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['versions']>().notNull(),
    asset_id: text('asset_id').generatedAlwaysAs(sql`json_extract(data, '$.asset_id')`, {
      mode: 'stored',
    }),
    version_label: text('version_label')
      .generatedAlwaysAs(sql`json_extract(data, '$.version_label')`, { mode: 'stored' })
      .notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'versions_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    unique().on(t.asset_id, t.version_label),
    index('versions_asset').on(t.asset_id),
    foreignKey({ columns: [t.asset_id], foreignColumns: [assets.id] }),
  ],
);

export const scans = sqliteTable(
  'scans',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['scans']>().notNull(),
    version_id: text('version_id').generatedAlwaysAs(sql`json_extract(data, '$.version_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'scans_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    foreignKey({ columns: [t.version_id], foreignColumns: [versions.id] }),
  ],
);

export const requests = sqliteTable(
  'requests',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['requests']>().notNull(),
    asset_id: text('asset_id').generatedAlwaysAs(sql`json_extract(data, '$.asset_id')`, {
      mode: 'stored',
    }),
    version_id: text('version_id').generatedAlwaysAs(sql`json_extract(data, '$.version_id')`, {
      mode: 'stored',
    }),
    source_intake_id: text('source_intake_id').generatedAlwaysAs(
      sql`json_extract(data, '$.source_intake_id')`,
      { mode: 'stored' },
    ),
    scan_run_id: text('scan_run_id').generatedAlwaysAs(sql`json_extract(data, '$.scan_run_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'requests_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    index('requests_asset').on(t.asset_id),
    index('requests_intake').on(t.source_intake_id),
    foreignKey({ columns: [t.asset_id], foreignColumns: [assets.id] }),
    foreignKey({ columns: [t.version_id], foreignColumns: [versions.id] }),
    foreignKey({ columns: [t.source_intake_id], foreignColumns: [intakes.id] }),
    foreignKey({ columns: [t.scan_run_id], foreignColumns: [scans.id] }),
  ],
);

export const releases = sqliteTable(
  'releases',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['releases']>().notNull(),
    asset_id: text('asset_id').generatedAlwaysAs(sql`json_extract(data, '$.asset_id')`, {
      mode: 'stored',
    }),
    version_id: text('version_id').generatedAlwaysAs(sql`json_extract(data, '$.version_id')`, {
      mode: 'stored',
    }),
    request_id: text('request_id')
      .generatedAlwaysAs(sql`json_extract(data, '$.request_id')`, { mode: 'stored' })
      .unique(),
    release_seq: integer('release_seq').generatedAlwaysAs(
      sql`json_extract(data, '$.release_seq')`,
      { mode: 'stored' },
    ),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'releases_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    unique().on(t.asset_id, t.release_seq),
    unique().on(t.asset_id, t.id),
    index('releases_version').on(t.version_id, t.release_seq),
    foreignKey({ columns: [t.asset_id], foreignColumns: [assets.id] }),
    foreignKey({ columns: [t.version_id], foreignColumns: [versions.id] }),
    foreignKey({ columns: [t.request_id], foreignColumns: [requests.id] }),
  ],
);

export const jobs = sqliteTable(
  'jobs',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['jobs']>().notNull(),
    state: text('state').generatedAlwaysAs(sql`json_extract(data, '$.state')`, { mode: 'stored' }),
    run_after: integer('run_after').generatedAlwaysAs(sql`json_extract(data, '$.run_after')`, {
      mode: 'stored',
    }),
    aggregate_id: text('aggregate_id')
      .generatedAlwaysAs(sql`json_extract(data, '$.aggregate_id')`, { mode: 'stored' })
      .notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'jobs_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    index('jobs_schedule').on(t.state, t.run_after),
  ],
);

export const audit = sqliteTable(
  'audit',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['audit']>().notNull(),
    occurred_at: text('occurred_at')
      .generatedAlwaysAs(sql`json_extract(data, '$.occurred_at')`, { mode: 'stored' })
      .notNull(),
  },
  (_t): SQLiteTableExtraConfigValue[] => [
    check(
      'audit_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['sessions']>().notNull(),
    user_id: text('user_id').generatedAlwaysAs(sql`json_extract(data, '$.user_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'sessions_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
  ],
);

export const tokens = sqliteTable(
  'tokens',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['tokens']>().notNull(),
    user_id: text('user_id').generatedAlwaysAs(sql`json_extract(data, '$.user_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'tokens_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
  ],
);

export const oauth_clients = sqliteTable(
  'oauth_clients',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['oauth_clients']>().notNull(),
  },
  (_t): SQLiteTableExtraConfigValue[] => [
    check(
      'oauth_clients_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
  ],
);

export const oauth_grants = sqliteTable(
  'oauth_grants',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['oauth_grants']>().notNull(),
    client_id: text('client_id').generatedAlwaysAs(sql`json_extract(data, '$.client_id')`, {
      mode: 'stored',
    }),
    user_id: text('user_id').generatedAlwaysAs(sql`json_extract(data, '$.user_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'oauth_grants_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    index('oauth_grants_client_id').on(t.client_id),
    index('oauth_grants_user_id').on(t.user_id),
    foreignKey({ columns: [t.client_id], foreignColumns: [oauth_clients.id] }),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
  ],
);

export const oauth_requests = sqliteTable(
  'oauth_requests',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['oauth_requests']>().notNull(),
    client_id: text('client_id').generatedAlwaysAs(sql`json_extract(data, '$.client_id')`, {
      mode: 'stored',
    }),
    user_id: text('user_id').generatedAlwaysAs(sql`json_extract(data, '$.user_id')`, {
      mode: 'stored',
    }),
    grant_id: text('grant_id').generatedAlwaysAs(sql`json_extract(data, '$.grant_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'oauth_requests_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    index('oauth_requests_client_id').on(t.client_id),
    index('oauth_requests_user_id').on(t.user_id),
    index('oauth_requests_grant_id').on(t.grant_id),
    foreignKey({ columns: [t.client_id], foreignColumns: [oauth_clients.id] }),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
    foreignKey({ columns: [t.grant_id], foreignColumns: [oauth_grants.id] }),
  ],
);

export const oauth_credentials = sqliteTable(
  'oauth_credentials',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['oauth_credentials']>().notNull(),
    grant_id: text('grant_id').generatedAlwaysAs(sql`json_extract(data, '$.grant_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'oauth_credentials_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    index('oauth_credentials_grant_id').on(t.grant_id),
    foreignKey({ columns: [t.grant_id], foreignColumns: [oauth_grants.id] }),
  ],
);

export const git_credentials = sqliteTable(
  'git_credentials',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['git_credentials']>().notNull(),
    user_id: text('user_id').generatedAlwaysAs(sql`json_extract(data, '$.user_id')`, {
      mode: 'stored',
    }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'git_credentials_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
  ],
);

export const idempotency = sqliteTable(
  'idempotency',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['idempotency']>().notNull(),
    principal_id: text('principal_id').generatedAlwaysAs(
      sql`json_extract(data, '$.principal_id')`,
      { mode: 'stored' },
    ),
    route: text('route').generatedAlwaysAs(sql`json_extract(data, '$.route')`, { mode: 'stored' }),
    KEY: text('KEY').generatedAlwaysAs(sql`json_extract(data, '$.key')`, { mode: 'stored' }),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'idempotency_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    unique().on(t.principal_id, t.route, t.KEY),
    foreignKey({ columns: [t.principal_id], foreignColumns: [users.id] }),
  ],
);

export const login_attempts = sqliteTable(
  'login_attempts',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['login_attempts']>().notNull(),
    window_expires_at: integer('window_expires_at')
      .generatedAlwaysAs(sql`json_extract(data, '$.window_expires_at')`, { mode: 'stored' })
      .notNull(),
  },
  (_t): SQLiteTableExtraConfigValue[] => [
    check(
      'login_attempts_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
  ],
);

export const cli_logins = sqliteTable(
  'cli_logins',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['cli_logins']>().notNull(),
    code: text('code')
      .generatedAlwaysAs(sql`json_extract(data, '$.code')`, { mode: 'stored' })
      .unique(),
  },
  (_t): SQLiteTableExtraConfigValue[] => [
    check(
      'cli_logins_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
  ],
);

export const scenarios = sqliteTable(
  'scenarios',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['scenarios']>().notNull(),
    name: text('name')
      .generatedAlwaysAs(sql`json_extract(data, '$.name')`, { mode: 'stored' })
      .notNull()
      .unique(),
  },
  (_t): SQLiteTableExtraConfigValue[] => [
    check(
      'scenarios_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
  ],
);

export const recommendations = sqliteTable(
  'recommendations',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['recommendations']>().notNull(),
    user_id: text('user_id')
      .generatedAlwaysAs(sql`json_extract(data, '$.user_id')`, { mode: 'stored' })
      .notNull(),
    version_id: text('version_id')
      .generatedAlwaysAs(sql`json_extract(data, '$.version_id')`, { mode: 'stored' })
      .notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'recommendations_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_type(data, '$.id') = 'text' AND json_extract(data, '$.id') = id ) IS 1`,
    ),
    unique().on(t.user_id, t.version_id),
    foreignKey({ columns: [t.user_id], foreignColumns: [users.id] }),
    foreignKey({ columns: [t.version_id], foreignColumns: [versions.id] }),
  ],
);

export const hub_revision = sqliteTable(
  'hub_revision',
  {
    id: integer('id').primaryKey(),
    revision: integer('revision').notNull().default(0),
  },
  (_t): SQLiteTableExtraConfigValue[] => [check('hub_revision_id_check', sql`id = 1`)],
);

export const asset_feedback = sqliteTable(
  'asset_feedback',
  {
    id: text('id').primaryKey().notNull(),
    data: text('data', { mode: 'json' }).$type<RecordMap['asset_feedback']>().notNull(),
    asset_id: text('asset_id')
      .generatedAlwaysAs(sql`json_extract(data, '$.asset_id')`, { mode: 'stored' })
      .notNull(),
    version_id: text('version_id')
      .generatedAlwaysAs(sql`json_extract(data, '$.version_id')`, { mode: 'stored' })
      .notNull(),
    submitted_by: text('submitted_by')
      .generatedAlwaysAs(sql`json_extract(data, '$.submitted_by')`, { mode: 'stored' })
      .notNull(),
    request_key: text('request_key')
      .generatedAlwaysAs(sql`json_extract(data, '$.request_key')`, { mode: 'stored' })
      .notNull(),
  },
  (t): SQLiteTableExtraConfigValue[] => [
    check(
      'asset_feedback_data_check',
      sql`( json_valid(data) AND json_type(data) = 'object' AND json_extract(data, '$.id') = id ) IS 1`,
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
