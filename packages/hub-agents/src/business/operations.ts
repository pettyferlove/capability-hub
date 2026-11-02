import { AiError, type OperationRegistry } from '@capability-hub/ai';
import { createStep, createWorkflow } from '@capability-hub/ai/mastra';
import type { AgentEvidenceService } from '@capability-hub/application';
import { z } from 'zod';
import { feedbackTriagePrompts, resourceAuditPrompts } from './prompts.js';
import {
  assessmentSchema,
  publicationSuggestion,
  businessDecision,
  businessInput,
  businessResult,
  researchSchema,
} from './schemas.js';
import { businessTools, mergeReadRanges, validateCitations } from './tools.js';

/**
 * 注册资源审计（`resource-audit`）与反馈研判（`feedback-triage`）两个操作。流程固定为
 * 「调查 → 人工确认 → 记录」三段，任何一段都不能跳过：
 * - 调查阶段必须实际读过入口文件（Skill 的 `SKILL.md`、MCP 的 `server.json`），反馈研判还必须
 *   读过目标反馈，否则以 `AI_OUTPUT_INVALID` 失败；
 * - 报告引用必须落在已读行区间内，发布建议只能引用本次工具返回过的场景 ID；
 * - 人工确认是唯一的暂停点（`human-review`），回写反馈走 `context.effect` 幂等效果，落库前
 *   重新校验维护权限与反馈修订号，二者任一变化即 `AI_FORBIDDEN` / `AI_CONFLICT`。
 *
 * 操作本身不修改资源、不发布版本、不关闭反馈，这些仍由人工走各自的 HTTP 命令完成。
 * `service` 与人工共用同一权限边界，agent 拿不到额外授权。
 */
export function registerBusinessOperations(
  registry: OperationRegistry,
  service: AgentEvidenceService,
) {
  for (const kind of ['resource-audit', 'feedback-triage'] as const) {
    const prompts = kind === 'resource-audit' ? resourceAuditPrompts : feedbackTriagePrompts;
    const input =
      kind === 'feedback-triage'
        ? businessInput.extend({ feedback_id: z.uuid() })
        : businessInput.omit({ feedback_id: true });
    const reportSchema =
      kind === 'resource-audit'
        ? assessmentSchema.extend({ publication_suggestion: publicationSuggestion })
        : assessmentSchema;
    const researchOutput = researchSchema.extend({ assessment: reportSchema });
    const resultSchema = businessResult.extend({ assessment: reportSchema });
    registry.register({
      id: kind,
      version: kind === 'resource-audit' ? '6' : '4',
      title: kind === 'resource-audit' ? '资源审计' : '反馈研判',
      description: '自主查阅固定版本证据，形成可追溯建议并等待人工确认。',
      input,
      output: resultSchema,
      interactions: { 'human-review': businessDecision },
      create: (context) => {
        const research = createStep({
          id: 'investigate',
          inputSchema: input,
          outputSchema: researchOutput,
          execute: ({ inputData }) =>
            context.step('investigate', async () => {
              const target = businessInput.parse(inputData);
              const overview = await service.overview(context.ownerId, target.version_id);
              const feedback = target.feedback_id
                ? await service.feedbackTarget(context.ownerId, target.feedback_id)
                : undefined;
              if (feedback && feedback.version_id !== target.version_id)
                throw new AiError('AI_CONFLICT', '反馈与资源版本不匹配');
              const { tools, inspected, evidence } = businessTools(
                context,
                service,
                target.version_id,
                target.feedback_id,
              );
              const investigation = await context.agent({
                id: kind,
                instructions: prompts.investigate,
                max_steps: 64,
                tools,
                prompt: `目标：${overview.slug}，版本 ${overview.version_label}。入口：${overview.entry_file}。先调用工具读取证据。`,
              });
              if (!inspected.some((item) => item.path === overview.entry_file))
                throw new AiError('AI_OUTPUT_INVALID', '研判未读取资源入口文件，不能形成审计结论');
              if (target.feedback_id && !evidence.feedbackRead)
                throw new AiError('AI_OUTPUT_INVALID', '研判未读取反馈证据');
              const audit = kind === 'resource-audit';
              const readRanges = mergeReadRanges(inspected);
              const assessment = await context.step('assessment', () =>
                context.structured(
                  {
                    id: 'assessment',
                    instructions: prompts.report,
                    prompt: JSON.stringify({
                      resource: overview.slug,
                      version: overview.version_label,
                      investigation: investigation.text,
                      inspected: readRanges,
                      ...(audit && { scenarios: [...evidence.scenarios] }),
                      ...(feedback && {
                        reported_feedback: {
                          kind: feedback.kind,
                          scenario: feedback.scenario,
                          expected: feedback.expected,
                          actual: feedback.actual,
                          blocking: feedback.blocking,
                          reproduction: feedback.reproduction,
                          evidence: feedback.evidence,
                          suggestion: feedback.suggestion,
                        },
                      }),
                    }),
                  },
                  reportSchema,
                ),
              );
              if (audit) {
                const suggestion = publicationSuggestion.parse(
                  'publication_suggestion' in assessment
                    ? assessment.publication_suggestion
                    : undefined,
                );
                const ids = suggestion.scenario_ids;
                const names = (suggestion.proposed_scenarios ?? []).map((item) => item.name);
                const count = ids.length + names.length;
                if (
                  (suggestion.category === 'scenario') !== count > 0 ||
                  count > 20 ||
                  new Set(names).size !== names.length ||
                  names.some((name) => !evidence.catalogNames || evidence.catalogNames.has(name)) ||
                  new Set(ids).size !== ids.length ||
                  ids.some((id) => !evidence.scenarios.has(id))
                )
                  throw new AiError('AI_OUTPUT_INVALID', '发布建议引用了无效场景，不能填入申请');
                Object.assign(assessment, {
                  publication_suggestion: {
                    ...suggestion,
                    keywords: suggestion.keywords.slice(0, 8),
                  },
                });
              }
              validateCitations(assessment.findings, readRanges);
              const coverage = `实际读取 ${new Set(inspected.map((item) => item.path)).size}/${overview.file_count} 个文件；行号范围之外的内容未纳入本次读取证据。`;
              assessment.limitations = assessment.limitations.slice(0, 28);
              assessment.limitations.push(coverage);
              if (overview.kind === 'mcp')
                assessment.limitations.push(
                  '本次为静态审计，未连接远端服务、安装软件包或执行 MCP 工具。',
                );
              const result = {
                ...target,
                content_digest: overview.content_digest,
                feedback_revision: feedback?.revision ?? null,
                can_apply_feedback: feedback?.can_manage ?? false,
                assessment,
                inspected,
              };
              await context.artifact('assessment', result);
              return result;
            }),
        });
        const confirmed = researchOutput.extend({ decision: businessDecision });
        const review = createStep({
          id: 'human-review',
          inputSchema: researchOutput,
          outputSchema: confirmed,
          resumeSchema: businessDecision,
          suspendSchema: z.object({ question: z.string(), assessment: researchOutput }).strict(),
          execute: async ({ inputData, resumeData, suspend }) => {
            if (!resumeData)
              return suspend({
                question: inputData.feedback_id
                  ? '是否采纳反馈研判？可选择写入处理建议。'
                  : '采纳后将建议分类、关键词和共享目的填入此版本的发布申请草稿。是否采纳？',
                assessment: inputData,
              });
            if (
              resumeData.apply_feedback &&
              (!inputData.feedback_id || !inputData.can_apply_feedback || !resumeData.approved)
            )
              throw new AiError('AI_CONFLICT', '仅采纳反馈研判后可以写入处理建议');
            return { ...inputData, decision: resumeData };
          },
        });
        const finish = createStep({
          id: 'record-assessment',
          inputSchema: confirmed,
          outputSchema: resultSchema,
          execute: ({ inputData }) =>
            context.step('record-assessment', async () => {
              const { decision, ...research } = inputData;
              await service.version(context.ownerId, research.version_id);
              if (decision.apply_feedback && research.feedback_id && research.feedback_revision) {
                const feedbackId = research.feedback_id;
                const revision = research.feedback_revision;
                const resolution = decision.comment || research.assessment.suggested_resolution;
                await context.effect(
                  'apply-feedback-assessment',
                  { feedback_id: feedbackId, revision, resolution },
                  async () => {
                    const current = await service.feedbackTarget(context.ownerId, feedbackId);
                    if (!current.can_manage)
                      throw new AiError('AI_FORBIDDEN', '维护权限已变化，不能写入反馈处理建议');
                    if (current.revision !== revision)
                      throw new AiError(
                        'AI_CONFLICT',
                        '反馈已被更新，请核对最新处理结果后重新研判',
                      );
                    const result = await service.applyFeedback(
                      context.ownerId,
                      feedbackId,
                      revision,
                      resolution,
                    );
                    return { feedback_id: result.id, revision: result.revision };
                  },
                );
              }
              const result = {
                ...research,
                approved: decision.approved,
                comment: decision.comment,
                feedback_applied: decision.apply_feedback,
              };
              const artifact = await context.artifact('confirmed-assessment', result);
              return { ...result, ...artifact };
            }),
        });
        return createWorkflow({
          id: kind,
          inputSchema: input,
          outputSchema: resultSchema,
          options: { autoRestartActiveRuns: false },
          retryConfig: { attempts: 0, delay: 0 },
        })
          .then(research)
          .then(review)
          .then(finish)
          .commit();
      },
    });
  }
}
