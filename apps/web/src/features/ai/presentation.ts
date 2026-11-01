import type { AiEventResponse, AiExecutionResponse } from '@capability-hub/contracts';

export type Json = AiExecutionResponse['input'];
export const statusLabels: Record<AiExecutionResponse['status'], string> = {
  queued: '等待执行',
  running: '正在执行',
  waiting_input: '待你确认',
  succeeded: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
  timed_out: '已超时',
};
export const operationLabels: Record<string, string> = {
  assistant: '基础助手',
  'resource-audit': '资源审计',
  'feedback-triage': '反馈研判',
  'agent-lab': '多 Agent 协作',
};
export const agentLabels: Record<string, { title: string; description: string }> = {
  'resource-audit': { title: '资源审计员', description: '自主查阅 · 逐项核实' },
  'feedback-triage': { title: '反馈研判员', description: '复核观察 · 定位证据' },
  assessment: { title: '研判报告', description: '整理发现 · 明确检查范围' },
  assistant: { title: '助手', description: '理解问题 · 调用工具' },
  planner: { title: '规划助手', description: '整理依据 · 生成草案' },
  editor: { title: '表达审查', description: '检查表达与可执行性' },
  reviewer: { title: '风险审查', description: '识别风险与待验证事项' },
};
export function jsonObject(value: Json | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
export function taskPrompt(execution: AiExecutionResponse): string {
  const input = jsonObject(execution.input);
  const text = input.prompt ?? input.topic;
  return typeof text === 'string' ? text : '';
}
export function executionTitle(execution: AiExecutionResponse): string {
  const text = taskPrompt(execution).trim().replace(/\s+/g, ' ');
  return text
    ? text.length > 100
      ? text.slice(0, 100) + '…'
      : text
    : (operationLabels[execution.operation_id] ?? 'AI 任务');
}
export function proposalOf(value: Json | undefined) {
  const item = jsonObject(value);
  return typeof item.draft === 'string' &&
    typeof item.review === 'string' &&
    typeof item.approved === 'boolean' &&
    typeof item.comment === 'string'
    ? { draft: item.draft, review: item.review, approved: item.approved, comment: item.comment }
    : undefined;
}
const stepLabels: Record<string, string> = {
  answer: '助手回答',
  investigate: '查阅证据与研判',
  assessment: '整理研判报告',
  'human-review': '人工确认',
  'record-assessment': '记录处理结果',
  draft: '规划草案',
  clarity: '表达审查',
  risk: '风险审查',
  'save-result': '保存成果',
};
export const toolLabels: Record<string, string> = {
  'resource-overview': '确认资源入口',
  'mcp-declarations': '核对 MCP 声明',
  'list-files': '浏览文件目录',
  'read-file': '读取文件片段',
  'search-files': '搜索资源内容',
  'scan-findings': '核对静态检查',
  'compare-release': '比较发布版本',
  'read-feedback': '查阅反馈证据',
};
const eventLabels: Record<string, string> = {
  'execution.queued': '任务已进入队列',
  'execution.started': '开始执行',
  'execution.completed': '任务已完成',
  'execution.failed': '执行失败',
  'execution.cancelled': '任务已取消',
  'execution.timed_out': '执行已超时',
  'execution.retry_scheduled': '等待恢复执行',
  'interaction.requested': '等待人工确认',
  'interaction.responded': '已收到你的决定',
  'artifact.created': '成果已保存',
};
export function eventLabel(event: AiEventResponse): string | undefined {
  if (event.type.startsWith('step.')) {
    const step = typeof event.data.step_id === 'string' ? event.data.step_id : '处理步骤';
    const action = event.type.endsWith('started')
      ? '开始'
      : event.type.endsWith('completed')
        ? '完成'
        : '失败';
    return `${stepLabels[step] ?? step} · ${action}`;
  }
  if (event.type.startsWith('tool.')) {
    const tool = typeof event.data.tool_id === 'string' ? event.data.tool_id : '工具';
    const name = ['inspect-text', 'inspect_text'].includes(tool)
      ? '文本统计'
      : (toolLabels[tool] ?? tool);
    return `${name} · ${event.type.endsWith('started') ? '正在调用' : event.type.endsWith('completed') ? '调用完成' : '调用失败'}`;
  }
  return eventLabels[event.type];
}
