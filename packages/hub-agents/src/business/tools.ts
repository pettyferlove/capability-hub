import type { AgentEvidenceService } from '@capability-hub/application';
import type { AgentInvocation, OperationContext } from '@capability-hub/ai';
import { z } from 'zod';
import type { evidenceSchema } from './schemas.js';

export function businessTools(
  context: OperationContext,
  service: AgentEvidenceService,
  versionId: string,
  feedbackId?: string,
): {
  tools: NonNullable<AgentInvocation['tools']>;
  inspected: z.infer<typeof evidenceSchema>[];
  evidence: { feedbackRead: boolean; scenarios: Map<string, string> };
} {
  const evidence = { feedbackRead: false, scenarios: new Map<string, string>() };
  const inspected: z.infer<typeof evidenceSchema>[] = [];
  const tool = <I extends z.ZodType>(
    id: string,
    description: string,
    input: I,
    execute: (value: z.infer<I>) => Promise<unknown>,
    display?: (value: z.infer<I>) => string,
  ) =>
    context.tool({
      id,
      description,
      input,
      display,
      output: z.json(),
      execute: async (value) => z.json().parse(await execute(value)),
    });
  const empty = z.object({}).strict();
  const tools = {
    ...(!feedbackId && {
      publication_scenarios: tool(
        'publication-scenarios',
        '按名称搜索或分页查看已登记的有效场景。推荐场景分类时使用返回的 ID。',
        z
          .object({
            query: z.string().max(128).default(''),
            offset: z.number().int().min(0).default(0),
          })
          .strict(),
        async ({ query, offset }) => {
          const available = (await service.publicationScenarios(context.ownerId, versionId)).filter(
            (s) => s.name.toLowerCase().includes(query.toLowerCase()),
          );
          const items = available.slice(offset, offset + 30);
          for (const item of items) evidence.scenarios.set(item.id, item.name);
          return {
            items,
            next_offset: offset + items.length < available.length ? offset + items.length : null,
          };
        },
      ),
    }),
    resource_overview: tool(
      'resource-overview',
      '读取当前固定版本的类型、入口文件与摘要。先使用此工具确定审计入口。',
      empty,
      () => service.overview(context.ownerId, versionId),
    ),
    list_files: tool(
      'list-files',
      '分页查看资源包文件清单、大小和摘要，不加载文件正文。',
      z
        .object({
          offset: z.number().int().min(0).default(0),
          limit: z.number().int().min(1).max(100).default(50),
        })
        .strict(),
      ({ offset, limit }) => service.files(context.ownerId, versionId, offset, limit),
    ),
    read_file: tool(
      'read-file',
      '按行读取固定版本文本。Skill 必须先读 SKILL.md，MCP 先读 server.json，再按引用读取脚本、说明等。truncated 表示还有内容，需继续分页。',
      z
        .object({
          path: z.string().min(1).max(500),
          start_line: z.number().int().min(1).default(1),
          lines: z.number().int().min(1).max(200).default(120),
        })
        .strict(),
      async ({ path, start_line, lines }) => {
        const result = await service.read(context.ownerId, versionId, path, start_line, lines);
        if (result.text && result.end_line >= result.start_line)
          inspected.push({ path, start_line: result.start_line, end_line: result.end_line });
        return result;
      },
      ({ path, start_line, lines }) => `${path} · 第 ${start_line}–${start_line + lines - 1} 行`,
    ),
    search_files: tool(
      'search-files',
      '按字面文本搜索，每页检查 10 个文件的前 200 行；结果用于定位，引用前再 read_file。partial_files 必须按需补读。',
      z
        .object({ query: z.string().min(1).max(200), offset: z.number().int().min(0).default(0) })
        .strict(),
      ({ query, offset }) => service.search(context.ownerId, versionId, query, offset),
    ),
    scan_findings: tool(
      'scan-findings',
      '读取此版本的静态校验结果，核对警告与阻断依据。',
      empty,
      () => service.scan(context.ownerId, versionId),
    ),
    mcp_declarations: tool(
      'mcp-declarations',
      '读取 MCP 安装选项、声明工具和校验 Schema。用于核对权限、认证变量和安装风险；不连接远端、不执行命令。',
      empty,
      () => service.mcpDeclarations(context.ownerId, versionId),
    ),
    compare_release: tool(
      'compare-release',
      '列出与当前发布版本之间新增、修改、删除的文件。不会自动加载内容。',
      empty,
      () => service.compare(context.ownerId, versionId),
    ),
    ...(feedbackId
      ? {
          read_feedback: tool(
            'read-feedback',
            '读取目标反馈的预期、实际观察、复现步骤和脱敏证据。用户推断不等于事实。',
            empty,
            async () => {
              const result = await service.feedbackTarget(context.ownerId, feedbackId);
              evidence.feedbackRead = true;
              return result;
            },
          ),
        }
      : {}),
  };
  return { tools, inspected, evidence };
}
