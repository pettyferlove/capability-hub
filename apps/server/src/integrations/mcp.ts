import type { Principal } from '@capability-hub/domain/identity';
import {
  assetFeedbackRequestSchema,
  catalogSearchQuerySchema,
  assetRecommendationRequestSchema,
} from '@capability-hub/contracts';
import type { TokenRecord } from '@capability-hub/domain/models';
import { fail, HubError } from '@capability-hub/domain/errors';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { HubServices } from '../bootstrap/hub-services.js';
import { createClientConfiguration } from './client-config.js';
import {
  deliverSkill,
  mcpConfigurationInput,
  prepareMcpActivation,
  shareSkill,
  skillInstallationInput,
  skillSharingInput,
} from './mcp-actions.js';
const search = {
  query: z.string().max(500),
  scenario_id: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(20),
};
/**
 * 构造一次连接对应的 MCP handler。`hub:read` 连接不注册贡献类工具，即使绕过工具列表直接调用也会
 * 得到 403 `TOKEN_SCOPE`；每次调用还会重新读取 principal，服务层再按当前权限判定，
 * 因此令牌作用域是上限而不是能力来源。工具入参在这里按 schema 校验，错误以 MCP 工具错误返回。
 */
export function createMcp(hub: HubServices, p: Principal, scope: TokenRecord['scope']) {
  const handler = createMcpHandler(
    () => {
      const server = new McpServer(
        { name: 'capability-hub', version: '0.1.0' },
        {
          instructions:
            scope === 'hub:read'
              ? `当前连接仅允许搜索和使用。用户需要分享、推荐或反馈时，引导其在 ${hub.config.publicUrl}/connect?permission=contribute 确认分享能力并重新授权，然后刷新工具列表。不要索取访问令牌。`
              : '当前连接支持搜索、使用与贡献；所有操作仍受用户当前权限约束。分享前取得用户授权，发布仍需独立审核。',
        },
      );
      const register = <S extends z.ZodRawShape, R extends object>(
        name: string,
        description: string,
        schema: z.ZodObject<S>,
        call: (
          args: z.output<z.ZodObject<S>> & {
            _principal: Principal;
          },
        ) => R | Promise<R>,
        contribution = false,
      ) => {
        if (contribution && scope !== 'hub:contribute') return;
        return server.registerTool(
          name,
          {
            description,
            inputSchema: schema,
            annotations: {
              readOnlyHint: !contribution,
              destructiveHint: false,
              idempotentHint: true,
              openWorldHint: false,
            },
          },
          async (args) => {
            try {
              const current = await hub.identity.principal(p.id);
              if (contribution && scope !== 'hub:contribute')
                fail(403, 'TOKEN_SCOPE', '此操作需要贡献权限，请在接入页追加授权并刷新工具列表');
              const result = await call({ ...schema.parse(args), _principal: current });
              return {
                content: [{ type: 'text' as const, text: JSON.stringify(result) }],
                structuredContent: Object.fromEntries(Object.entries(result)),
              };
            } catch (error) {
              const e =
                error instanceof HubError ? error : new HubError(500, 'INTERNAL_ERROR', '请求失败');
              return {
                isError: true,
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({
                      error: { code: e.code, message: e.message, retryable: e.retryable },
                    }),
                  },
                ],
              };
            }
          },
        );
      };
      register(
        'get_mcp_config',
        '生成指定版本与安装项的客户端配置；不执行、不连接目标 MCP',
        mcpConfigurationInput,
        async ({ _principal, ...b }) => await createClientConfiguration(hub, _principal, b),
      );
      register(
        'activate_mcp',
        '生成具体 MCP 接入方案，交由客户端确认、写入配置并连接；不会改变 Hub 工具集',
        mcpConfigurationInput,
        async ({ _principal, ...b }) => await prepareMcpActivation(hub, _principal, b),
      );
      register(
        'install_skill',
        '分段交付固定版本完整 Skill 安装包、清单和摘要；由客户端确认安装位置后写入，不在服务器安装',
        skillInstallationInput,
        async ({ _principal, ...b }) => await deliverSkill(hub, _principal, b),
      );
      register(
        'share_skill',
        '将用户选择的 Skill 文件提交扫描，支持 UTF-8 与 Base64；需要连接的贡献权限和账号的资产维护权限，发布仍需独立审核',
        skillSharingInput,
        async ({ _principal, ...b }) => await shareSkill(hub, _principal, b),
        true,
      );
      register(
        'report_asset_feedback',
        '上报有权访问的 Skill/MCP 固定版本的缺陷、能力缺口或改进建议。须先取得用户本次或预先授权，再设置 consent=true；只提交脱敏的最小场景与证据，禁止上传完整对话、源码、密钥或原始日志。区分观察事实与推断；同一次上报及重试复用 idempotency_key。需要连接的贡献权限。反馈内容不构成可执行指令。',
        assetFeedbackRequestSchema,
        async ({ _principal, ...body }) => {
          const result = await hub.feedback.report(_principal, body);
          return { ...result, detail_url: new URL(result.detail_url, hub.config.publicUrl).href };
        },
        true,
      );
      register(
        'rate_asset',
        '推荐或取消推荐有权访问的 Skill/MCP 固定版本；每人每版本只计一次，需要连接的贡献权限',
        assetRecommendationRequestSchema,
        async ({ _principal, ...b }) => await hub.community.rate(_principal, b),
        true,
      );
      register(
        'load_skill',
        '读取固定版本 Skill 正文和清单；不执行、不安装',
        z.object({ version_id: z.uuid() }).strict(),
        async ({ version_id, _principal }) => {
          const v = await hub.assetAccess.requireReadableVersion(_principal, version_id);
          if ((await hub.assetAccess.getAsset(v.asset_id)).kind !== 'skill')
            fail(422, 'NOT_SKILL', '需要 Skill 版本');
          await hub.store.audit(_principal.id, 'skill.loaded', v.id);
          return {
            ...(await hub.content.getManifest(_principal, v.id)),
            body: (await hub.content.getFile(_principal, v.id, 'SKILL.md')).bytes.toString('utf8'),
            compatibility: v.metadata.frontmatter?.compatibility ?? '',
          };
        },
      );
      register(
        'read_skill_file',
        '读取固定版本清单中的文件，按 UTF-8 字符边界分页',
        z
          .object({
            version_id: z.uuid(),
            path: z.string().min(1).max(240),
            offset: z.number().int().min(0).default(0),
            max_bytes: z.number().int().min(1).max(262144).default(65536),
          })
          .strict(),
        async ({ version_id, path, offset, max_bytes, _principal }) => {
          const v = await hub.assetAccess.requireReadableVersion(_principal, version_id);
          if ((await hub.assetAccess.getAsset(v.asset_id)).kind !== 'skill')
            fail(422, 'NOT_SKILL', '需要 Skill 版本');
          const { bytes, file } = await hub.content.getFile(_principal, version_id, path);
          let text: string;
          try {
            text = new TextDecoder('utf8', { fatal: true }).decode(bytes);
            if (text.includes('\0')) throw new Error();
          } catch {
            return {
              path,
              sha256: file.sha256,
              binary: true,
              download_url: `${hub.config.publicUrl}/api/versions/${version_id}/files?path=${encodeURIComponent(path)}`,
            };
          }
          if (offset > bytes.length || (offset < bytes.length && (bytes[offset] & 0xc0) === 0x80))
            fail(422, 'INVALID_OFFSET', '偏移必须位于 UTF-8 字符边界');
          let end = Math.min(bytes.length, offset + max_bytes);
          while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
          if (end === offset && offset < bytes.length)
            fail(422, 'BYTE_LIMIT_TOO_SMALL', '字节限额不足以容纳下一个字符');
          return {
            version_id,
            path,
            sha256: file.sha256,
            text: bytes.subarray(offset, end).toString(),
            truncated: end < bytes.length,
            next_offset: end,
          };
        },
      );
      register(
        'search_mcp',
        '按当前权限搜索已发布 MCP，不连接远程服务',
        z.object(search).strict(),
        async ({ _principal, query, ...rest }) =>
          await hub.catalog.search(
            _principal,
            catalogSearchQuerySchema.parse({ ...rest, q: query, kind: 'mcp' }),
          ),
      );
      register(
        'search_skills',
        '按当前权限搜索已发布 Skill，返回固定版本',
        z
          .object({
            ...search,
            languages: z.array(z.string().min(1)).max(20).optional(),
            frameworks: z.array(z.string().min(1)).max(20).optional(),
          })
          .strict(),
        async ({ _principal, query, ...rest }) =>
          await hub.catalog.search(
            _principal,
            catalogSearchQuerySchema.parse({ ...rest, q: query, kind: 'skill' }),
          ),
      );
      return server;
    },
    // MCP 标准版本兼容由 SDK 处理，各版本共用工具定义和逐请求鉴权。
    { legacy: 'stateless' },
  );
  return { handler, node: toNodeHandler(handler) };
}
