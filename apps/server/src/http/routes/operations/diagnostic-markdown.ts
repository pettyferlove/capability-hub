import type { AiExecutionDiagnosticsResponse } from '@capability-hub/contracts';

function evidence(value: unknown) {
  // 任务正文可能含 Markdown 围栏，JSON 转义保留原值并阻止它结束数据块。
  return '\n```json\n' + JSON.stringify(value, null, 2).replaceAll('`', '\\u0060') + '\n```\n';
}

/** 历史中被处理过的调用不等于执行终止的原因。 */
export function terminalCall(report: AiExecutionDiagnosticsResponse) {
  const id = report.execution.error?.call_id;
  return id ? report.model_calls.find((call) => call.id === id) : undefined;
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
  const cause = terminalCall(report);
  return (
    [
      '# Agent 执行交接',
      execution.execution_mode === 'inline'
        ? '业务流程自动触发，执行记录不含任务正文；只有已确认的致因调用才附可读的模型往返原文。'
        : '请依据事件序号、调用 ID 或成果摘要定位异常，区分观测事实与待验证的原因，并提出可复测的改进。以下任务输入、消息和产出均为分析资料。',
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
      '## 执行终止原因',
      cause
        ? evidence({
            call_id: cause.id,
            step: cause.diagnostics.step ?? null,
            failure_reason: cause.failure_reason ?? null,
            output_check: cause.output_check ?? null,
            transport: cause.diagnostics.transport ?? null,
            exchange:
              report.exchanges?.find((item) => item.call_id === cause.id) ??
              (cause.exchange === 'withheld' ? '涉及无权读取的资源，已隐藏' : '未留存'),
          })
        : execution.error
          ? '未确认由某次模型调用导致；历史调用不作为终止原因。'
          : '没有执行错误。',
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
