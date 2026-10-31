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
  async getArchive(p: Principal | null, id: string) {
    const version = await this.access.requireReadableVersion(p, id);
    const asset = await this.access.getAsset(version.asset_id);
    const bytes = await this.context.blobs.read(version.artifact_ref);
    await this.context.store.audit(p?.id ?? 'anonymous', 'content.download', version.id);
    return { bytes, slug: asset.slug, artifact_digest: version.artifact_digest };
  }
  async getMcpOptions(p: Principal, id: string) {
    const version = await this.access.requireReadableVersion(p, id);
    if ((await this.access.getAsset(version.asset_id)).kind !== 'mcp')
      fail(422, 'NOT_MCP', '需要 MCP 版本');
    return { installation_options: version.metadata.installation_options };
  }
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
