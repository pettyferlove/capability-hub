import {
  panelStyles,
  btnStyles,
  sectionHeadingStyles,
  subtleStyles,
  chipsStyles,
  tableCellActionsStyles,
  tagStyles,
  tagTealStyles,
  textBtnStyles,
  dangerTextStyles,
} from '../../shared/styles/recipes.js';
import { tableIdentityStyles } from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import type { ConnectionResponse } from '@capability-hub/contracts';
import { useState } from 'react';
import { RefreshCw } from '../../shared/icons/lucide.js';
import { ConnectionClientIcon } from '../../shared/icons/ConnectionClientIcon.js';
import { api } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useQuery } from '../../shared/api/use-query.js';
import { useHub } from '../../shared/context/HubContext.js';
import { DataTable } from '../../shared/components/DataTable.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { TableSkeleton } from '../../shared/components/Skeleton.js';
import { dateLabel } from '../../shared/format/labels.js';

/**
 * 已授权 Agent 连接列表（`/api/connections`）：只展示 `revoked_at` 为空的活动连接，
 * 断开是软撤销（`DELETE /api/connections/{id}`），记录保留但立即停止访问；
 * 同一时刻只允许一个断开请求在途，`busy` 期间全部按钮禁用。
 */
export function ConnectedAgents({ className }: { className?: string } = {}) {
  const { refresh, reload } = useHub();
  const { data, error, refreshing } = useQuery<ConnectionResponse[]>('/api/connections', refresh);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  async function disconnect(id: string) {
    if (busy) return;
    setBusy(id);
    setFailure('');
    try {
      await api('/api/connections/' + encodeURIComponent(id), { method: 'DELETE' });
      reload();
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }
  const active = data
    ?.filter((item) => item.revoked_at === null)
    .sort((a, b) => b.created_at - a.created_at);
  return (
    <section className={cn(panelStyles, 'my-7', className)} aria-label="已授权的 Agent">
      <div className={sectionHeadingStyles}>
        <div className="flex-1">
          <h2>已授权的 Agent</h2>
          <p className={subtleStyles}>
            每条连接都可独立断开，断开后立即停止访问。
            {active?.some((item) => item.scope === 'hub:read') && (
              <>
                要增加权限，请从原客户端重新授权。使用接入助手时，请在原命令中加上{' '}
                <code>--contribute</code>。
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          className={btnStyles}
          onClick={reload}
          disabled={refreshing || busy !== null}
          aria-busy={refreshing || undefined}
          aria-label="刷新连接状态"
        >
          <RefreshCw size={16} className={refreshing ? 'motion-safe:animate-spin' : undefined} />
          刷新
        </button>
      </div>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : !active ? (
        <TableSkeleton rows={2} columns={4} label="正在加载连接…" />
      ) : (
        <DataTable label="Agent 连接">
          <table>
            <thead>
              <tr>
                <th scope="col">客户端</th>
                <th scope="col">已授权权限</th>
                <th scope="col">最近访问</th>
                <th scope="col" className={tableCellActionsStyles}>
                  管理
                </th>
              </tr>
            </thead>
            <tbody>
              {active.map((item) => (
                <tr
                  key={item.id}
                  className="motion-safe:animate-[operations-content-in_180ms_ease-out]"
                >
                  <td>
                    <span className={tableIdentityStyles}>
                      <ConnectionClientIcon name={item.name} />
                      <strong>
                        <bdi>{item.name}</bdi>
                      </strong>
                    </span>
                  </td>
                  <td>
                    <div className={chipsStyles}>
                      <span className={tagStyles}>搜索和使用</span>
                      {item.scope === 'hub:contribute' && (
                        <span className={cn(tagStyles, tagTealStyles)}>分享、推荐与反馈</span>
                      )}
                    </div>
                  </td>
                  <td>
                    {item.last_used_at === null ? (
                      <span className={subtleStyles}>等待首次访问</span>
                    ) : (
                      <time
                        className="whitespace-nowrap font-mono"
                        dateTime={new Date(item.last_used_at).toISOString()}
                      >
                        {dateLabel(item.last_used_at)}
                      </time>
                    )}
                  </td>
                  <td className={tableCellActionsStyles}>
                    <button
                      type="button"
                      className={cn(textBtnStyles, dangerTextStyles)}
                      aria-label={`断开 ${item.name} 的连接`}
                      aria-busy={busy === item.id || undefined}
                      disabled={busy !== null}
                      onClick={() => void disconnect(item.id)}
                    >
                      {busy === item.id ? '正在断开…' : '断开连接'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTable>
      )}
      {failure && <Message error>{failure}</Message>}
    </section>
  );
}
