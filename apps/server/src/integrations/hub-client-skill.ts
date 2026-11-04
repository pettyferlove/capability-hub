import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hubClientSkillName, publicResourcePath } from '@capability-hub/contracts';
import type { HubClientSkillBundleResponse } from '@capability-hub/contracts';
import { canonical, digest } from '@capability-hub/domain/canonical';
import type { ContentFile } from '@capability-hub/domain/content';
import { fail, HubError } from '@capability-hub/domain/errors';
import { archive, inspect } from '@capability-hub/infrastructure/content';
import type { HubServices } from '../bootstrap/hub-services.js';

const skillDirectory = new URL(
  `${import.meta.url.endsWith('.ts') ? '../../../../skills' : '../skills'}/${hubClientSkillName}/`,
  import.meta.url,
);

/** 匿名交付只读取随服务打包的目录，文件、清单和归档来自同一份字节。 */
export async function readHubClientSkillBundle(): Promise<
  HubClientSkillBundleResponse & { files: ContentFile[]; archive: Buffer }
> {
  const files: ContentFile[] = [];
  for (const entry of await readdir(skillDirectory, { recursive: true, withFileTypes: true })) {
    if (entry.isDirectory()) continue;
    if (!entry.isFile()) fail(500, 'HUB_SKILL_INVALID', '随附 Skill 只能包含普通文件');
    const path = join(entry.parentPath, entry.name);
    files.push({
      path: relative(fileURLToPath(skillDirectory), path).split(sep).join('/'),
      bytes: await readFile(path),
      executable: false,
    });
  }
  const inspected = inspect('skill', files, hubClientSkillName);
  const bytes = await archive(inspected.files);
  return {
    slug: hubClientSkillName,
    files: inspected.files,
    manifest: inspected.manifest,
    content_digest: inspected.content_digest,
    artifact_digest: digest(bytes),
    archive: bytes,
  };
}

/** 安装推荐只接受活跃、公开且与随附 Skill 一致的版本。推荐不可用时仍可接入 Hub。 */
export async function publishedHubClientSkillUrl(hub: HubServices): Promise<string | undefined> {
  try {
    const { asset, version } = await hub.assetAccess.requirePublishedAsset(
      null,
      hubClientSkillName,
    );
    const bundle = await readHubClientSkillBundle();
    if (
      asset.kind !== 'skill' ||
      asset.lifecycle !== 'active' ||
      canonical(version.manifest) !== canonical(bundle.manifest) ||
      version.content_digest !== bundle.content_digest ||
      version.artifact_digest !== bundle.artifact_digest
    )
      return;
    return new URL(
      publicResourcePath('skill', asset.slug, version.version_label),
      hub.config.publicUrl,
    ).href;
  } catch (error) {
    if (error instanceof HubError && error.code === 'NOT_FOUND') return;
    hub.logs.logger.warn({ event: 'hub.client_skill_link_unavailable', err: error });
  }
}
