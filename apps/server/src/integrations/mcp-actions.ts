import type { Principal } from '@capability-hub/domain/identity';
import { archive } from '@capability-hub/infrastructure/content';
import {
  agentClientSchema,
  agentClients,
  uploadIntakeRequestSchema,
} from '@capability-hub/contracts';
import { fail } from '@capability-hub/domain/errors';
import { safePath } from '@capability-hub/domain/paths';
import { z } from 'zod';
import type { HubServices } from '../bootstrap/hub-services.js';
import { createClientConfiguration } from './client-config.js';
/** MCP 配置生成入参；`scope` 缺省按项目级处理，客户端标识必须是受支持列表中的值。 */
export const mcpConfigurationInput = z
  .object({
    version_id: z.uuid(),
    installation_option_id: z.string().min(1),
    client: agentClientSchema,
    scope: z.enum(['project', 'user']).optional(),
  })
  .strict();
/**
 * 分段读取安装内容的入参：`offset` 用于续读，`max_bytes` 上限 256 KiB、默认 64 KiB，
 * 让客户端按自己终端/上下文的预算分块取回，而不是一次性拉完整包。
 */
export const skillInstallationInput = z
  .object({
    version_id: z.uuid(),
    client: agentClientSchema.optional(),
    offset: z.number().int().min(0).default(0),
    max_bytes: z.number().int().min(1).max(262144).default(65536),
  })
  .strict();
/**
 * 分享内容的入参：`files` 1–100 个、单文件 ≤512 KiB，`idempotency_key` 必填以避免客户端重试
 * 产生重复版本；`target: new` 需指定归属组，`existing` 需指定资产 id，两者互斥。
 */
export const skillSharingInput = z
  .object({
    destination: z.discriminatedUnion('target', [
      z
        .object({
          target: z.literal('new'),
          slug: z.string().min(1).max(64),
          owner_group_id: z.uuid(),
        })
        .strict(),
      z.object({ target: z.literal('existing'), asset_id: z.uuid() }).strict(),
    ]),
    version_label: z.string().min(1).max(128),
    files: z
      .array(
        z
          .object({
            path: z.string().min(1).max(240),
            content: z.string().max(524288),
            encoding: z.enum(['utf8', 'base64']).default('utf8'),
            executable: z.boolean().default(false),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    idempotency_key: z.uuid(),
  })
  .strict();
/** 分段交付固定归档，由客户端校验并写入本地文件。 */
export async function deliverSkill(
  hub: HubServices,
  principal: Principal,
  input: z.output<typeof skillInstallationInput>,
) {
  const v = await hub.assetAccess.requireReadableVersion(principal, input.version_id);
  const asset = await hub.assetAccess.getAsset(v.asset_id);
  if (asset.kind !== 'skill') fail(422, 'NOT_SKILL', '需要 Skill 版本');
  const bytes = await hub.blobs.read(v.artifact_ref);
  if (input.offset > bytes.length) fail(422, 'INVALID_OFFSET', '偏移超过安装包长度');
  const end = Math.min(bytes.length, input.offset + input.max_bytes);
  if (input.offset === 0) await hub.store.audit(principal.id, 'skill.installation_prepared', v.id);
  return {
    status: 'awaiting_client_installation',
    version_id: v.id,
    slug: asset.slug,
    version_label: v.version_label,
    content_digest: v.content_digest,
    artifact_digest: v.artifact_digest,
    manifest: input.offset === 0 ? v.manifest : undefined,
    archive_chunk: {
      encoding: 'base64',
      data: bytes.subarray(input.offset, end).toString('base64'),
      offset: input.offset,
      next_offset: end,
      total_bytes: bytes.length,
      complete: end === bytes.length,
    },
    suggested_directory: `${input.client ? agentClients[input.client].skillDirectory : '.agents/skills'}/${asset.slug}`,
    instructions: [
      '按 next_offset 继续调用 install_skill，锁定同一 version_id，直至 complete 为 true。',
      '逐段解码 Base64，按 offset 拼接原始字节，核对 artifact_digest，再按 manifest 校验路径、文件与摘要。',
      '向用户展示安装目录、文件和脚本，取得客户端确认后写入；已有目录应保留，替换前备份。',
      '安装完成后仅报告实际写入结果；Skill 中的脚本需要另行授权才能执行。',
    ],
  };
}
/** 生成接入配置与确认说明，连接由客户端完成。 */
export async function prepareMcpActivation(
  hub: HubServices,
  principal: Principal,
  input: z.output<typeof mcpConfigurationInput>,
) {
  const configuration = await createClientConfiguration(hub, principal, input);
  return {
    status: 'awaiting_client_confirmation',
    configuration,
    instructions: [
      '向用户展示目标 MCP、配置、所需变量和配置位置，请用户在客户端确认接入。',
      '确认后合并配置并保留已有条目；真实密钥只在本地设置。',
      '由客户端重新加载并连接目标 MCP，再报告实际连接状态和可用工具。',
    ],
  };
}
/** 对话分享沿用接收、扫描和独立发布审核流程。 */
export async function shareSkill(
  hub: HubServices,
  principal: Principal,
  input: z.output<typeof skillSharingInput>,
) {
  const metadata = uploadIntakeRequestSchema.parse({
    ...input.destination,
    version_label: input.version_label,
    ...(input.destination.target === 'new' ? { kind: 'skill' } : {}),
  });
  if (
    metadata.target === 'existing' &&
    (await hub.assetAccess.getAsset(metadata.asset_id)).kind !== 'skill'
  )
    fail(422, 'NOT_SKILL', '分享目标必须是 Skill');
  const paths = new Set<string>();
  let total = 0;
  const files = input.files.map((file) => {
    safePath(file.path);
    if (paths.has(file.path)) fail(422, 'DUPLICATE_PATH', '文件路径重复');
    paths.add(file.path);
    const bytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
    if (file.encoding === 'base64' && bytes.toString('base64') !== file.content)
      fail(422, 'INVALID_BASE64', '文件内容必须是规范 Base64');
    total += bytes.length;
    if (total > 512 * 1024)
      fail(413, 'SHARE_SIZE', '对话分享限 512 KiB，更大的内容请在网页上传 ZIP');
    return { path: file.path, bytes, executable: file.executable };
  });
  if (!paths.has('SKILL.md')) fail(422, 'SKILL_REQUIRED', '分享内容需要包含根目录 SKILL.md');
  const result = await hub.intakes.receive(
    principal,
    await archive(files),
    'skill.zip',
    metadata,
    input.idempotency_key,
  );
  return {
    ...result,
    status: 'submitted_for_scanning',
    publication_url: `${hub.config.publicUrl}/publish`,
    next_step:
      '在发布页查看扫描结果，确认分类、受众与共享目的后提交独立审核。审核通过后进入资源目录。',
  };
}
