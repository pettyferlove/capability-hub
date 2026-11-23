import { consumableInstallationOptions, type ContentFile } from '@capability-hub/domain/content';
import type { Principal } from '@capability-hub/domain/identity';
import { fail, notFound } from '@capability-hub/domain/errors';
import { safePath } from '@capability-hub/domain/paths';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';

const maxBundleBytes = 100 * 1024 * 1024;

function checkBundleSize(size: number) {
  if (size > maxBundleBytes)
    fail(413, 'SKILL_BUNDLE_TOO_LARGE', '所选 Skill 解压后合计超过 100 MiB，请分批下载');
}

/**
 * 资产内容读取：每个方法先过 {@link AssetAccessService} 的可读性校验（不可读抛 404），
 * 管理视图额外要求候选版本权限且未登录抛 401。字节直接读 blob 存储、不占用事务，
 * 下载与未登录访问都会立即写审计。
 */
export class AssetContentService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
    private readonly archive: (files: ContentFile[], signal: AbortSignal) => Promise<Buffer>,
  ) {}
  /**
   * HEAD 与下载共用版本授权；只在实际读出归档后记录下载，未登录者记为 `anonymous`。
   */
  async getArchive(p: Principal | null, id: string, metadataOnly = false) {
    const version = await this.access.requireReadableVersion(p, id);
    const asset = await this.access.getAsset(version.asset_id);
    const metadata = { slug: asset.slug, artifact_digest: version.artifact_digest };
    if (metadataOnly) return { ...metadata, bytes: undefined };
    const bytes = await this.context.blobs.read(version.artifact_ref);
    await this.context.store.audit(p?.id ?? 'anonymous', 'content.download', version.id);
    return { ...metadata, bytes };
  }
  /** 先核对整批固定版本，再在事务外读取、打包；交付前复核会话及受众，并原子记录下载。 */
  async getSkillBundle(
    p: Principal | null,
    versionIds: readonly string[],
    refreshViewer: () => Promise<Principal | null>,
    signal: AbortSignal,
  ) {
    const members = [];
    for (const id of versionIds) {
      signal.throwIfAborted();
      const version = await this.access.requireReadableVersion(p, id);
      signal.throwIfAborted();
      const { kind, slug } = await this.access.getAsset(version.asset_id);
      members.push({ kind, slug, files: version.files });
    }
    signal.throwIfAborted();
    const slugs = new Set<string>();
    let size = 0;
    for (const { kind, slug, files } of members) {
      if (kind !== 'skill') fail(422, 'NOT_SKILL', '批量下载仅支持 Skill');
      if (slugs.has(slug)) fail(422, 'SKILL_BUNDLE_CONFLICT', '同一 Skill 只能选择一个版本');
      slugs.add(safePath(slug));
      for (const file of files) size += file.size;
    }
    checkBundleSize(size);
    const entries: ContentFile[] = [];
    let actualSize = 0;
    for (const { slug, files } of members) {
      for (const file of files) {
        signal.throwIfAborted();
        if (file.blob_ref !== file.sha256) fail(503, 'BLOB_CORRUPT', '内容完整性校验失败');
        const bytes = await this.context.blobs.read(file.blob_ref, signal);
        actualSize += bytes.length;
        checkBundleSize(actualSize);
        if (bytes.length !== file.size) fail(503, 'BLOB_CORRUPT', '内容完整性校验失败');
        entries.push({ path: `${slug}/${file.path}`, bytes, executable: file.executable });
      }
    }
    signal.throwIfAborted();
    const bytes = await this.archive(entries, signal);
    signal.throwIfAborted();
    await this.context.store.tx(async () => {
      signal.throwIfAborted();
      const viewer = await refreshViewer();
      for (const id of versionIds) {
        signal.throwIfAborted();
        await this.access.requireReadableVersion(viewer, id);
        signal.throwIfAborted();
        await this.context.store.audit(viewer?.id ?? 'anonymous', 'content.download', id);
      }
      signal.throwIfAborted();
    });
    return bytes;
  }
  /** 版本不可读抛 404；非 MCP 资产抛 422/`NOT_MCP`，避免把 Skill 的安装信息当作配置下发。 */
  async getMcpOptions(p: Principal, id: string) {
    const version = await this.access.requireReadableVersion(p, id);
    if ((await this.access.getAsset(version.asset_id)).kind !== 'mcp')
      fail(422, 'NOT_MCP', '需要 MCP 版本');
    return { installation_options: consumableInstallationOptions(version.metadata) };
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
