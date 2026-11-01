import type { Principal } from '@capability-hub/domain/identity';
import { fail, notFound } from '@capability-hub/domain/errors';
import { safePath } from '@capability-hub/domain/paths';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';

export class AssetContentService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
  ) {}
  /**
   * 下载走 blob 存储（可能为外部对象存储，耗时不受事务保护）；先做可读性校验，
   * 不可读抛 404，随后无条件写 `content.download` 审计，未登录者记为 `anonymous`。
   */
  async getArchive(p: Principal | null, id: string) {
    const version = await this.access.requireReadableVersion(p, id);
    const asset = await this.access.getAsset(version.asset_id);
    const bytes = await this.context.blobs.read(version.artifact_ref);
    await this.context.store.audit(p?.id ?? 'anonymous', 'content.download', version.id);
    return { bytes, slug: asset.slug, artifact_digest: version.artifact_digest };
  }
  /** 版本不可读抛 404；非 MCP 资产抛 422/`NOT_MCP`，避免把 Skill 的安装信息当作配置下发。 */
  async getMcpOptions(p: Principal, id: string) {
    const version = await this.access.requireReadableVersion(p, id);
    if ((await this.access.getAsset(version.asset_id)).kind !== 'mcp')
      fail(422, 'NOT_MCP', '需要 MCP 版本');
    return { installation_options: version.metadata.installation_options };
  }
  /**
   * `management` 模式读候选版本：未登录抛 401/`UNAUTHENTICATED`，并通过
   * {@link AssetAccessService.requireCandidateAccess} 授权（403）且写管理读取审计；
   * 非管理模式下退化为已发布版本的可读性校验。`release_id` 为最新发布，未发布时为 `null`。
   */
  async getManifest(p: Principal | null, id: string, management = false) {
    if (management && !p) fail(401, 'UNAUTHENTICATED', '请登录');
    const v = management
      ? await this.context.store.get('versions', id)
      : await this.access.requireReadableVersion(p, id);
    if (!v) notFound();
    if (management && p) await this.access.requireCandidateAccess(p, v);
    return {
      version_id: v.id,
      asset_id: v.asset_id,
      release_id: (await this.access.latestReleaseForVersion(v))?.id ?? null,
      content_digest: v.content_digest,
      artifact_digest: v.artifact_digest,
      manifest: v.manifest,
    };
  }
  /**
   * `path` 先经 `safePath` 归一化校验，越界或非法路径抛 422/`UNSAFE_PATH`；
   * 授权规则与 {@link getManifest} 相同，文件不存在抛 404；字节来自 blob 存储。
   */
  async getFile(p: Principal | null, id: string, path: string, management = false) {
    if (management && !p) fail(401, 'UNAUTHENTICATED', '请登录');
    safePath(path);
    const v = management
      ? await this.context.store.get('versions', id)
      : await this.access.requireReadableVersion(p, id);
    if (!v) notFound();
    if (management && p) await this.access.requireCandidateAccess(p, v);
    const f = v.files.find((f) => f.path === path);
    if (!f) notFound();
    return { bytes: await this.context.blobs.read(f.blob_ref), file: f };
  }
}
