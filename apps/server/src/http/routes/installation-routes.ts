import type { Express } from 'express';
import { createInstallationGuide } from '../../integrations/installation-guide.js';
import type { HttpContext } from '../context.js';
import { jsonRoute as send } from '../response.js';
/** 公开安装链接始终按匿名受众校验，不借浏览器或令牌扩大权限。 */
export function registerInstallationRoutes(app: Express, { hub }: HttpContext): void {
  for (const [prefix, kind] of [
    ['skills', 'skill'],
    ['mcp-servers', 'mcp'],
  ] as const) {
    const route = `/${prefix}/:slug/:version`;
    app.get(
      route,
      send(async (req, res) => {
        const version = await hub.assetAccess.requirePublicVersion(
          kind,
          String(req.params.slug),
          String(req.params.version),
        );
        res.type('text/markdown').send(await createInstallationGuide(hub, version.id));
      }),
    );
    app.get(
      route + '/download',
      send(async (req, res) => {
        const version = await hub.assetAccess.requirePublicVersion(
          kind,
          String(req.params.slug),
          String(req.params.version),
        );
        const archive = await hub.content.getArchive(null, version.id);
        res.set({
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${archive.slug}-${version.version_label}.zip`)}`,
        });
        res.send(archive.bytes);
      }),
    );
    app.get(
      route + '/files/*path',
      send(async (req, res) => {
        const version = await hub.assetAccess.requirePublicVersion(
          kind,
          String(req.params.slug),
          String(req.params.version),
        );
        const segments: unknown = req.params.path;
        const path = Array.isArray(segments) ? segments.map(String).join('/') : String(segments);
        const { bytes } = await hub.content.getFile(null, version.id, path);
        let text = false;
        try {
          text = !new TextDecoder('utf8', { fatal: true }).decode(bytes).includes('\0');
        } catch {
          /* 二进制文件按附件交付。 */
        }
        if (text)
          res.set(
            'Content-Type',
            `${kind === 'mcp' && path === 'server.json' ? 'application/json' : 'text/plain'}; charset=utf-8`,
          );
        else
          res.set({
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(path.split('/').pop()!)}`,
          });
        res.send(bytes);
      }),
    );
  }
}
