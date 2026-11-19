import { fail } from '@capability-hub/domain/errors';
import type { Express } from 'express';
import { createInstallationGuide } from '../../integrations/installation-guide.js';
import type { HttpContext } from '../context.js';
import { jsonRoute as send } from '../response.js';

/** 公开安装链接始终按匿名受众校验，不借浏览器或令牌扩大权限。 */
export function registerInstallationRoutes(app: Express, { hub }: HttpContext): void {
  const ticketRoute = '/api/install-tickets/:ticket';
  const ticketArchive = ticketRoute + '/archive';
  app.param('ticket', (_req, _res, next, ticket: unknown) => {
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket))
      fail(404, 'INSTALL_TICKET_INVALID', '安装票据无效或已过期，请重新调用 install_skill');
    next();
  });
  app.get(
    ticketRoute,
    send(async (req) => ({
      hub_url: hub.config.publicUrl,
      ...(await hub.installTickets.describe(String(req.params.ticket))),
    })),
  );
  app.head(ticketArchive, (_req, res) => {
    res.set('Allow', 'GET').status(405).end();
  });
  app.get(
    ticketArchive,
    send(async (req, res) => {
      const { principal, version } = await hub.installTickets.redeem(String(req.params.ticket));
      const archive = await hub.content.getArchive(principal, version.id);
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${archive.slug}.zip"`,
        'X-Content-SHA256': archive.artifact_digest,
      });
      res.send(archive.bytes);
    }),
  );

  for (const [prefix, kind] of [
    ['skills', 'skill'],
    ['mcp-servers', 'mcp'],
  ] as const) {
    const route = `/${prefix}/:slug/:version`;
    app.get(
      route,
      send(async (req, res) => {
        const document = await createInstallationGuide(
          hub,
          kind,
          String(req.params.slug),
          String(req.params.version),
        );
        res.type('text/markdown').send(document);
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
