import { checkLabelStyles } from '../../shared/styles/recipes.js';
import {
  panelStyles,
  formStackStyles,
  eyebrowStyles,
  subtleStyles,
  formActionsStyles,
  btnStyles,
} from '../../shared/styles/recipes.js';
import { connectionAuthorizationStyles, connectionPermissionStyles } from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import type { ConnectionAuthorizationResponse } from '@capability-hub/contracts';
import { useEffect, useState } from 'react';
import { useQuery } from '../../shared/api/use-query.js';
import { mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useHub } from '../../shared/context/HubContext.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { ListSkeleton } from '../../shared/components/Skeleton.js';

export function ConnectionAuthorization({ requestId }: { requestId: string }) {
  const { me } = useHub();
  const [contribute, setContribute] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const path = '/api/connections/authorize/' + encodeURIComponent(requestId);
  const { data, error } = useQuery<ConnectionAuthorizationResponse>(path);
  const [now, setNow] = useState(Date.now);
  const expired = !!data && data.expires_at <= now;
  useEffect(() => {
    if (!data || expired) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [data, expired]);
  async function decide(allow: boolean) {
    if (busy || !data || data.expires_at <= Date.now()) {
      setNow(Date.now());
      return;
    }
    setBusy(true);
    setFailure('');
    try {
      const response = await mutate<{ redirect_uri: string }>(path, { allow, contribute });
      window.location.assign(response.redirect_uri);
    } catch (error) {
      setFailure(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <section className={cn(panelStyles, formStackStyles, connectionAuthorizationStyles)}>
      <p className={eyebrowStyles}>连接授权</p>
      <h2>让你的 Agent 使用团队能力</h2>
      {error ? (
        <ErrorState message={error} />
      ) : expired ? (
        <Message error>授权请求已过期，请返回 Agent 或终端重新发起连接。无需创建手动令牌。</Message>
      ) : !data ? (
        <ListSkeleton rows={3} label="正在读取连接请求…" />
      ) : (
        <>
          <p>
            <strong>{data.client_name}</strong> 请求连接此 Hub。
          </p>
          <p className={subtleStyles}>
            以 {me?.display_name}（{me?.username}
            ）的身份连接。仅批准你刚刚发起的请求；客户端名称由请求方提供。
          </p>
          <div className={connectionPermissionStyles}>
            <strong>搜索和使用</strong>
            <p>查找、读取和安装你有权访问的 Skill 与 MCP。</p>
          </div>
          {data.scope === 'hub:contribute' && (
            <label className={checkLabelStyles}>
              <input
                type="checkbox"
                checked={contribute}
                disabled={busy}
                onChange={(e) => setContribute(e.target.checked)}
              />
              <span>同时允许分享、推荐与反馈</span>
            </label>
          )}
          <p className={subtleStyles}>
            授权不会增加账号原有权限。你可以随时在账号安全中断开连接，无需复制或保存令牌。
          </p>
          <p className={subtleStyles}>授权将返回：{data.redirect_origin}</p>
          <details>
            <summary>连接详情</summary>
            <p>服务：{data.resource}</p>
            <p>返回地址：{data.redirect_origin}</p>
          </details>
          <div className={formActionsStyles}>
            <Submit busy={busy} onClick={() => void decide(true)}>
              允许连接
            </Submit>
            <button className={btnStyles} disabled={busy} onClick={() => void decide(false)}>
              取消
            </button>
          </div>
        </>
      )}
      {failure && <Message error>{failure}</Message>}
    </section>
  );
}
