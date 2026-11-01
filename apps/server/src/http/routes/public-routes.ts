import {
  cliLoginRequestSchema,
  pollCliLoginRequestSchema,
  hubConnectionQuerySchema,
  hubMcpConnectionGuide,
  hubInstallationGuide,
  hubShareInvitation,
} from '@capability-hub/contracts';
import { fail } from '@capability-hub/domain/errors';
import type { Express } from 'express';
import { loginRequestSchema, setupHttpRequestSchema } from '@capability-hub/contracts';
import type { HttpContext } from '../context.js';
import { jsonRoute as send } from '../response.js';

/**
 * 匿名入口，注册在 `security.authenticate` 之前，因此任何一条都不得读取 `res.locals.principal`。
 * `/api/hub-share`、`/INSTALL.md`、`/api/hub-mcp-config`、`/connect/mcp` 只交付公开配置与占位变量，
 * 不签发令牌、不授予资源权限；`/auth/setup` 由 `authentication.setup` 判定实例是否尚未初始化，
 * 生产环境还要求与环境变量一致的初始化密钥（否则 403 `SETUP_TOKEN_REQUIRED`），并做 Origin 校验；
 * `/auth/login` 用进程内计数把并发登录压到 4 个（超出 429 `LOGIN_BUSY`），
 * 失败计数与锁定由认证服务负责。
 * `/auth/cli/*` 是 CLI 的设备码轮询，凭 code 与 verifier 匹配，不接受 cookie 身份。
 */
export function registerPublicRoutes(app: Express, { hub, security }: HttpContext): void {
  const { store, blobs, authentication, config } = hub;
  // 首次接入仅交付公开配置和占位变量，不创建令牌、不授予资源权限。
  app.get(
    '/api/hub-share',
    send(() => hubShareInvitation(config.publicUrl)),
  );
  app.get(
    '/INSTALL.md',
    send((_req, res) => {
      res.type('text/markdown').send(hubInstallationGuide(config.publicUrl));
    }),
  );
  app.get(
    '/api/hub-mcp-config',
    send((req) => {
      const query = hubConnectionQuerySchema.parse(req.query);
      return hubMcpConnectionGuide(
        query.client,
        config.publicUrl,
        query.scope,
        query.method,
        query.permission,
      );
    }),
  );
  app.get(
    '/connect/mcp',
    send((req, res) => {
      const query = hubConnectionQuerySchema.parse(req.query);
      const guide = hubMcpConnectionGuide(
        query.client,
        config.publicUrl,
        query.scope,
        query.method,
        query.permission,
      );
      res.type('text/markdown').send(guide.installation_prompt);
    }),
  );
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get(
    '/health/ready',
    send(async () => {
      await store.health();
      await blobs.health();
      return { status: 'ok', database: store.kind, object_storage: blobs.kind };
    }),
  );
  app.get('/api/auth/status', async (_req, res) =>
    res.json({
      initialized: (await store.all('users')).length > 0,
      auth_provider: 'native-rbac',
      oidc_enabled: false,
      setup_token_required: config.production,
    }),
  );
  app.post(
    '/auth/setup',
    send(async (req, res) => {
      security.origin(req);
      const setup = setupHttpRequestSchema.parse(req.body);
      if (config.production && (!config.setupToken || setup.setup_token !== config.setupToken))
        fail(403, 'SETUP_TOKEN_REQUIRED', '首次初始化需要部署方提供的初始化密钥');
      const { setup_token, ...setupBody } = setup;
      const u = await authentication.setup(setupBody);
      await security.startSession(req, res, u);
      return { ok: true };
    }),
  );
  let activeLogins = 0;
  app.post(
    '/auth/login',
    send(async (req, res) => {
      security.origin(req);
      if (activeLogins >= 4) fail(429, 'LOGIN_BUSY', '请稍后重试');
      const b = loginRequestSchema.parse(req.body);
      activeLogins++;
      try {
        const u = await authentication.login(b.username, b.password, req.ip ?? 'unknown');
        await security.startSession(req, res, u);
        return { ok: true };
      } finally {
        activeLogins--;
      }
    }),
  );
  app.post(
    '/auth/cli/request',
    send(async (req) => await hub.cliLogin.request(cliLoginRequestSchema.parse(req.body))),
  );
  app.post(
    '/auth/cli/poll',
    send(async (req) => await hub.cliLogin.poll(pollCliLoginRequestSchema.parse(req.body))),
  );
}
