import { z } from 'zod';

const period = z.enum(['today', '7d', '30d', 'all']);
const count = z.number().int().nonnegative();

/** 全部范围只统计仍保留的模型请求。 */
export const tokenUsageQuerySchema = z.object({ period: period.default('all') }).strict();

const metrics = z
  .object({
    requests: count,
    input_tokens: count,
    output_tokens: count,
    unknown_requests: count,
    pending_requests: count,
    partial_input_tokens: count,
    partial_output_tokens: count,
  })
  .strict();
const groups = z.array(metrics.extend({ id: z.string(), label: z.string() }));

/** 总计、趋势和每种分布都来自同一批模型调用，部分回传的计数独立于确认总量。 */
export const tokenUsageResponseSchema = z
  .object({
    period,
    from: z.iso.datetime().nullable(),
    observed_at: z.iso.datetime(),
    granularity: z.enum(['day', 'month']),
    totals: metrics,
    trend: z.array(metrics.extend({ bucket: z.string() })),
    by_agent: groups,
    by_profile: groups,
    by_user: groups,
  })
  .strict();

/** Token 用量页的时间范围。 */
export type TokenUsagePeriod = z.infer<typeof period>;

/** 实例范围内的调用分布。 */
export type TokenUsageResponse = z.infer<typeof tokenUsageResponseSchema>;
