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

/**
 * 记录表的统一形状：整条记录放在 `data` JSON 里，另用 STORED 生成列把需要约束或索引的字段
 * （如 `username`）物化出来，唯一约束、索引与外键都作用在这些真实列上，而写入方只需提交 JSON。
 * `*_data_check` 要求 `json_valid`、为对象且 `$.id` 等于主键，生成列因此不会与 JSON 内容分叉。
 * 注意外键只在开启 `PRAGMA foreign_keys`（见 `openSqliteDriver`）的连接上生效。
 * 本表：`username` 唯一，登录与重命名冲突都由它裁决，不需要先查后写。
 */
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

/** 组名唯一；`sources`/`assets` 的归属组外键指向本表，被引用时删除会被拒绝。 */
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

/** `(user_id, group_id)` 唯一，同一成员关系不会重复；两个外键保证用户与组都真实存在。 */
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

/** 角色名唯一；`role_bindings.role_id` 引用本表。 */
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

/**
 * 只对 `role_id` 建外键：授权主体可能是用户或组，单列外键表达不了这种二选一，
 * `principal_id` 的合法性由应用层保证，因此主体被删除后数据库不会阻止留下孤立绑定。
 */
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

/** 归属组外键指向 `groups`，组被引用时无法删除；`owner_group_id` 由 `data` 生成，不能单独改写。 */
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

/**
 * `slug` 唯一；`current_release_id` 用复合外键
 * `(id, current_release_id) → releases(asset_id, id)`，因此「当前发布」必须既存在又属于本资产，
 * 跨资产引用会被存储层拒绝。
 */
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

/**
 * 两个部分唯一索引只在 `retired_at IS NULL` 时生效：同一资产最多一个活跃绑定、
 * 同一来源路径最多一个活跃绑定；已退役的历史绑定可以无限累积而不冲突。
 */
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

/** `intake_asset` 索引支撑按资产翻导入记录；被引用的资产、来源、绑定任一都不能直接删除。 */
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

/** `(asset_id, version_label)` 唯一，同一资产内版本号不重复；`versions_asset` 供按资产列举。 */
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

/** 扫描记录通过 `version_id` 挂在版本上，被引用的版本不能先被删除。 */
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

/**
 * 资产与来源导入两条索引支撑审核列表分页；四个外键（资产/版本/导入/扫描）
 * 使被引用的上游记录无法被单独删除，审核链因此保持完整。
 */
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

/**
 * `request_id` 唯一：一次审核请求只能产出一个发布，重复发布由约束拒绝；
 * `(asset_id, release_seq)` 唯一给发布序号定序；`(asset_id, id)` 唯一是
 * `assets.current_release_id` 复合外键的引用目标。
 */
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

/**
 * `jobs_schedule` 索引 `(state, run_after)` 是轮询到期任务的主路径；
 * 不设外键——任务与业务聚合的关联只靠 `aggregate_id`，清理聚合时不会阻塞也不会级联。
 */
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

/**
 * 审计只物化 `occurred_at` 用于时间检索，刻意不设任何外键：
 * 主体被删除时删除操作不被阻塞，审计记录也不会被级联清除。
 */
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

/** 会话归 `user_id` 所有；该用户被引用期间删除会被外键拒绝，需先清理会话。 */
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

/** 个人访问令牌归 `user_id` 所有；外键行为与 `sessions` 一致。 */
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

/** 客户端注册表只有 JSON 载荷，无生成列与外键，因此删除其它记录不会牵连已注册客户端。 */
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

/** 按客户端、按用户两条索引支撑列举授权；本表又被 `oauth_requests`/`oauth_credentials` 引用。 */
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

/** 三条索引分别支撑按客户端、用户、授权查询待处理请求；三个外键阻止上游记录被删除。 */
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

/** 授权换出的凭据以 `grant_id` 索引，按授权定位或撤销；授权存在期间不能删除。 */
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

/** 用户维护的 Git 凭据；`user_id` 外键存在，被引用期间用户无法删除。 */
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

/**
 * `(principal_id, route, KEY)` 唯一：幂等键的作用域是「主体 + 路由」，不同接口可复用同一键值。
 * 列名 `KEY` 沿用 SQL 保留字，生成 DDL/DML 时需要引号转义。
 */
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

/** 只物化 `window_expires_at` 供清理过期窗口；不设外键，未登录态的尝试也必须能记录。 */
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

/** `code` 唯一：设备码被并发提交时由存储层裁决唯一成功者；不设外键，码在确认前尚未绑定用户。 */
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

/** 场景名唯一；场景内容整体落在 `data` 中，不参与任何外键。 */
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

/** `(user_id, version_id)` 唯一：同一用户对同一版本只有一条推荐，重复推荐必须更新而非新增。 */
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

/**
 * 全局版本计数器：`id = 1` 的 check 保证只有一行；迁移安装的触发器在业务表写入后自增，
 * `revision()` 读取它判断是否需要刷新缓存。
 */
export const hub_revision = sqliteTable(
  'hub_revision',
  {
    id: integer('id').primaryKey(),
    revision: integer('revision').notNull().default(0),
  },
  (_t): SQLiteTableExtraConfigValue[] => [check('hub_revision_id_check', sql`id = 1`)],
);

/**
 * `(submitted_by, request_key)` 唯一，使同一用户的重试提交不会产生第二条反馈；
 * `asset_feedback_asset` 支撑按资产列举，三个外键锁定资产/版本/提交人。
 */
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
