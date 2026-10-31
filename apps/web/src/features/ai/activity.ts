import type { AiExecutionViewResponse, AiInteractionResponse } from '@capability-hub/contracts';

type MessageBlock = AiExecutionViewResponse['execution']['message_blocks'][number];
export interface ToolActivity {
  kind: 'tool';
  id: string;
  seq: number;
  name: string;
  state: 'running' | 'completed' | 'failed' | 'interrupted';
  startedAt?: string;
  endedAt?: string;
  code?: string;
  attempt: number;
  continuation: number;
}
export type ActivityItem =
  | { kind: 'message'; id: string; seq: number; block: MessageBlock }
  | ToolActivity
  | { kind: 'interaction'; id: string; seq: number; interaction: AiInteractionResponse };

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
