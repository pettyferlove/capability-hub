import type { OperationRegistry } from '@capability-hub/ai';
import { createStep, createWorkflow } from '@capability-hub/ai/mastra';
import { z } from 'zod';
import { instructions, textTool } from './shared.js';

const textOutput = z.object({ text: z.string().min(1) }).strict();

/**
 * 注册基础助手操作（`assistant` v1）：单步流式回答，开启会话记忆，供验证流式事件、工具调用
 * 与用量记录。记忆由执行作用域限定在单次 execution 内（`ScopedMemoryStorage` 拒绝跨执行读取），
 * 跨运行知识只能经 ResourceResolver 获取。`retryConfig.attempts: 0` 表示 provider 失败不自动
 * 重试，只有队列针对中断才会重新调度，避免重复计费。
 * 传入 `mcp_endpoint` 时先经 `withMcpTools` 换取只读工具集，端点未登记或工具不可读会直接
 * 失败而不是降级运行。
 */
export function registerAssistant(registry: OperationRegistry) {
  const assistantInput = z
    .object({
      prompt: z.string().trim().min(1).max(8000),
      mcp_endpoint: z.string().max(64).optional(),
      skill_ref: z.string().max(500).optional(),
    })
    .strict();
  registry.register({
    id: 'assistant',
    version: '1',
    title: '基础助手',
    description: '验证流式回答、工具调用、记忆与用量记录。',
    input: assistantInput,
    output: textOutput,
    interactions: {},
    create: (context) =>
      createWorkflow({
        id: 'assistant',
        inputSchema: assistantInput,
        outputSchema: textOutput,
        options: { autoRestartActiveRuns: false },
        retryConfig: { attempts: 0, delay: 0 },
      })
        .then(
          createStep({
            id: 'answer',
            inputSchema: assistantInput,
            outputSchema: textOutput,
            execute: ({ inputData }) =>
              context.step('answer', async () => {
                const skill = inputData.skill_ref
                  ? await context.skill(inputData.skill_ref)
                  : undefined;
                const invoke = (tools: Parameters<typeof context.agent>[0]['tools']) =>
                  context.agent({
                    id: 'assistant',
                    instructions,
                    prompt: `${inputData.prompt}${skill ? '\n' + skill.instructions : ''}`,
                    tools: { inspect_text: textTool(context), ...tools },
                    memory: true,
                  });
                return inputData.mcp_endpoint
                  ? context.withMcp(inputData.mcp_endpoint, invoke)
                  : invoke({});
              }),
          }),
        )
        .commit(),
  });
}
