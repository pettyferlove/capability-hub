import { z } from 'zod';

/**
 * 两个业务操作共用的输入：只锁定单个版本。`feedback_id` 在反馈研判里由
 * `registerBusinessOperations` 用 `extend` 提升为必填、在资源审计里被 `omit` 掉，
 * 所以此处只能声明为可选，真正的必填约束落在各操作自己那层。
 */
export const businessInput = z
  .object({
    version_id: z.uuid(),
    feedback_id: z.uuid().optional(),
  })
  .strict();

/**
 * 一次性读取的行区间，行号从 1 开始且两端闭合。`end_line >= start_line` 与「必须落在实际读过
 * 的区间内」由执行阶段校验（越界引用会以 `AI_OUTPUT_INVALID` 拒绝），Schema 本身只限制形态。
 */
export const evidenceSchema = z
  .object({
    /** 归档内相对路径，上限 500 字符，与文件清单的 `path` 对齐。 */
    path: z.string().min(1).max(500),
    start_line: z.number().int().positive(),
    end_line: z.number().int().positive(),
  })
  .strict();

/**
 * 发布申请草稿建议。`category` 为 `scenario` 当且仅当 `scenario_ids` 非空，且每个 ID 都必须
 * 出现在本次 `publication_scenarios` 工具的返回里；不满足即拒绝，不做自动纠正。
 * 这只是建议，不代替人工声明所有权或发布批准。
 */
export const publicationSuggestion = z
  .object({
    category: z.enum(['general', 'scenario', 'uncategorized']),
    /** 已登记的有效场景 ID，去重后最多 20 个。 */
    scenario_ids: z.array(z.uuid()).max(20),
    /**
     * 检索关键词；上限比提示的 3–8 条宽，落盘前只保留前 8 条，避免数量略超就重写整份报告。
     * 保留首次出现的写法，重复项由模型侧自行去除。
     */
    keywords: z
      .array(z.string().trim().min(1).max(128))
      .min(1)
      .max(10)
      .describe('3–8 个检索关键词，按重要性排序，互不包含；用户会搜索的专名或核心能力名词短语'),
    /** 适用对象与用途说明，上限 2000 字符，不得用于声明授权。 */
    purpose: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe('单段纯文本，1–2 句约 80 字：面向谁、解决什么；不换行，不罗列功能或关键词'),
  })
  .strict();

/**
 * 研判报告主体。上限均为硬上限：发现最多 30 条、每条最多 10 处证据、局限最多 30 条；
 * 落盘前实现还会把局限截到 28 条并追加读取覆盖度，因此模型不应依赖填满上限。
 */
export const assessmentSchema = z
  .object({
    summary: z
      .string()
      .min(1)
      .max(4000)
      .describe(
        'Markdown，最多 3 段共约 200 字，段间空一行：首句写结论与风险理由，再写最关键的 1–3 个问题，末句写下一步；不列已读文件或检查范围，不用标题和表格',
      ),
    /** 资源整体风险判断；`unknown` 表示证据不足，不能与 `low` 混用。 */
    risk: z.enum(['low', 'medium', 'high', 'unknown']),
    findings: z
      .array(
        z
          .object({
            title: z
              .string()
              .min(1)
              .max(200)
              .describe('纯文本，不超过 30 字的名词短语，不含行号和句末标点'),
            /** `critical` 表示阻断发布依据；`info` 仅作说明。 */
            severity: z.enum(['info', 'warning', 'critical']),
            explanation: z
              .string()
              .min(1)
              .max(2000)
              .describe(
                'Markdown，1–3 句：现象、影响，以及依据属于事实、推断还是待验证；文件名、命令和变量可用行内代码',
              ),
            recommendation: z
              .string()
              .min(1)
              .max(2000)
              .describe('纯文本，一句可执行动作；多步时每步一行，以「1. 」编号，最多 4 步'),
            evidence: z.array(evidenceSchema).max(10).describe('支撑本项发现的已读行区间'),
          })
          .strict(),
      )
      .max(30),
    limitations: z
      .array(z.string().min(1).max(1000))
      .max(30)
      .describe('每条一句纯文本，只写一项未验证或缺失的事项'),
    suggested_resolution: z
      .string()
      .min(1)
      .max(1800)
      .describe(
        '纯文本处理说明（反馈研判会写入反馈供提交者查看，资源审计写给维护者）：首句写结论与原因，随后最多 3 行以「1. 」编号的步骤，约 300 字内',
      ),
  })
  .strict();

/**
 * 人工确认回执。只有「已采纳 + 目标反馈存在 + 当前主体具备维护权限」三者同时成立时
 * `apply_feedback` 才会写入处理建议，否则该步骤以 `AI_CONFLICT` 失败。
 */
export const businessDecision = z
  .object({
    approved: z.boolean().describe('采纳本次研判'),
    comment: z.string().trim().max(2000).default('').describe('人工意见'),
    apply_feedback: z
      .boolean()
      .default(false)
      .describe('将反馈标记为处理中并写入建议（需要维护权限）'),
  })
  .strict();

/**
 * 调查阶段传给人工确认步骤的中间结果，必须先落盘为 artifact 才能进入确认，否则恢复时无语义
 * 依据。`content_digest`/`feedback_revision` 是确认阶段的乐观锁基准：反馈在此期间被改动即拒绝写入。
 */
export const researchSchema = z
  .object({
    ...businessInput.shape,
    /** 采集时的维护权限快照；为 false 时确认阶段不允许回写反馈。 */
    can_apply_feedback: z.boolean(),
    /** 无反馈时为 null；写入处理建议时用它与最新修订比对。 */
    feedback_revision: z.number().int().positive().nullable(),
    content_digest: z.string(),
    assessment: assessmentSchema,
    inspected: z.array(evidenceSchema),
  })
  .strict();

/** 最终结果：调查结果 + 人工决定，外加确认阶段的成果 artifact 引用。 */
export const businessResult = researchSchema
  .extend({
    approved: z.boolean(),
    comment: z.string(),
    feedback_applied: z.boolean(),
    /** 确认后成果的 artifact ID；同一执行重复确认会复用原成果而不是新建。 */
    artifact_id: z.string(),
  })
  .strict();
