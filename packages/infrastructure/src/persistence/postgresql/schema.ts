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

/**
 * 全局版本计数器：`id = 1` 的 check 保证只有一行；迁移安装的触发器在业务表写入后自增，
 * `revision()` 读取它判断是否需要刷新缓存。`revision` 为 bigint 且以 bigint 模式读出，
 * 避免超过安全整数范围后丢精度。
 */
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

/**
 * 记录表的统一形状：整条记录放在 `data` jsonb 里，另用 `GENERATED ALWAYS AS` 把需要约束或
 * 索引的字段（如 `username`）物化出来，唯一约束、索引与外键都作用在这些真实列上，
 * 写入方只需提交 JSON。`*_data_check` 要求 `jsonb_typeof(data) = 'object'` 且
 * `data ->> 'id'` 等于主键，生成列不会与 JSON 分叉。
 * 用户名在各自认证来源内唯一，目录条目标识独立于可变的用户名。
 */
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey().notNull(),
    data: jsonb('data').$type<RecordMap['users']>().notNull(),
    username: text('username')
      .generatedAlwaysAs(sql`(data ->> 'username')`)
      .notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex('users_local_username')
      .on(t.username)
      .where(sql`(data ->> 'ldap_entry_uuid') IS NULL`),
    uniqueIndex('users_ldap_username')
      .on(t.username)
      .where(sql`(data ->> 'ldap_entry_uuid') IS NOT NULL`),
    uniqueIndex('users_ldap_entry_uuid').on(sql`(data ->> 'ldap_entry_uuid')`),
    check(
      'users_data_check',
      sql`( jsonb_typeof(data) = 'object' AND jsonb_typeof(data -> 'id') = 'string' AND data ->> 'id' = id ) IS TRUE`,
    ),
  ],
);

/** 组名唯一；`sources`/`assets` 的归属组外键指向本表，被引用时删除会被拒绝。 */
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

/** `(user_id, group_id)` 唯一，同一成员关系不会重复；两个外键保证用户与组都真实存在。 */
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

/** 角色名唯一；`role_bindings.role_id` 引用本表。 */
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

/**
 * 只对 `role_id` 建外键：授权主体可能是用户或组，单列外键表达不了这种二选一，
 * `principal_id` 的合法性由应用层保证，因此主体被删除后数据库不会阻止留下孤立绑定。
 */
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

/** 归属组外键指向 `groups`，组被引用时无法删除；`owner_group_id` 由 `data` 生成，不能单独改写。 */
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

/**
 * `slug` 唯一；`current_release_id` 用复合外键
 * `(id, current_release_id) → releases(asset_id, id)`，因此「当前发布」必须既存在又属于本资产，
 * 跨资产引用会被数据库拒绝。
 */
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

/**
 * 两个部分唯一索引只在 `retired_at IS NULL` 时生效：同一资产最多一个活跃绑定、
 * 同一来源路径最多一个活跃绑定；已退役的历史绑定可以无限累积而不冲突。
 */
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

/** `intake_asset` 索引支撑按资产翻导入记录；被引用的资产、来源、绑定任一都不能直接删除。 */
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

/** `(asset_id, version_label)` 唯一，同一资产内版本号不重复；`versions_asset` 供按资产列举。 */
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

/** 扫描记录通过 `version_id` 挂在版本上，被引用的版本不能先被删除。 */
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

/**
 * 资产与来源导入两条索引支撑审核列表分页；四个外键（资产/版本/导入/扫描）
 * 使被引用的上游记录无法被单独删除，审核链因此保持完整。
 */
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

/**
 * `request_id` 唯一：一次审核请求只能产出一个发布，重复发布由约束拒绝；
 * `(asset_id, release_seq)` 唯一给发布序号定序；`(asset_id, id)` 唯一是
 * `assets.current_release_id` 复合外键的引用目标。
 */
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

/**
 * `jobs_schedule` 索引 `(state, run_after)` 是轮询到期任务的主路径；
 * 不设外键——任务与业务聚合的关联只靠 `aggregate_id`，清理聚合时不会阻塞也不会级联。
 */
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

/**
 * 审计只物化 `occurred_at` 用于时间检索，刻意不设任何外键：
 * 主体被删除时删除操作不被阻塞，审计记录也不会被级联清除。
 */
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

/** 会话归 `user_id` 所有；该用户被引用期间删除会被外键拒绝，需先清理会话。 */
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

/** 个人访问令牌归 `user_id` 所有；外键行为与 `sessions` 一致。 */
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

/** 客户端注册表只有 JSON 载荷，无生成列与外键，因此删除其它记录不会牵连已注册客户端。 */
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

/** 按客户端、按用户两条索引支撑列举授权；本表又被 `oauth_requests`/`oauth_credentials` 引用。 */
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

/** 三条索引分别支撑按客户端、用户、授权查询待处理请求；三个外键阻止上游记录被删除。 */
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

/** 授权换出的凭据以 `grant_id` 索引，按授权定位或撤销；授权存在期间不能删除。 */
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

/** 用户维护的 Git 凭据；`user_id` 外键存在，被引用期间用户无法删除。 */
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

/**
 * `(principal_id, route, KEY)` 唯一：幂等键的作用域是「主体 + 路由」，不同接口可复用同一键值。
 * 列名 `KEY` 沿用 SQL 保留字，生成 DDL/DML 时需要引号转义。
 */
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

/** 只物化 `window_expires_at` 供清理过期窗口；不设外键，未登录态的尝试也必须能记录。 */
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

/** `code` 唯一：设备码被并发提交时由数据库裁决唯一成功者；不设外键，码在确认前尚未绑定用户。 */
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

/** 场景名唯一；场景内容整体落在 `data` 中，不参与任何外键。 */
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

/** `(user_id, version_id)` 唯一：同一用户对同一版本只有一条推荐，重复推荐必须更新而非新增。 */
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

/**
 * `(submitted_by, request_key)` 唯一，使同一用户的重试提交不会产生第二条反馈；
 * `asset_feedback_asset` 支撑按资产列举，三个外键锁定资产/版本/提交人。
 */
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
