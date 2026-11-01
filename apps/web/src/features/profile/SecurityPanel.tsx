import {
  formStackStyles,
  accountLayoutStyles,
  panelStyles,
  sectionHeadingStyles,
  subtleStyles,
  btnStyles,
  btnPrimaryStyles,
  tableCellStatusStyles,
  tableCellActionsStyles,
  tagStyles,
  tagTealStyles,
  textBtnStyles,
  dangerTextStyles,
  sheetScrollStyles,
} from '../../shared/styles/recipes.js';
import { sessionPanelStyles, sessionCountStyles, tableIdentityStyles } from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type { SessionResponse, TokenResponse } from '@capability-hub/contracts/http';
import { KeyRound, Plus, ShieldCheck } from '../../shared/icons/lucide.js';
import { useState, type SubmitEvent } from 'react';
import { api, ApiError, mutate } from '../../shared/api/client.js';
import { formFields } from '../../shared/api/form-fields.js';
import { useQuery } from '../../shared/api/use-query.js';
import { DataTable } from '../../shared/components/DataTable.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { PasswordField } from '../../shared/components/PasswordField.js';
import { Submit } from '../../shared/components/Submit.js';
import { ListSkeleton, TableSkeleton } from '../../shared/components/Skeleton.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel } from '../../shared/format/labels.js';
import { SessionList } from './SessionList.js';
import { ConnectedAgents } from './ConnectedAgents.js';
import { AccessTokenForm } from './AccessTokenForm.js';
/**
 * 账号安全页：聚合已授权 Agent、登录会话与访问令牌三个来源（`/api/connections`、
 * `/api/me/sessions`、`/api/tokens`）。改密成功后派发 `hub:unauthenticated` 使全局回到登录态，
 * 且只影响网页会话，CLI/MCP 令牌继续有效；改密校验失败时会按错误码把焦点移回对应输入框
 * （`CURRENT_PASSWORD_INVALID` 指向当前密码，其余指向新密码），避免用户重新找位置。
 */
export function PersonalSecurity() {
  const { refresh, reload } = useHub(),
    { data: sessions, error: sessionError } = useQuery<SessionResponse[]>(
      '/api/me/sessions',
      refresh,
    ),
    { data: tokens, error: tokenError } = useQuery<TokenResponse[]>('/api/tokens', refresh);
  const [feedback, setFeedback] = useState(''),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [revokingId, setRevokingId] = useState<string | null>(null);
  const [creatingToken, setCreatingToken] = useState(false);
  const [issuingToken, setIssuingToken] = useState(false);
  function closeTokenForm() {
    if (!issuingToken) setCreatingToken(false);
  }
  async function change(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFeedback('');
    const form = e.currentTarget;
    try {
      const values = formFields(form);
      if (values.new_password !== values.confirm_password)
        throw new Error('两次输入的新密码不一致');
      delete values.confirm_password;
      await mutate('/api/password', values);
      window.dispatchEvent(new Event('hub:unauthenticated'));
    } catch (e) {
      setFailed(true);
      setFeedback(errorMessage(e));
      const input = form.elements.namedItem(
        e instanceof ApiError && e.code === 'CURRENT_PASSWORD_INVALID'
          ? 'current_password'
          : 'new_password',
      );
      if (input instanceof HTMLInputElement) input.focus();
    } finally {
      setBusy(false);
    }
  }
  async function revoke(kind: 'sessions' | 'tokens', id: string) {
    setRevokingId(id);
    try {
      const path = kind === 'sessions' ? '/api/me/sessions/' + id : '/api/tokens/' + id;
      await api(path, { method: 'DELETE' });
      setFailed(false);
      setFeedback(
        kind === 'sessions' ? '已退出该会话，该设备需要重新登录' : '已撤销，后续请求立即失效',
      );
      reload();
    } catch (e) {
      setFailed(true);
      setFeedback(errorMessage(e));
    } finally {
      setRevokingId(null);
    }
  }
  return (
    <div className={formStackStyles}>
      <ConnectedAgents />
      {feedback && <Message error={failed}>{feedback}</Message>}
      <div className={accountLayoutStyles}>
        <section className={panelStyles}>
          <div className={sectionHeadingStyles}>
            <div>
              <h2>修改密码</h2>
              <p className={subtleStyles}>修改后需重新登录网页，CLI/MCP 访问令牌保持有效。</p>
            </div>
            <ShieldCheck size={21} />
          </div>
          <form className={formStackStyles} onSubmit={change}>
            <PasswordField
              label="当前密码"
              name="current_password"
              minimum={1}
              autoComplete="current-password"
            />
            <PasswordField label="新密码" name="new_password" />
            <PasswordField label="确认新密码" name="confirm_password" />
            <Submit busy={busy}>更新密码并重新登录</Submit>
          </form>
        </section>
        <section className={cn(panelStyles, sessionPanelStyles)}>
          <div className={sectionHeadingStyles}>
            <h2>登录会话</h2>
            {sessions && <span className={sessionCountStyles}>{sessions.length} 个有效会话</span>}
          </div>
          {sessionError && <ErrorState message={sessionError} retry={reload} />}
          {!sessions && !sessionError && <ListSkeleton label="正在加载登录会话…" rows={3} />}
          {sessions && (
            <SessionList
              sessions={sessions}
              pendingId={revokingId}
              onRevoke={(id) => void revoke('sessions', id)}
            />
          )}
        </section>
      </div>
      <section className={panelStyles}>
        <div className={sectionHeadingStyles}>
          <div>
            <h2>手动访问令牌</h2>
            <p className={subtleStyles}>用于 CLI/MCP 接入，独立于网页登录，可单独撤销。</p>
          </div>
          <button
            className={cn(btnStyles, btnPrimaryStyles)}
            onClick={() => setCreatingToken(true)}
          >
            <Plus size={15} />
            创建访问令牌
          </button>
        </div>
        {tokenError && <ErrorState message={tokenError} retry={reload} />}
        {!tokens && !tokenError && (
          <TableSkeleton label="正在加载 Hub 访问令牌…" rows={3} columns={5} />
        )}
        {tokens?.length === 0 && (
          <p className={subtleStyles}>尚未创建访问令牌，点击“创建访问令牌”即可在此完成。</p>
        )}
        {tokens && tokens.length > 0 && (
          <DataTable label="Hub 访问令牌">
            <table>
              <thead>
                <tr>
                  <th>名称</th>
                  <th>权限</th>
                  <th>创建时间</th>
                  <th className={tableCellStatusStyles}>状态</th>
                  <th className={tableCellActionsStyles}>操作</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className={tableIdentityStyles}>
                        <KeyRound size={14} />
                        <span>{t.name}</span>
                      </span>
                    </td>
                    <td>
                      {t.scope === 'hub:contribute' ? '读取、分享、推荐与反馈' : '读取与使用'}
                    </td>
                    <td>{dateLabel(t.created_at)}</td>
                    <td className={tableCellStatusStyles}>
                      <span className={cn(tagStyles, !t.revoked_at ? tagTealStyles : '')}>
                        {t.revoked_at ? '已撤销' : '可用'}
                      </span>
                    </td>
                    <td className={tableCellActionsStyles}>
                      {!t.revoked_at && (
                        <button
                          className={cn(textBtnStyles, dangerTextStyles)}
                          disabled={revokingId !== null}
                          onClick={() => revoke('tokens', t.id)}
                        >
                          撤销
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        )}
      </section>
      <Overlay open={creatingToken} onClose={closeTokenForm} label="创建访问令牌" variant="sheet">
        {creatingToken && (
          <>
            <DialogTitle title="创建访问令牌" onClose={closeTokenForm} />
            <div className={cn(sheetScrollStyles, formStackStyles)}>
              <p className={subtleStyles}>为 CLI 或 Agent 创建独立令牌，无需离开安全设置。</p>
              <AccessTokenForm onDone={closeTokenForm} onBusyChange={setIssuingToken} />
            </div>
          </>
        )}
      </Overlay>
    </div>
  );
}
