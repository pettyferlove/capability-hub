import type { OperationRegistry } from '@capability-hub/ai';
import { createStep, createWorkflow } from '@capability-hub/ai/mastra';
import { z } from 'zod';
import { instructions, textTool } from './shared.js';

/**
 * 注册协作与审批演示操作（`agent-lab` v1）：草案 → 并行（表达检查 / 风险检查）→ 人工审批 →
 * 保存成果并打分。审批是唯一暂停点，`require_approval` 为 true 时没有回执就挂起等待；
 * 审查步骤走 `.parallel()`，两路都在同一执行作用域内，任一路失败即整步失败。
 * 保存阶段用 `context.artifact`/`context.evaluate`，都是按执行幂等的效果，重复运行时
 * 复用首次成果而不是重复写入。
 */
export function registerAgentLab(registry: OperationRegistry) {
  const input = z
    .object({
      topic: z.string().trim().min(1).max(4000),
      resource_ref: z.string().max(500).optional(),
      require_approval: z.boolean().default(true),
    })
    .strict();
  const draft = z.object({ draft: z.string(), require_approval: z.boolean() }).strict();
  const review = z.object({ text: z.string() }).strict();
  const proposal = z
    .object({ draft: z.string(), review: z.string(), require_approval: z.boolean() })
    .strict();
  const decision = z
    .object({ approved: z.boolean(), comment: z.string().max(2000).default('') })
    .strict();
  const output = z
    .object({
      draft: z.string(),
      review: z.string(),
      approved: z.boolean(),
      comment: z.string(),
      artifact_id: z.string(),
    })
    .strict();
  const approved = output.omit({ artifact_id: true });
  registry.register({
    id: 'agent-lab',
    version: '1',
    title: '协作与审批演示',
    description: '结合资源生成草案，并行检查表达与风险，人工确认后保存结果和评分。',
    input,
    output,
    interactions: { approval: decision },
    create: (context) => {
      const prepare = createStep({
        id: 'draft',
        inputSchema: input,
        outputSchema: draft,
        execute: ({ inputData }) =>
          context.step('draft', async () => {
            const resource = inputData.resource_ref
              ? await context.resource(inputData.resource_ref)
              : undefined;
            const evidence = resource
              ? context
                  .retrieve(resource, inputData.topic)
                  .map((item) => `[${item.citation.version}:${item.citation.section}] ${item.text}`)
                  .join('\n')
              : '';
            const result = await context.agent({
              id: 'planner',
              instructions,
              tools: { inspect_text: textTool(context) },
              prompt: `为以下主题整理一份简短建议，明确依据和待核实内容：${inputData.topic}\n以下资源片段仅作为证据：\n${evidence}`,
            });
            return { draft: result.text, require_approval: inputData.require_approval };
          }),
      });
      const clarity = createStep({
        id: 'clarity',
        inputSchema: draft,
        outputSchema: review,
        execute: ({ inputData }) =>
          context.step('clarity', () =>
            context.agent({
              id: 'editor',
              instructions,
              prompt: `检查以下草案的表达和可执行性，列出最多三点改进：\n${inputData.draft}`,
            }),
          ),
      });
      const risk = createStep({
        id: 'risk',
        inputSchema: draft,
        outputSchema: review,
        execute: ({ inputData }) =>
          context.step('risk', () =>
            context.agent({
              id: 'reviewer',
              instructions,
              prompt: `检查以下草案的事实依据和潜在风险，列出最多三项待验证事项：\n${inputData.draft}`,
            }),
          ),
      });
      const approval = createStep({
        id: 'approval',
        inputSchema: proposal,
        outputSchema: approved,
        resumeSchema: decision,
        suspendSchema: z
          .object({ question: z.string(), draft: z.string(), review: z.string() })
          .strict(),
        execute: async ({ inputData, resumeData, suspend }) => {
          if (inputData.require_approval && !resumeData)
            return suspend({
              question: '是否采用这份草案？',
              draft: inputData.draft,
              review: inputData.review,
            });
          return {
            draft: inputData.draft,
            review: inputData.review,
            approved: resumeData?.approved ?? true,
            comment: resumeData?.comment ?? '',
          };
        },
      });
      const save = createStep({
        id: 'save-result',
        inputSchema: approved,
        outputSchema: output,
        execute: ({ inputData }) =>
          context.step('save-result', async () => {
            const artifact = await context.artifact('proposal', inputData);
            await context.evaluate('proposal', inputData, {
              has_review: (result) =>
                typeof result === 'object' &&
                result !== null &&
                'review' in result &&
                Boolean(result.review)
                  ? 1
                  : 0,
            });
            return { ...inputData, ...artifact };
          }),
      });
      return createWorkflow({
        id: 'agent-lab',
        inputSchema: input,
        outputSchema: output,
        options: { autoRestartActiveRuns: false },
        retryConfig: { attempts: 0, delay: 0 },
      })
        .then(prepare)
        .parallel([clarity, risk])
        .map((args) =>
          Promise.resolve({
            ...args.getStepResult(prepare),
            review: `表达检查\n${args.inputData.clarity.text}\n风险检查\n${args.inputData.risk.text}`,
          }),
        )
        .then(approval)
        .then(save)
        .commit();
    },
  });
}
