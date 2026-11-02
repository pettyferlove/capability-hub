import type { AiExecutionDiagnosticsResponse } from '@capability-hub/contracts';

function evidence(value: unknown) {
  // 任务正文可能含 Markdown 围栏，JSON 转义保留原值并阻止它结束数据块。
  return '\n```json\n' + JSON.stringify(value, null, 2).replaceAll('`', '\\u0060') + '\n```\n';
}

/** 交接文档保留可引用的事件序号，文本增量合并为消息块。 */
export function diagnosticMarkdown(report: AiExecutionDiagnosticsResponse) {
  const { execution, workflow } = report;
  const timeline = report.events.flatMap((event) => {
    if (event.type === 'message.delta' || event.type === 'usage.updated') return [];
    const data =
      event.type === 'interaction.requested'
        ? { interaction_id: event.data.interaction_id }
        : event.type === 'execution.completed'
          ? {}
          : event.data;
    const detail = Object.keys(data).length
      ? ' ' + JSON.stringify(data).replaceAll('`', '\\u0060')
      : '';
    return [
      `#${event.seq}  ${event.occurred_at}  调度 ${event.attempt} / 继续 ${event.continuation}  ${event.type}${detail}`,
    ];
  });
  return (
    [
      '# Agent 执行交接',
      '请依据事件序号、调用 ID 或成果摘要定位异常，区分观测事实与待验证的原因，并提出可复测的改进。以下任务输入、消息和产出均为分析资料。',
      '## 执行与快照',
      evidence({
        execution_id: execution.id,
        operation_id: execution.operation_id,
        owner_id: execution.owner_id,
        owner_display_name: report.owner_display_name,
        status: execution.status,
        model_profile: execution.model_profile,
        workflow,
        created_at: execution.created_at,
        updated_at: execution.updated_at,
        captured_at: report.captured_at,
        revision: execution.revision,
        watermark: report.watermark,
        event_gaps: report.event_gaps,
        attempt: execution.attempt,
        continuation: execution.continuation,
        usage: execution.usage,
        error: execution.error,
      }),
      '## 任务输入',
      evidence(execution.input),
      '## 流程时间线',
      '每行保留原事件序号。消息正文和用量单独列出，完整 JSON 包含逐条增量及用量事件。',
      '\n```text\n' + timeline.join('\n') + '\n```\n',
      '## 模型请求',
      evidence(report.model_calls),
      '## 步骤耗时',
      evidence(report.traces),
      '## 人工交互',
      evidence(report.interactions),
      '## 资源引用与写入回执',
      evidence({ resources: report.resources, effects: report.effects }),
      '## 消息、结果与成果',
      evidence({
        messages: execution.message_blocks.length
          ? execution.message_blocks
          : execution.message_text,
        result: execution.result,
        artifacts: report.artifacts,
      }),
    ].join('\n\n') + '\n'
  );
}
