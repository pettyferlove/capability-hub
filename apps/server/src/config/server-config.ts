import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { aiConfigurationSchema } from '@capability-hub/ai';
import { JobQueue } from '@capability-hub/application';
import { builtinRoles } from '@capability-hub/domain/rbac';
import { defaultDataDirectory, defaultWebDirectory, workspaceRoot } from './paths.js';

const databaseSchema = z.discriminatedUnion('driver', [
  z.object({ driver: z.literal('sqlite') }).strict(),
  z
    .object({
      driver: z.literal('postgresql'),
      url: z.string(),
      poolSize: z.number().int().min(1).max(100),
    })
    .strict(),
]);
const objectStorageSchema = z.discriminatedUnion('driver', [
  z.object({ driver: z.literal('filesystem') }).strict(),
  z
    .object({
      driver: z.literal('minio'),
      endpoint: z.string(),
      accessKey: z.string().min(1),
      secretKey: z.string().min(1),
      bucket: z.string().min(3).max(63),
      region: z.string().min(1),
      prefix: z.string(),
    })
    .strict(),
]);
const secretSchema = z.string().regex(/^[a-fA-F0-9]{64}$/);
const ldapSchema = z.strictObject({
  url: z.url(),
  baseDn: z.string().trim().min(1),
  bindDn: z.string().trim().min(1),
  bindPassword: z.string().min(1),
  defaultRoles: z.array(z.string().refine((key) => builtinRoles.some((role) => role.key === key))),
});
const configSchema = z
  .object({
    dataDir: z.string().min(1),
    webDirectory: z.string().min(1),
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
    publicUrl: z.string().min(1, '必须设置 CAPABILITY_HUB_PUBLIC_URL 为 HTTP(S) 根地址'),
    production: z.boolean(),
    secret: z.union([secretSchema, z.literal('')]),
    gitHosts: z.array(z.string()),
    privateGitHosts: z.array(z.string()),
    worker: z.boolean(),
    workerConcurrency: z.number().int().min(1).max(JobQueue.maxConcurrency),
    requestLogging: z.boolean(),
    setupToken: z.string().optional(),
    logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']),
    database: databaseSchema,
    objectStorage: objectStorageSchema,
    ldap: ldapSchema.optional(),
    ai: aiConfigurationSchema,
  })
  .strict();

/**
 * 已校验的运行时配置。`publicUrl` 在此被归一化为 origin（不带路径/查询）；
 * 生产环境必须显式设置 64 位十六进制 `secret`。
 */
export type ServerConfig = z.infer<typeof configSchema>;

function flag(environment: NodeJS.ProcessEnv, name: string, defaultValue: boolean): boolean {
  const value = environment[name];
  if (value === undefined) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(name + ' 必须为 true 或 false');
}

function hostList(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function validate(config: ServerConfig): void {
  if (config.production && !config.secret)
    throw new Error('生产环境必须设置 64 位十六进制 CAPABILITY_HUB_INSTANCE_SECRET');
  if (!config.production && !['127.0.0.1', '::1', 'localhost'].includes(config.host))
    throw new Error('开发服务只能绑定 loopback');
  const publicUrl = new URL(config.publicUrl);
  if (
    !['http:', 'https:'].includes(publicUrl.protocol) ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.pathname !== '/' ||
    publicUrl.search ||
    publicUrl.hash
  )
    throw new Error('公开地址必须为 HTTP(S) 根地址，不得包含凭据、路径或查询参数');
  config.publicUrl = publicUrl.origin;
  if (config.ldap) {
    const url = new URL(config.ldap.url);
    const local = !config.production && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
    if (
      !(url.protocol === 'ldaps:' || (url.protocol === 'ldap:' && local)) ||
      !url.hostname ||
      url.port === '0' ||
      url.username ||
      url.password ||
      (url.pathname && url.pathname !== '/') ||
      url.search ||
      url.hash
    )
      throw new Error('LDAP 需要 LDAPS 服务地址；仅本机开发可使用明文 LDAP');
    config.ldap.defaultRoles = [...new Set(config.ldap.defaultRoles)];
  }
  for (const host of config.gitHosts) {
    const url = new URL('https://' + host);
    if (
      url.hostname !== host ||
      url.host !== host ||
      url.pathname !== '/' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Git 允许列表只能包含规范域名或 IP 地址');
  }
  if (config.privateGitHosts.some((host) => !config.gitHosts.includes(host)))
    throw new Error('私有 Git 域名必须同时出现在 Git 允许列表');
  if (config.database.driver === 'postgresql') {
    const url = new URL(config.database.url);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash)
      throw new Error('PostgreSQL 连接地址无效');
  }
  if (config.objectStorage.driver === 'minio') {
    const storage = config.objectStorage;
    const url = new URL(storage.endpoint);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(storage.bucket) ||
      (storage.prefix !== '' && !/^[a-zA-Z0-9/_-]+\/$/.test(storage.prefix))
    )
      throw new Error('MinIO 配置无效');
  }
}

function instanceSecret(directory: string): string {
  const path = join(directory, 'instance.key');
  try {
    writeFileSync(path, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST')
      throw error;
  }
  const file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(file);
    if (!stat.isFile() || stat.mode & 0o077 || stat.size > 128)
      throw new Error('instance.key 必须为仅当前用户可访问的普通密钥文件');
    return secretSchema.parse(readFileSync(file, 'utf8').trim());
  } finally {
    closeSync(file);
  }
}

/** 配置全部校验通过后才创建数据目录和本地实例密钥。 */
export function loadServerConfig(
  overrides: Partial<ServerConfig> = {},
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const production = overrides.production ?? environment.NODE_ENV === 'production';
  const database =
    overrides.database ??
    (environment.CAPABILITY_HUB_DATABASE_DRIVER === 'postgresql'
      ? {
          driver: 'postgresql',
          url: environment.CAPABILITY_HUB_DATABASE_URL ?? '',
          poolSize: Number(environment.CAPABILITY_HUB_DATABASE_POOL_SIZE ?? 10),
        }
      : { driver: environment.CAPABILITY_HUB_DATABASE_DRIVER ?? 'sqlite' });
  const objectStorage =
    overrides.objectStorage ??
    (environment.CAPABILITY_HUB_OBJECT_STORAGE_DRIVER === 'minio'
      ? {
          driver: 'minio',
          endpoint: environment.CAPABILITY_HUB_MINIO_ENDPOINT ?? '',
          accessKey: environment.CAPABILITY_HUB_MINIO_ACCESS_KEY ?? '',
          secretKey: environment.CAPABILITY_HUB_MINIO_SECRET_KEY ?? '',
          bucket: environment.CAPABILITY_HUB_MINIO_BUCKET ?? 'capability-hub',
          region: environment.CAPABILITY_HUB_MINIO_REGION ?? 'us-east-1',
          prefix: environment.CAPABILITY_HUB_MINIO_PREFIX ?? 'blobs/',
        }
      : { driver: environment.CAPABILITY_HUB_OBJECT_STORAGE_DRIVER ?? 'filesystem' });
  const config = configSchema.parse({
    ldap: environment.CAPABILITY_HUB_LDAP_URL
      ? {
          url: environment.CAPABILITY_HUB_LDAP_URL,
          baseDn: environment.CAPABILITY_HUB_LDAP_BASE_DN,
          bindDn: environment.CAPABILITY_HUB_LDAP_BIND_DN,
          bindPassword: environment.CAPABILITY_HUB_LDAP_BIND_PASSWORD,
          defaultRoles: (environment.CAPABILITY_HUB_LDAP_DEFAULT_ROLES ?? 'maintainer,reader')
            .split(',')
            .map((role) => role.trim()),
        }
      : undefined,
    ai:
      overrides.ai ??
      aiConfigurationSchema.parse(
        environment.CAPABILITY_HUB_AI_CONFIG
          ? (JSON.parse(
              readFileSync(resolve(workspaceRoot, environment.CAPABILITY_HUB_AI_CONFIG), 'utf8'),
            ) as unknown)
          : {},
      ),
    host: environment.CAPABILITY_HUB_HOST ?? '127.0.0.1',
    port: Number(environment.PORT ?? 4100),
    publicUrl: environment.CAPABILITY_HUB_PUBLIC_URL ?? (production ? '' : 'http://127.0.0.1:4100'),
    production,
    secret: environment.CAPABILITY_HUB_INSTANCE_SECRET ?? '',
    gitHosts: (environment.CAPABILITY_HUB_GIT_HOSTS ?? 'github.com,gitlab.com').split(','),
    privateGitHosts: (environment.CAPABILITY_HUB_PRIVATE_GIT_HOSTS ?? '').split(','),
    logLevel: environment.CAPABILITY_HUB_LOG_LEVEL ?? 'info',
    setupToken: environment.CAPABILITY_HUB_SETUP_TOKEN,
    worker: overrides.worker ?? flag(environment, 'CAPABILITY_HUB_WORKER', true),
    workerConcurrency: Number(
      environment.CAPABILITY_HUB_WORKER_CONCURRENCY ?? JobQueue.maxConcurrency,
    ),
    requestLogging:
      overrides.requestLogging ?? flag(environment, 'CAPABILITY_HUB_REQUEST_LOGS', true),
    ...overrides,
    database,
    objectStorage,
    dataDir: resolve(
      workspaceRoot,
      overrides.dataDir ?? environment.CAPABILITY_HUB_DATA_DIR ?? defaultDataDirectory,
    ),
    webDirectory: resolve(
      workspaceRoot,
      overrides.webDirectory ?? environment.CAPABILITY_HUB_WEB_DIR ?? defaultWebDirectory,
    ),
  });
  config.gitHosts = hostList(config.gitHosts);
  config.privateGitHosts = hostList(config.privateGitHosts);
  validate(config);
  mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
  if (!config.secret) config.secret = instanceSecret(config.dataDir);
  return config;
}
