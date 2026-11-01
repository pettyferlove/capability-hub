import type { ContentFile, AssetKind } from '@capability-hub/domain/content';

/** 经过安全校验的仓库目标：`url` 已规范化，`host`/`address` 已确认在允许范围内。 */
export interface GitDestination {
  url: string;
  /** 仓库身份（host + path），用于与缓存、审计里的来源对齐。 */
  identity: string;
  host: string;
  address: string;
  transport: 'https' | 'ssh';
  port: number;
  username: string;
}
/**
 * 固定到单个提交的只读快照。临时目录的生命周期由调用方控制，必须 `close`（通常在
 * `finally` 里），否则会残留磁盘内容。
 */
export interface GitSnapshot {
  commit: string;
  /** 拉取时使用的凭据修订号；调用方据此发现同步期间被换掉的凭据（409/`CREDENTIAL_CHANGED`）。 */
  credential_revision?: number;
  /**
   * 读取提交内某个路径下的文件；单文件 ≤10 MiB、累计 ≤100 MiB、≤500 个文件，
   * 越界 413/`PACKAGE_LIMIT`，路径为空 422/`TARGET_MISSING`。
   */
  read(path: string, kind: AssetKind): Promise<ContentFile[]>;
  close(): Promise<void>;
}
/**
 * Git 访问端口。实现方必须自己抵御不可信地址：只允许被管理员放行的主机与网络，
 * 并在失败时抛 {@link HubError}（422 `GIT_URL`/`GIT_HOST_DENIED`/`GIT_ADDRESS_DENIED`、
 * 504 `GIT_TIMEOUT`、502 `GIT_AUTH_ERROR`/`GIT_FETCH_FAILED`，超时与网络类标可重试）。
 */
export interface GitRepository {
  /** 解析并校验地址，返回规范化目标；不做网络 IO。 */
  validate(url: string): Promise<GitDestination>;
  /** 只校验分支名是否符合 Git ref 规则（422/`GIT_BRANCH`），不确认远端是否存在。 */
  branch(branch: string): Promise<void>;
  /** 浅拉取（`--depth=1`）到临时目录并按提交固定，凭据在事务外解析。 */
  snapshot(source: {
    canonical_url: string;
    branch: string;
    credential_ref?: string | null;
  }): Promise<GitSnapshot>;
}
