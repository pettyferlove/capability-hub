import { z } from 'zod';

const count = z.number().int().nonnegative();

/** 近 7 或 30 个北京时间自然日均包含采样当天。 */
export const resourceActivityQuerySchema = z
  .object({ days: z.enum(['7', '30']).default('7') })
  .strict();

const activityDay = z
  .object({
    date: z.iso.date(),
    first_releases: count,
    repeat_releases: count,
    downloads: count,
    skill_loads: count,
    install_requests: count,
    feedback_pending: count,
    feedback_in_progress: count,
    feedback_resolved: count,
    feedback_declined: count,
  })
  .strict();

/** 反馈按提交日和采样时状态统计，使用按已记录的分发操作分别计数。 */
export const resourceActivityResponseSchema = z
  .object({
    observed_at: z.iso.datetime(),
    daily: z.array(activityDay),
  })
  .strict();

/** 运营总览使用的资源活动快照。 */
export type ResourceActivityResponse = z.infer<typeof resourceActivityResponseSchema>;
