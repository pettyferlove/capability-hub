import { AiError, type OperationRegistry } from '@capability-hub/ai';
import { createStep, createWorkflow } from '@capability-hub/ai/mastra';
import type { AgentEvidenceService, PublicationQueryService } from '@capability-hub/application';
import { z } from 'zod';
import { publicationReviewPrompts } from './prompts.js';
import { assessmentSchema, evidenceSchema } from './schemas.js';
import { businessTools, mergeReadRanges, validateCitations } from './tools.js';

const input = z.strictObject({ publication_request_id: z.uuid() });
const policy = z.strictObject({
  audience: z.array(z.string()),
  visibility_label: z.string(),
  category: z.string(),
  scenario_ids: z.array(z.string()),
  purpose: z.string(),
  requires_api_key: z.boolean().nullable(),
});
const snapshotSchema = z.strictObject({
  publication_request_id: z.uuid(),
  request_revision: z.number().int(),
  policy_digest: z.string(),
  version_id: z.uuid(),
  content_digest: z.string(),
  base_release_id: z.uuid().nullable(),
  scan_run_id: z.uuid(),
  ruleset_version: z.string(),
  before: policy.nullable(),
  proposed: policy,
  added_audience_label: z.string(),
  removed_audience_label: z.string(),
  proposed_scenarios: z.array(z.strictObject({ name: z.string(), description: z.string() })),
  nomination_reason: z.string().nullable(),
  changed_files: z.number().int(),
});
const warning = z.strictObject({
  finding_id: z.string(),
  file: z.string(),
  line: z.number().int(),
  evidence_summary: z.string(),
});
const questions = z
  .array(
    z.strictObject({
      finding_id: z.string(),
      question: z.string().trim().min(1).max(500),
    }),
  )
  .max(30);
const assessment = assessmentSchema.extend({
  suggested_resolution: z
    .string()
    .trim()
    .min(1)
    .max(1800)
    .describe('给审核员的一项核对动作；无特别事项时说明按既有流程复核，不作决定'),
  findings: z
    .array(
      assessmentSchema.shape.findings.element.extend({
        evidence: z.array(evidenceSchema).min(1).max(10),
      }),
    )
    .max(30)
    .describe('仅列已读文件支持的具体问题，无则为空。策略差异在摘要中说明。'),
  warning_questions: questions.describe('只针对已查阅的冻结告警提出尚待核实的问题，无则为空'),
});
const result = z.strictObject({
  snapshot: snapshotSchema,
  assessment,
  warnings: z.array(warning),
  inspected: z.array(evidenceSchema),
});
const page = z.strictObject({ offset: z.number().int().nonnegative().default(0) });

type Review = Awaited<ReturnType<PublicationQueryService['agentEvidence']>>;

function reviewPolicy(record: Review | NonNullable<Review['current']>['release'], label: string) {
  return {
    audience: record.distribution.audience,
    visibility_label: label,
    category: record.category,
    scenario_ids: record.scenario_ids,
    purpose: record.source_consent.purpose,
    requires_api_key: record.requires_api_key ?? null,
  };
}

/** 审核简报在当前申请仍可独立审核时完成，整个工作流只有只读取证工具。 */
export function registerPublicationReview(
  registry: OperationRegistry,
  evidence: AgentEvidenceService,
  publications: PublicationQueryService,
) {
  const id = 'publication-review';
  registry.register({
    id,
    version: '2',
    title: '发布审核助手',
    description: '核对本次申请的分发变化、资源声明与扫描告警，为审核员生成只读简报。',
    input,
    output: result,
    interactions: {},
    create: (context) => {
      const investigate = createStep({
        id: 'investigate',
        inputSchema: input,
        outputSchema: result,
        execute: ({ inputData }) =>
          context.step('investigate', async () => {
            const review = await publications.agentEvidence(
              context.ownerId,
              inputData.publication_request_id,
            );
            const changes = review.diff.filter((file) => file.status !== 'unchanged');
            const snapshot = snapshotSchema.parse({
              publication_request_id: review.id,
              request_revision: review.revision,
              version_id: review.version_id,
              content_digest: review.content_digest,
              policy_digest: review.policy_digest,
              base_release_id: review.base_release_id,
              scan_run_id: review.scan_run_id,
              ruleset_version: review.ruleset_version,
              before: review.current
                ? reviewPolicy(review.current.release, review.current.visibility_label)
                : null,
              proposed: reviewPolicy(review, review.visibility_label),
              added_audience_label: review.added_audience_label,
              removed_audience_label: review.removed_audience_label,
              proposed_scenarios: review.proposed_scenarios ?? [],
              nomination_reason: review.nomination?.reason ?? null,
              changed_files: changes.length,
            });
            const warnings = (review.scan?.findings ?? [])
              .filter((f) => f.severity === 'warning')
              .map((f) => ({
                finding_id: f.id,
                file: f.file,
                line: f.line,
                evidence_summary: f.evidence_summary,
              }));
            const entry = review.asset.kind === 'skill' ? 'SKILL.md' : 'server.json';
            const { tools, inspected } = businessTools(context, evidence, review.version_id);
            const seenWarnings = new Set<string>();
            const investigation = await context.agent({
              id,
              max_steps: 64,
              instructions: publicationReviewPrompts.investigate,
              prompt: JSON.stringify({
                snapshot,
                entry,
                source_consent: review.source_consent,
                warning_count: warnings.length,
              }),
              tools: {
                read_file: tools.read_file,
                list_files: tools.list_files,
                search_files: tools.search_files,
                ...(review.asset.kind === 'mcp' && { mcp_declarations: tools.mcp_declarations }),
                review_warnings: context.tool({
                  id: 'review-warnings',
                  description: '分页读取本申请固定扫描的告警，每页 20 项。',
                  input: page,
                  output: z.json(),
                  execute: ({ offset }) => {
                    const items = warnings.slice(offset, offset + 20);
                    for (const item of items) seenWarnings.add(item.finding_id);
                    return Promise.resolve({
                      items,
                      next_offset: offset + 20 < warnings.length ? offset + 20 : null,
                    });
                  },
                }),
                review_changes: context.tool({
                  id: 'review-changes',
                  description: '分页读取申请提交时基线与候选之间的文件差异，每页 50 项。',
                  input: page,
                  output: z.json(),
                  execute: ({ offset }) =>
                    Promise.resolve({
                      items: changes.slice(offset, offset + 50),
                      next_offset: offset + 50 < changes.length ? offset + 50 : null,
                    }),
                }),
              },
            });
            if (!inspected.some((item) => item.path === entry))
              throw new AiError('AI_OUTPUT_INVALID', '审核简报缺少入口文件的读取证据');
            if (warnings.length && !seenWarnings.size)
              throw new AiError('AI_OUTPUT_INVALID', '审核简报未查阅本次扫描的告警');
            const ranges = mergeReadRanges(inspected);
            const report = await context.step('assessment', () =>
              context.structured(
                {
                  id: 'assessment',
                  instructions: publicationReviewPrompts.report,
                  prompt: JSON.stringify({
                    snapshot,
                    source_consent: {
                      audience: review.source_consent.audience,
                      purpose: review.source_consent.purpose,
                    },
                    investigation: investigation.text,
                    inspected: ranges,
                    warning_count: warnings.length,
                    warning_ids: [...seenWarnings],
                  }),
                },
                assessment,
              ),
            );
            validateCitations(report.findings, ranges);
            const mentioned = new Set<string>();
            for (const item of report.warning_questions) {
              if (!seenWarnings.has(item.finding_id) || mentioned.has(item.finding_id))
                throw new AiError('AI_OUTPUT_INVALID', '审核简报引用未知、未查阅或重复的告警');
              mentioned.add(item.finding_id);
            }
            if (review.asset.kind === 'mcp') {
              report.limitations = report.limitations.slice(0, 29);
              report.limitations.push(
                '仅检查静态声明，未安装软件包、连接远端服务或执行 MCP 工具。',
              );
            }
            return { snapshot, assessment: report, warnings, inspected: ranges };
          }),
      });
      return createWorkflow({
        id,
        inputSchema: input,
        outputSchema: result,
        options: { autoRestartActiveRuns: false },
        retryConfig: { attempts: 0, delay: 0 },
      })
        .then(investigate)
        .commit();
    },
  });
}
