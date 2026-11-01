import {
  credentialCenterStyles,
  credentialGuideStyles,
  credentialGridStyles,
  credentialCardStyles,
  credentialCardHeadStyles,
  credentialKindIconStyles,
  credentialMetaStyles,
  credentialFingerprintStyles,
  credentialCardFooterStyles,
  credentialRevokeStyles,
} from './styles.js';
import {
  formStackStyles,
  sectionHeadingStyles,
  countPillStyles,
  subtleStyles,
  btnStyles,
  btnPrimaryStyles,
  panelStyles,
  tagStyles,
  tagRedStyles,
  tagTealStyles,
  textBtnStyles,
  dangerTextStyles,
  tableCellStatusStyles,
  formActionsStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type { GitCredentialResponse } from '@capability-hub/contracts/http';
import {
  ArrowUpRight,
  Ban,
  Fingerprint,
  GitBranch,
  KeyRound,
  LockKeyhole,
  Plus,
  RotateCw,
} from '../../shared/icons/lucide.js';
import { useState } from 'react';
import { api } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { DataTable } from '../../shared/components/DataTable.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { Empty } from '../../shared/components/Empty.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { CardGridSkeleton } from '../../shared/components/Skeleton.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel } from '../../shared/format/labels.js';
import { CredentialForm } from './CredentialForm.js';
/**
 * 个人 Git 凭据库（`/api/git-credentials`）：密文保存且永不回显 Token 或私钥，
 * 只对登记时选定的 Git 域名生效。撤销是二次确认的软删除，需带 `If-Match: "<revision>"`
 * 请求头，冲突即整条撤销失败并提示；撤销只移除秘密材料，凭据记录与已发布的内容快照保留，
 * 因此已绑定的来源会立即失去访问能力而需要重新登记。
 */
export function GitCredentialsPanel() {
  const { refresh, reload } = useHub(),
    { data, error, loading } = useQuery<GitCredentialResponse[]>('/api/git-credentials', refresh);
  const [edit, setEdit] = useState<GitCredentialResponse | null>(),
    [revoke, setRevoke] = useState<GitCredentialResponse | null>(),
    [feedback, setFeedback] = useState(''),
    [busy, setBusy] = useState(false);
  const active = data?.filter((c) => !c.revoked_at) ?? [],
    revoked = data?.filter((c) => c.revoked_at) ?? [];
  return (
    <div className={cn(credentialCenterStyles, formStackStyles)}>
      <div className={sectionHeadingStyles}>
        <div>
          <h2>Git 凭据库 {data && <span className={countPillStyles}>{active.length}</span>}</h2>
          <p className={subtleStyles}>提前维护仓库访问方式，登记 Git 来源时按名称选择。</p>
        </div>
        <button className={cn(btnStyles, btnPrimaryStyles)} onClick={() => setEdit(null)}>
          <Plus size={16} />
          新增 Git 凭据
        </button>
      </div>
      <div className={credentialGuideStyles}>
        <LockKeyhole size={20} />
        <div>
          <strong>专属于你的仓库凭据</strong>
          <p>
            密文保存，不回显 Token 或私钥。仅对匹配的 Git
            域名生效；绑定的来源可在后台同步，撤销后停止使用。
          </p>
        </div>
        <a href="/publish?tab=git">
          <GitBranch size={15} />
          前往 Git 同步
          <ArrowUpRight size={14} />
        </a>
      </div>
      {feedback && <Message error>{feedback}</Message>}
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading && !data ? (
        <CardGridSkeleton label="正在加载 Git 凭据…" count={2} variant="source" />
      ) : !active.length ? (
        <Empty
          title="为你的仓库准备访问凭据"
          action={
            <button className={btnStyles} onClick={() => setEdit(null)}>
              <Plus size={15} />
              添加第一份凭据
            </button>
          }
        >
          支持 HTTPS Token 与 SSH 私钥。公开 HTTPS 仓库也可以直接使用，无需添加凭据。
        </Empty>
      ) : (
        <div className={credentialGridStyles}>
          {active.map((c) => (
            <section className={cn(panelStyles, credentialCardStyles)} key={c.id}>
              <div className={credentialCardHeadStyles}>
                <span className={credentialKindIconStyles}>
                  {c.kind === 'ssh' ? <Fingerprint size={23} /> : <KeyRound size={23} />}
                </span>
                <div>
                  <h3>{c.name}</h3>
                  <span className={subtleStyles}>
                    {c.host} · {c.username}
                  </span>
                </div>
                <span
                  className={cn(
                    tagStyles,
                    c.expires_at && Date.parse(c.expires_at) <= Date.now()
                      ? tagRedStyles
                      : tagTealStyles,
                  )}
                >
                  {c.expires_at && Date.parse(c.expires_at) <= Date.now() ? '已过期' : '可用'}
                </span>
              </div>
              <dl className={credentialMetaStyles}>
                <div>
                  <dt>认证方式</dt>
                  <dd>
                    {c.kind === 'ssh'
                      ? 'SSH 私钥'
                      : c.auth_method === 'bearer'
                        ? 'HTTPS Bearer Token'
                        : 'HTTPS 用户名 + Token'}
                  </dd>
                </div>
                <div>
                  <dt>绑定来源</dt>
                  <dd>{c.usage_count} 个</dd>
                </div>
                <div>
                  <dt>到期时间</dt>
                  <dd>{c.expires_at ? dateLabel(c.expires_at) : '未设置'}</dd>
                </div>
                {c.fingerprint && (
                  <div className={credentialFingerprintStyles}>
                    <dt>密钥指纹</dt>
                    <dd>
                      <code>{c.fingerprint}</code>
                    </dd>
                  </div>
                )}
              </dl>
              <div className={credentialCardFooterStyles}>
                <span>
                  <LockKeyhole size={13} />
                  已加密保存 · {dateLabel(c.updated_at)}
                </span>
                <button className={textBtnStyles} onClick={() => setEdit(c)}>
                  <RotateCw size={14} />
                  轮换
                </button>
                <button
                  className={cn(textBtnStyles, dangerTextStyles)}
                  onClick={() => setRevoke(c)}
                >
                  <Ban size={14} />
                  撤销
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
      {!!revoked.length && (
        <section className={panelStyles}>
          <h3>已撤销记录</h3>
          <DataTable label="已撤销凭据">
            <table>
              <thead>
                <tr>
                  <th>凭据</th>
                  <th>Git 域名</th>
                  <th>撤销时间</th>
                  <th className={tableCellStatusStyles}>状态</th>
                </tr>
              </thead>
              <tbody>
                {revoked.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.host}</td>
                    <td>{dateLabel(c.revoked_at!)}</td>
                    <td className={tableCellStatusStyles}>
                      <span className={tagStyles}>已撤销</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </section>
      )}
      <Overlay
        open={edit !== undefined}
        onClose={() => setEdit(undefined)}
        label={edit ? '轮换 Git 凭据' : '新增 Git 凭据'}
        variant="sheet"
      >
        {edit !== undefined && (
          <CredentialForm
            existing={edit}
            close={() => setEdit(undefined)}
            saved={() => {
              setEdit(undefined);
              reload();
            }}
          />
        )}
      </Overlay>
      <Overlay
        open={!!revoke}
        onClose={() => !busy && setRevoke(undefined)}
        label="撤销 Git 凭据"
        variant="palette"
      >
        {revoke && (
          <div className={credentialRevokeStyles}>
            <DialogTitle title="撤销 Git 凭据" onClose={() => setRevoke(undefined)} />
            <div className={formStackStyles}>
              <p>
                撤销「{revoke.name}」后，{revoke.usage_count}{' '}
                个绑定来源将无法继续使用它同步。已发布的内容快照保留。
              </p>
              <Message>秘密材料将移除，凭据记录保留；后续可新建凭据并更新来源。</Message>
              <div className={formActionsStyles}>
                <button className={btnStyles} disabled={busy} onClick={() => setRevoke(undefined)}>
                  取消
                </button>
                <Submit
                  busy={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api('/api/git-credentials/' + revoke.id, {
                        method: 'DELETE',
                        headers: { 'If-Match': `"${revoke.revision}"` },
                      });
                      setRevoke(undefined);
                      reload();
                    } catch (e) {
                      setFeedback(errorMessage(e));
                      setRevoke(undefined);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  确认撤销
                </Submit>
              </div>
            </div>
          </div>
        )}
      </Overlay>
    </div>
  );
}
