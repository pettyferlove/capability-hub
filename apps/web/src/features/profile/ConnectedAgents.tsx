import {
  panelStyles,
  formStackStyles,
  sectionHeadingStyles,
  subtleStyles,
  textBtnStyles,
  dangerTextStyles,
} from '../../shared/styles/recipes.js';
import { connectedAgentsStyles, tokenListStyles } from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import type { ConnectionResponse } from '@capability-hub/contracts';
import { useState } from 'react';
import { Laptop, RefreshCw } from '../../shared/icons/lucide.js';
import { api } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useQuery } from '../../shared/api/use-query.js';
import { useHub } from '../../shared/context/HubContext.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { ListSkeleton } from '../../shared/components/Skeleton.js';
import { dateLabel } from '../../shared/format/labels.js';

/**
 * 已授权 Agent 连接列表（`/api/connections`）：只展示 `revoked_at` 为空的活动连接，
 * 断开是软撤销（`DELETE /api/connections/{id}`），记录保留但立即停止访问；
 * 同一时刻只允许一个断开请求在途，`busy` 期间全部按钮禁用。
 */
export function ConnectedAgents({ className }: { className?: string } = {}) {
  const { refresh, reload } = useHub();
  const { data, error } = useQuery<ConnectionResponse[]>('/api/connections', refresh);
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
  const active = data?.filter((item) => item.revoked_at === null);
  return (
    <section className={cn(panelStyles, formStackStyles, connectedAgentsStyles, className)}>
      <div className={sectionHeadingStyles}>
        <div>
          <h2>已授权的 Agent</h2>
          <p className={subtleStyles}>每个连接独立管理，断开后立即停止访问。</p>
        </div>
        <button className={textBtnStyles} onClick={reload} aria-label="刷新连接状态">
          <RefreshCw size={16} />
          刷新
        </button>
      </div>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : !active ? (
        <ListSkeleton rows={2} label="正在加载连接…" />
      ) : active.length === 0 ? (
        <p className={subtleStyles}>还没有授权的 Agent。连接时在浏览器确认即可，无需创建令牌。</p>
      ) : (
        <div className={tokenListStyles}>
          {[...active]
            .sort((a, b) => b.created_at - a.created_at)
            .map((item) => (
              <div key={item.id}>
                <Laptop size={18} />
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.scope === 'hub:contribute' ? '读取、分享、推荐与反馈' : '搜索和使用'} ·{' '}
                    {item.last_used_at
                      ? `最近访问 ${dateLabel(item.last_used_at)}`
                      : '已授权，等待首次访问'}
                  </small>
                </span>
                <button
                  className={cn(textBtnStyles, dangerTextStyles)}
                  disabled={busy !== null}
                  onClick={() => void disconnect(item.id)}
                >
                  {busy === item.id ? '正在断开…' : '断开连接'}
                </button>
              </div>
            ))}
        </div>
      )}
      <a className={textBtnStyles} href="/connect?permission=contribute">
        追加分享、推荐与反馈权限
      </a>
      {failure && <Message error>{failure}</Message>}
    </section>
  );
}
