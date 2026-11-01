import { z } from 'zod';
import { assetSlugSchema, manifestSchema } from '@capability-hub/contracts';

const id = z.uuid();
const text = z.string();
const digest = text.regex(/^sha256:[a-f0-9]{64}$/);
const option = z.looseObject({ option_id: text, supported: z.boolean() });
/** 资源摘要。用 loose 解析：多出的字段忽略，缺字段才算协议不兼容。 */
export const assetSchema = z.looseObject({
  asset_id: id,
  slug: assetSlugSchema,
  kind: z.enum(['skill', 'mcp']),
  description: text,
  current_release: z.looseObject({ version_id: id, version_label: text }),
  installation_options: z.array(option),
});
/** 搜索响应；`total` 是命中总数，`items` 可能被分页截断。 */
export const searchSchema = z.looseObject({
  items: z.array(assetSchema),
  total: z.number().int().nonnegative(),
});
/** 版本列表，按 Hub 返回顺序使用；CLI 只按 `version_label` 精确匹配。 */
export const versionsSchema = z.array(z.looseObject({ version_id: id, version_label: text }));
/** 安装项列表（含未支持的项），供 CLI 判断是否必须显式 `--option`。 */
export const optionsSchema = z.object({ installation_options: z.array(option) });
/** 生成好的客户端配置文本与所需变量说明，由 CLI 原样打印、不落盘。 */
export const configurationSchema = z.object({
  text,
  target_file: text,
  notes: z.array(text),
  required_variables: z.array(z.object({ instruction: text })),
});
/** 版本清单与两个摘要；摘要用于安装前后比对，`release_id` 尚未发布时为 null。 */
export const manifestResponseSchema = z.object({
  manifest: manifestSchema,
  content_digest: digest,
  artifact_digest: digest,
  release_id: id.nullable(),
});
/** 设备码登录首步：`expires_in` 上限 600 秒，CLI 用它决定轮询截止时间。 */
export const loginResponseSchema = z.object({
  verification_uri: z.url(),
  user_code: text.regex(/^[A-F0-9]{8}$/),
  device_code: text.regex(/^[A-Za-z0-9_-]{43}$/),
  expires_in: z.number().int().positive().max(600),
});
/** 轮询结果：只有 `complete` 才携带令牌，`pending` 时 CLI 继续等待。 */
export const pollResponseSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('complete'), token: text.regex(/^\S+$/) }),
]);
