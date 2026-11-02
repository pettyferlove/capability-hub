import type { AgentEvidenceService } from '@capability-hub/application';
import { AiError, type AgentInvocation, type OperationContext } from '@capability-hub/ai';
import { z } from 'zod';
import type { evidenceSchema } from './schemas.js';

type ReadRange = z.infer<typeof evidenceSchema>;

/** 同一文件相邻或重叠的读取视为连续区间；中间有未读行时仍保持分段。 */
export function mergeReadRanges(ranges: readonly ReadRange[]) {
  const merged: ReadRange[] = [];
  const sorted = [...ranges].sort(
    (a, b) => a.path.localeCompare(b.path) || a.start_line - b.start_line,
  );
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last?.path === range.path && range.start_line <= last.end_line + 1)
      last.end_line = Math.max(last.end_line, range.end_line);
    else merged.push({ ...range });
  }
  return merged;
}

/** 每处引用必须完全落在同一文件实际读过的连续行段内。 */
export function validateCitations(findings: { evidence: ReadRange[] }[], readRanges: ReadRange[]) {
  for (const finding of findings)
    for (const citation of finding.evidence)
      if (
        citation.end_line < citation.start_line ||
        !readRanges.some(
          (item) =>
            item.path === citation.path &&
            item.start_line <= citation.start_line &&
            item.end_line >= citation.end_line,
        )
      )
        throw new AiError('AI_OUTPUT_INVALID', '报告引用超出实际读取范围');
}

interface BusinessEvidence {
  feedbackRead: boolean;
  catalogNames?: Set<string>;
  scenarios: Map<string, string>;
}

/**
 * 为业务 agent 装配只读证据工具。所有工具都只读固定版本，不连接远端、不执行资源内的指令；
 * 每次调用都经 {@link OperationContext.tool} 触发 `authorize('tool', id)` 并在同一执行写入
 * 事务内推进修订，因此工具调用本身就有审计副作用，权限不足立即抛 `AiError`。
 *
 * 返回的 `inspected` 与 `evidence` 是本次执行内累计的证据账本（非快照），调用方必须在同一闭包
 * 内读取：`inspected` 只记录 `read-file` 命中的行区间，`evidence.feedbackRead` 只有在
 * `read-feedback` 成功后才为 true——两者被用于拒绝「未读证据即下结论」的报告。
 * 工具集必须按执行新建，不能跨执行复用。
 *
 * @param feedbackId - 传入时额外开放 `read-feedback`，并收起 `publication-scenarios`
 * （反馈研判不涉及发布建议）。
 */
export function businessTools(
  context: OperationContext,
  service: AgentEvidenceService,
  versionId: string,
  feedbackId?: string,
): {
  tools: NonNullable<AgentInvocation['tools']>;
  inspected: z.infer<typeof evidenceSchema>[];
  evidence: BusinessEvidence;
} {
  const evidence: BusinessEvidence = {
    feedbackRead: false,
    scenarios: new Map<string, string>(),
  };
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
        '按名称或说明搜索已登记场景。优先复用同类业务任务，引用返回的 ID。',
        z
          .object({
            query: z.string().max(128).default(''),
            offset: z.number().int().min(0).default(0),
          })
          .strict(),
        async ({ query, offset }) => {
          const catalog = await service.publicationScenarios(context.ownerId, versionId);
          const available = catalog.filter((s) =>
            (s.name + ' ' + s.description).toLowerCase().includes(query.toLowerCase()),
          );
          const items = available
            .slice(offset, offset + 30)
            .map((s) => ({ ...s, description: s.description.slice(0, 160) }));
          evidence.catalogNames = new Set(catalog.map((s) => s.name));
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
