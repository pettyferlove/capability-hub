import type { AiEventResponse, AiExecutionResponse } from '@capability-hub/contracts';
import {
  Bot,
  MessageSquare,
  ShieldCheck,
  Workflow,
  type IconComponent,
} from '../../shared/icons/lucide.js';

/** 契约中的 JSON 值类型，复用任务输入的形状；嵌套对象统一用 `Record` 访问。 */
export type Json = AiExecutionResponse['input'];

/** 执行状态到界面文案的唯一映射，键必须覆盖契约 `status` 的全部取值。 */
export const statusLabels: Record<AiExecutionResponse['status'], string> = {
  queued: '等待执行',
  running: '正在执行',
  waiting_input: '待确认',
  succeeded: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
  timed_out: '已超时',
};

/** 操作类型文案；键是开放字符串，新增操作未登记时调用方需自行回退到原始 id。 */
export const operationLabels: Record<string, string> = {
  assistant: '基础助手',
  'resource-audit': '资源审计',
  'feedback-triage': '反馈研判',
  'agent-lab': '多 Agent 协作',
};

/** 工作台里操作类型的图标与一句话说明；未登记的操作由调用方回退到通用图标与目录描述。 */
export const operationMeta: Record<string, { Icon: IconComponent; description: string }> = {
  assistant: { Icon: Bot, description: '一个问题，实时回答。按需调用工具，辅助理解与整理。' },
  'agent-lab': {
    Icon: Workflow,
    description: '生成草案、并行审查，再由你确认。体验完整协作流程。',
  },
  'resource-audit': {
    Icon: ShieldCheck,
    description: '查阅固定版本的文件与扫描结果，形成可追溯的审计建议。',
  },
  'feedback-triage': {
    Icon: MessageSquare,
    description: '复核一条反馈，定位证据并给出处理建议。',
  },
};

/**
 * 角色与操作类型共用的标题字典：前四项是操作，其余是协作角色；键缺失时调用方须回退。
 */
export const agentLabels: Record<string, { title: string; description: string }> = {
  'resource-audit': { title: '资源审计员', description: '自主查阅 · 逐项核实' },
  'feedback-triage': { title: '反馈研判员', description: '复核观察 · 定位证据' },
  assessment: { title: '研判报告', description: '整理发现 · 明确检查范围' },
  assistant: { title: '助手', description: '理解问题 · 调用工具' },
  planner: { title: '规划助手', description: '整理依据 · 生成草案' },
  editor: { title: '表达审查', description: '检查表达与可执行性' },
  reviewer: { title: '风险审查', description: '识别风险与待验证事项' },
};

/**
 * 把任意 JSON 值收敛成普通对象：`null`、数组与标量一律得到空对象，因此调用方可以安全链式取值而
 * 不必判空；它不做 schema 校验，缺字段的结果仍是空对象。
 */
export function jsonObject(value: Json | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 任务正文：优先取 `prompt`，缺失时退回 `topic`；两者都不是字符串时返回空串而非抛错。
 */
export function taskPrompt(execution: AiExecutionResponse): string {
  const input = jsonObject(execution.input);
  const text = input.prompt ?? input.topic;
  return typeof text === 'string' ? text : '';
}

/**
 * 列表与标题栏用的一行标题：折叠连续空白后截断到 100 字符（不含结尾的省略号），空正文回退到
 * 操作名，操作名也未登记时统一显示「AI 任务」。
 */
export function executionTitle(execution: AiExecutionResponse): string {
  const text = taskPrompt(execution).trim().replace(/\s+/g, ' ');
  return text
    ? text.length > 100
      ? text.slice(0, 100) + '…'
      : text
    : (operationLabels[execution.operation_id] ?? 'AI 任务');
}

/**
 * 从任意 JSON 值中识别协作草案：`draft`、`review`、`approved`、`comment` 四字段类型必须全部匹配，
 * 否则返回 `undefined`。这是结构判别而非契约校验，多余的键会被丢弃，不做任何默认值填充。
 */
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
  'repair-output': '重新整理报告格式',
  'human-review': '人工确认',
  'record-assessment': '记录处理结果',
  draft: '规划草案',
  clarity: '表达审查',
  risk: '风险审查',
  'save-result': '保存成果',
};

/** 工具调用文案；未登记的工具 id 由调用方回退显示原始 id。 */
export const toolLabels: Record<string, string> = {
  'publication-scenarios': '匹配发布场景',
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

/**
 * 事件的一行时间线文案，未登记的事件类型返回 `undefined`，调用方据此过滤而不显示原始类型。
 *
 * `step.*` 与 `tool.*` 由后缀决定动作词，中间的 id 查不到字典时原样展示，所以新增步骤或工具不会
 * 让事件消失；`inspect-text` 与 `inspect_text` 两种写法都映射到「文本统计」。
 */
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
