import { z } from 'zod';
/** 服务端生成的 UUID 主键；跨进程只透传，不解析版本位。 */
export const uuidSchema = z.uuid();
/**
 * 资源 slug：全小写 kebab-case，1–64 字符，不允许空段或首尾连字符。
 * 该值会直接拼进 URL 与安装目录，因此不做大小写或空白归一化，非法写法直接拒绝。
 */
export const assetSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
/** 资源类型二选一：`skill` 为文档型经验，`mcp` 为服务型接入；后续下载与安装形态随之不同。 */
export const assetKindSchema = z.enum(['skill', 'mcp']);
/** 目录分类；`scenario` 必须同时给出场景，其余分类的场景列表必须为空，由发布策略交叉校验。 */
export const assetCategorySchema = z.enum(['general', 'scenario', 'uncategorized']);
const searchTerm = z
  .string()
  .transform((v) => v.normalize('NFKC').trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(128));
/**
 * 关键词数组：每项先 NFKC 归一化、折叠空白后再要求 1–128 字符，整组最多 20 条。
 * 超出上限直接拒绝而不是截断；按小写判重并保留首次出现的写法，重复输入会被静默去掉。
 */
export const keywordsSchema = z
  .array(searchTerm)
  .max(20)
  .transform((values) => {
    const unique = new Map<string, string>();
    for (const value of values) {
      const key = value.toLowerCase();
      if (!unique.has(key)) unique.set(key, value);
    }
    return [...unique.values()];
  });
/**
 * 适用范围：语言、框架与关键词三组各自可选，复用 {@link keywordsSchema} 的归一化与去重规则。
 * 严格模式拒绝未知字段，避免拼写错误悄悄丢掉检索维度。
 */
export const applicabilitySchema = z
  .object({
    languages: keywordsSchema.optional(),
    frameworks: keywordsSchema.optional(),
    keywords: keywordsSchema.optional(),
  })
  .strict();
