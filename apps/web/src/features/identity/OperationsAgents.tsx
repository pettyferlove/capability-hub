import { aiExecutionStatusSchema } from '@capability-hub/contracts';
import type { OperationsResponse } from '@capability-hub/contracts/http';
import { dateLabel } from '../../shared/format/labels.js';
import { chipsStyles, panelStyles, subtleStyles, tagStyles } from '../../shared/styles/recipes.js';
import { statusLabels } from '../ai/presentation.js';
import { operationsAgentListStyles } from './styles.js';

/** 注册信息来自当前实例，执行计数覆盖共享数据库中的保留记录。 */
export function OperationsAgents({
  agents,
  workerState,
}: {
  agents: OperationsResponse['agents'];
  workerState: OperationsResponse['worker_state'];
}) {
  const { profiles, operations } = agents;
  return (
    <section className={panelStyles} aria-label="AI Agents">
      <h3>AI Agents</h3>
      <p className={subtleStyles}>
        已注册 {operations.length} 个 Agent · 本进程 Worker
        {{ stopped: '未运行', idle: '空闲', busy: '工作中' }[workerState]}。
        执行统计覆盖数据库中保留的记录。
      </p>
      <ul className={operationsAgentListStyles}>
        {operations.map(({ id, title, version, activity }) => (
          <li key={id}>
            <div>
              <strong>{title}</strong>{' '}
              <span className="text-caption text-muted-ink">v{version}</span>
              <code className="block text-caption text-muted-ink">{id}</code>
            </div>
            <div className={chipsStyles}>
              {!activity ? (
                <span>执行统计暂不可用</span>
              ) : !activity.last_activity_at ? (
                <span>暂无执行记录</span>
              ) : (
                aiExecutionStatusSchema.options.map(
                  (status) =>
                    (activity.by_status[status] ?? 0) > 0 && (
                      <span key={status} className={tagStyles}>
                        {statusLabels[status]} {activity.by_status[status]}
                      </span>
                    ),
                )
              )}
            </div>
            {activity?.last_activity_at && (
              <small>
                最近活动{' '}
                <time dateTime={activity.last_activity_at}>
                  {dateLabel(activity.last_activity_at)}
                </time>
              </small>
            )}
          </li>
        ))}
      </ul>
      <h4 className="mb-2 mt-4 text-label">模型配置</h4>
      {profiles.length === 0 ? (
        <p className={subtleStyles}>尚未配置模型，Agent 暂时无法执行。</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {profiles.map((profile) => (
            <li key={profile.id} className={tagStyles}>
              {profile.id === agents.default_profile && '默认 · '}
              {profile.label} · {profile.model} ·{' '}
              {profile.format === 'openai' ? 'OpenAI' : 'Anthropic'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
