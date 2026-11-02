import { readFile } from 'node:fs/promises';
import { hubClientSkillName, publicResourcePath } from '@capability-hub/contracts';
import { sha256 } from '@capability-hub/domain/canonical';
import { HubError } from '@capability-hub/domain/errors';
import type { HubServices } from '../bootstrap/hub-services.js';

const skillFile = new URL(
  `${import.meta.url.endsWith('.ts') ? '../../../../skills' : '../skills'}/${hubClientSkillName}/SKILL.md`,
  import.meta.url,
);

/** 匿名正文只读取随服务打包的文件，不从目录资产或请求路径选取内容。 */
export function readHubClientSkill() {
  return readFile(skillFile);
}

/** 安装推荐只接受活跃、公开且与随附 Skill 一致的版本。推荐不可用时仍可接入 Hub。 */
export async function publishedHubClientSkillUrl(hub: HubServices): Promise<string | undefined> {
  try {
    const { asset, version } = await hub.assetAccess.requirePublishedAsset(
      null,
      hubClientSkillName,
    );
    const [file] = version.manifest.files;
    if (
      asset.kind !== 'skill' ||
      asset.lifecycle !== 'active' ||
      version.manifest.files.length !== 1 ||
      file.path !== 'SKILL.md' ||
      file.executable ||
      file.sha256 !== sha256(await readHubClientSkill())
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
