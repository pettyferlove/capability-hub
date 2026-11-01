import { z } from 'zod';
export const uuidSchema = z.uuid();
export const assetSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const assetKindSchema = z.enum(['skill', 'mcp']);
export const assetCategorySchema = z.enum(['general', 'scenario', 'uncategorized']);
const searchTerm = z
  .string()
  .transform((v) => v.normalize('NFKC').trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(1).max(128));
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
export const applicabilitySchema = z
  .object({
    languages: keywordsSchema.optional(),
    frameworks: keywordsSchema.optional(),
    keywords: keywordsSchema.optional(),
  })
  .strict();
