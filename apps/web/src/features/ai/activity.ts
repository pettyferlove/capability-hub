import type { AiExecutionViewResponse, AiInteractionResponse } from '@capability-hub/contracts';

type MessageBlock = AiExecutionViewResponse['execution']['message_blocks'][number];

/**
 * 单次工具调用的聚合结果，由 `activityItems` 从 `tool.*` 事件合并出，不直接来自接口。
 */
export interface ToolActivity {
  kind: 'tool';
  id: string;
  seq: number;
  name: string;
  display?: string;
  /** `interrupted` 不是服务端状态：执行结束或已被重试／人工继续超越后，仍在 running 的调用在此改写。 */
  state: 'running' | 'completed' | 'failed' | 'interrupted';
  startedAt?: string;
  endedAt?: string;
  code?: string;
  attempt: number;
  continuation: number;
}

/**
 * 活动流的一行，统一按 `seq` 升序；同序号时保持消息、工具、交互的拼接顺序。
 */
export type ActivityItem =
  | { kind: 'message'; id: string; seq: number; block: MessageBlock }
  | ToolActivity
  | { kind: 'interaction'; id: string; seq: number; interaction: AiInteractionResponse };

/**
 * 把事件流、消息块与交互合并成一条按 `seq` 升序的活动序列。
 *
 * 排序键来自事件：消息取 `message.started`，交互取 `interaction.requested`；事件已被 1000 条上限
 * 截断时前者退回 0、后者退回 `watermark`，因此它们会沉到列表首尾而不是错位穿插。工具按
 * `invocation_id` 聚合，标识或 `tool_id` 缺失的事件被丢弃；`attempt`／`continuation` 取首次出现值，
 * 收尾事件只覆盖状态与结束时间。合并后仍为 running 的工具，若执行已不在 running 或其 attempt／
 * continuation 已被超越（不可能再收到收尾事件），统一改写为 interrupted，避免界面永久转圈。
 */
export function activityItems(view: AiExecutionViewResponse): ActivityItem[] {
  const positions = new Map<string, number>();
  const tools = new Map<string, ToolActivity>();
  for (const event of view.activity) {
    if (event.type === 'message.started' && typeof event.data.block_id === 'string')
      positions.set(event.data.block_id, event.seq);
    if (event.type === 'interaction.requested' && typeof event.data.interaction_id === 'string')
      positions.set(event.data.interaction_id, event.seq);
    if (
      !event.type.startsWith('tool.') ||
      typeof event.data.invocation_id !== 'string' ||
      typeof event.data.tool_id !== 'string'
    )
      continue;
    const id = event.data.invocation_id;
    const item = tools.get(id) ?? {
      kind: 'tool',
      id,
      seq: event.seq,
      name: event.data.tool_id,
      state: 'running',
      attempt: event.attempt,
      continuation: event.continuation,
    };
    if (typeof event.data.display === 'string') item.display = event.data.display;
    if (event.type === 'tool.started') item.startedAt = event.occurred_at;
    else {
      item.state = event.type === 'tool.completed' ? 'completed' : 'failed';
      item.endedAt = event.occurred_at;
      if (typeof event.data.code === 'string') item.code = event.data.code;
    }
    tools.set(id, item);
  }
  for (const tool of tools.values()) {
    if (
      tool.state === 'running' &&
      (view.execution.status !== 'running' ||
        tool.attempt < view.execution.attempt ||
        tool.continuation < view.execution.continuation)
    )
      tool.state = 'interrupted';
  }
  return [
    ...view.execution.message_blocks.map((block): ActivityItem => ({
      kind: 'message',
      id: block.id,
      seq: positions.get(block.id) ?? 0,
      block,
    })),
    ...tools.values(),
    ...view.interactions.map((interaction): ActivityItem => ({
      kind: 'interaction',
      id: interaction.id,
      seq: positions.get(interaction.id) ?? view.watermark,
      interaction,
    })),
  ].sort((left, right) => left.seq - right.seq);
}

/** 业务研判固定的四个阶段，与服务端「调查 → 报告 → 人工确认 → 记录」流程一一对应。 */
export const businessPhases = ['查阅证据', '整理报告', '人工确认', '记录结论'] as const;

/**
 * 业务研判（资源审计、反馈研判）当前所处阶段，对应 `businessPhases` 的下标：-1 为尚未开始，
 * 4 为全部完成。人工确认阶段没有步骤事件，只能由交互状态推断；活动窗口被截断时按仍可见的最晚
 * 证据定位，因此阶段只进不退。`halted` 表示执行停在失败、取消或超时，阶段保留在中断处。
 */
export function businessPhase(view: AiExecutionViewResponse): { index: number; halted: boolean } {
  const { status } = view.execution;
  if (status === 'succeeded') return { index: 4, halted: false };
  const steps: Record<string, number> = {
    investigate: 0,
    assessment: 1,
    'repair-output': 1,
    'record-assessment': 3,
  };
  let index = -1;
  for (const event of view.activity)
    if (event.type.startsWith('step.') && typeof event.data.step_id === 'string')
      index = Math.max(index, steps[event.data.step_id] ?? -1);
  if (view.execution.message_blocks.some((block) => block.message_id.startsWith('assessment:')))
    index = Math.max(index, 1);
  if (view.interactions.some((item) => item.status === 'answered' || item.status === 'applied'))
    index = Math.max(index, 3);
  else if (status === 'waiting_input' || view.interactions.length) index = Math.max(index, 2);
  if (status === 'running') index = Math.max(index, 0);
  return { index, halted: ['failed', 'cancelled', 'timed_out'].includes(status) };
}

/**
 * 角色在协作面板上的进度文案，按「步骤事件 → 已输出消息块 → 执行状态」逐级回退。
 *
 * 角色与 `step_id` 的映射是写死的；未知角色取不到步骤，只能走消息块分支。返回值是固定中文文案，
 * 调用方按字符串比较（例如 `进行中` 才显示转圈），因此不要改措辞而不改调用方。
 */
export function roleState(view: AiExecutionViewResponse, role: string): string {
  const step = (
    { assistant: 'answer', planner: 'draft', editor: 'clarity', reviewer: 'risk' } as Record<
      string,
      string
    >
  )[role];
  const last = [...view.activity]
    .reverse()
    .find((event) => event.type.startsWith('step.') && event.data.step_id === step);
  if (last?.type === 'step.completed') return '已完成';
  if (last?.type === 'step.failed') return '执行失败';
  if (last?.type === 'step.started')
    return view.execution.status === 'running' ? '进行中' : '已中断';
  const blocks = view.execution.message_blocks.filter(
    (block) => block.message_id.split(':')[0] === role,
  );
  if (blocks.length)
    return blocks.every((block) => block.complete)
      ? '已输出'
      : view.execution.status === 'running'
        ? '进行中'
        : '已停止';
  return ['running', 'queued'].includes(view.execution.status) ? '等待参与' : '未执行';
}
