import { z } from 'zod';
import { cliCompatibility } from './hub-version.js';

/** 三处安装说明使用同一实例要求，不探测本机版本。 */
export const cliVersionGuidance = `本实例推荐 CLI ${cliCompatibility.recommended}，最低 ${cliCompatibility.minimum}（${cliCompatibility.minimum_reason}）。若 --cli-version 显示低于最低版本，使用同一安装命令升级。`;

/** 网页与公开 Markdown 共用的 CLI 安装步骤，不包含仓库凭据。 */
export const cliInstallationResponseSchema = z.strictObject({
  registry_url: z.url().nullable(),
  cli: z.strictObject({
    recommended: z.string(),
    minimum: z.string(),
    minimum_reason: z.string(),
  }),
  steps: z.array(
    z.strictObject({
      title: z.string(),
      description: z.string(),
      command: z.string().optional(),
      optional: z.boolean().optional(),
    }),
  ),
  troubleshooting: z.array(z.string()),
});

/** {@link cliInstallationResponseSchema} 的输出侧类型。 */
export type CliInstallationResponse = z.infer<typeof cliInstallationResponseSchema>;

/** 单引号转义保留 POSIX Shell 的参数边界，不展开参数中的表达式。 */
export const shellArgument = (value: string) => `'${value.replaceAll("'", "'\"'\"'")}'`;

/** 私有仓库地址由部署配置校验；未配置时遵循使用者的 npm 配置。 */
export function cliInstallationGuide(origin: string, registry?: string): CliInstallationResponse {
  const registryOptions = registry
    ? ` --registry=${shellArgument(registry)} --@capability-hub:registry=${shellArgument(registry)}`
    : '';
  return {
    registry_url: registry ?? null,
    cli: cliCompatibility,
    steps: [
      {
        title: '准备运行环境',
        description:
          'CLI 支持 Node.js 22.12.0 及以上版本（含 24、26 LTS），建议使用最新补丁版本；Node.js 22 于 2027-04-30 结束维护。在运行 CLI 或 Agent 的同一环境准备 Node.js 和 npm；独立安装 CLI 无需 pnpm 或项目源码。该环境需要能访问 npm 仓库和 Hub。',
        command: 'node --version\nnpm --version',
      },
      ...(registry
        ? [
            {
              title: '仓库需要认证时',
              description:
                '允许匿名下载时跳过此步。需要认证时，按仓库要求完成 npm 登录；不支持浏览器登录的仓库可在下方命令末尾加 --auth-type=legacy。使用 Token 的仓库请按部署方说明，将只读凭据配置到用户级 .npmrc，并限定到仓库的主机和路径。不要将真实凭据写入项目、命令或对话。npm 仓库凭据与 Hub 授权独立。',
              command: `npm login --scope=@capability-hub --registry=${shellArgument(registry)}`,
              optional: true,
            },
          ]
        : []),
      {
        title: '安装并验证 CLI',
        description: `${cliVersionGuidance} 如需固定 CLI 版本，将 @latest 换成具体版本号；--version 只用于指定资源版本。`,
        command: `npm install -g @capability-hub/cli@latest --prefer-online${registryOptions}\ncapability-hub --cli-version`,
      },
      {
        title: '升级遇到 ETARGET',
        description:
          '先用带 --prefer-online 的安装命令重试，再用下方命令查询同一仓库的可用版本。若缺少目标版本，请核对版本号、发布状态和代理是否已同步；若版本可见但安装仍失败，可用 --cache 指定空目录重试，最后才考虑 npm cache clean --force（清空本机 npm 缓存）。',
        command: `npm view @capability-hub/cli versions --prefer-online --global${registryOptions}`,
        optional: true,
      },
      {
        title: '首次使用或授权失效时登录 CLI',
        description:
          '公开 Skill 的 add 无需登录；已有当前实例的有效登录也可跳过此步。团队资源可在浏览器核对授权码并批准 CLI 登录，无需本机回调。connect 用于预设客户端的 MCP 接入助手，与 login 独立授权，无需依次执行。',
        command: `capability-hub login --url ${shellArgument(new URL(origin).origin)} --no-interactive`,
        optional: true,
      },
      {
        title: '验证 CLI 访问',
        description:
          '独立 CLI 搜索和安装 Skill 无需客户端标识。查询成功即说明 CLI 可访问当前实例，空列表也算成功；安装 CLI 不代表已授权，CLI 可访问不代表 Agent 的 MCP 已连接。',
        command: `capability-hub search --url ${shellArgument(new URL(origin).origin)} --json --no-interactive`,
      },
    ],
    troubleshooting: [
      '连接超时或域名无法解析：确认当前终端、容器或远程开发环境能够访问 npm 仓库；内网仓库还需接入相应网络或 VPN。',
      '401 / 403：核对仓库认证是否有效、账号是否有包读取权限；不能用 Hub 访问令牌代替 npm 凭据。',
      registry
        ? '404 / 找不到包：确认 CLI 包已发布到本实例配置的 npm 仓库。'
        : '404 / 找不到包：用 npm config get @capability-hub:registry 和 npm config get registry 核对仓库地址，再确认 CLI 包已发布。',
      '找不到 capability-hub 命令：检查 npm prefix -g 对应的可执行目录是否在 PATH 中；切换 Node.js 版本或运行环境后需重新检查安装位置。',
    ],
  };
}
