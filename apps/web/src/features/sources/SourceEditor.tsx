/**
 * Git 来源的新增/编辑抽屉：依赖 `/api/git-credentials` 列出可用凭据，
 * 保存时按是否有 `source` 走 `POST /api/sources` 或 `PATCH /api/sources/:id`（带 `revision`）。
 */
import { browserUuid } from '@capability-hub/logging/browser';
import { InputField } from '../../shared/components/InputField.js';
import { resourceKindIcons, sourceStateIcons } from '../../shared/components/select-icons.js';
import {
  sheetScrollStyles,
  formStackStyles,
  formRowStyles,
  dangerTextStyles,
  checkLabelStyles,
  textBtnStyles,
  btnStyles,
} from '../../shared/styles/recipes.js';
import { targetEditorStyles } from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { useState, type SubmitEvent } from 'react';
import type { Policy, Applicability } from '@capability-hub/contracts';
import type { SourceResponse, GitCredentialResponse } from '@capability-hub/contracts/http';
import { Plus, Trash2 } from '../../shared/icons/lucide.js';
import { ApiError, mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useQuery } from '../../shared/api/use-query.js';
import { useHub } from '../../shared/context/HubContext.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { KeywordField } from '../../shared/components/KeywordField.js';
import { PublicationPolicyFields } from '../publishing/PublicationPolicyFields.js';

/**
 * 仓库身份（URL）在编辑现有来源时只读：正本不可原地替换，更换需走受控迁移。
 * 凭据下拉按解析出的 host 与协议类型预筛，地址尚未成形时不筛（提交后由服务端校验）。
 * 保存成功后只回调 `onSaved`，由父级负责重载列表与关闭抽屉。
 */
export function SourceEditor({
  source,
  onClose,
  onSaved,
}: {
  source: SourceResponse | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { me } = useHub();
  const { data: personalCredentials, error: credentialError } =
    useQuery<GitCredentialResponse[]>('/api/git-credentials');
  const [url, setUrl] = useState(source?.canonical_url ?? ''),
    [branch, setBranch] = useState(source?.branch ?? 'main'),
    [group, setGroup] = useState(source?.owner_group_id ?? me?.groups[0]?.id ?? ''),
    [credential, setCredential] = useState(source?.credential_ref ?? ''),
    [state, setState] = useState(source?.state === 'paused' ? 'paused' : 'active'),
    [targets, setTargets] = useState<SourceTargetDraft[]>(
      source?.targets.map((t) => ({ ...t, binding_id: t.id })) ?? [newTarget()],
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [keys, setKeys] = useState(() => targets.map(() => browserUuid()));
  let repositoryHost = '',
    repositoryKind = '';
  try {
    const address = new URL(url.replace(/^([^@\s]+@[^/:]+):/, 'ssh://$1/'));
    repositoryHost = address.hostname;
    repositoryKind = address.protocol === 'ssh:' ? 'ssh' : 'token';
  } catch {
    // 地址未输入完整时暂不筛选凭据；提交时由服务端校验。
  }
  const availableCredentials = (personalCredentials ?? []).filter(
    (r) =>
      r.id === credential ||
      (!r.revoked_at &&
        (!r.expires_at || Date.parse(r.expires_at) > Date.now()) &&
        (!repositoryHost || (r.host === repositoryHost && r.kind === repositoryKind))),
  );
  const boundCredential = source?.credential_ref;
  const retainedCredential =
    boundCredential && !personalCredentials?.some((r) => r.id === boundCredential)
      ? boundCredential
      : undefined;
  function newTarget(): SourceTargetDraft {
    return {
      slug: '',
      kind: 'skill',
      path: '',
      enabled: true,
      category: 'uncategorized',
      scenario_ids: [],
      distribution: {
        mode: 'approved_audience',
        audience: [`group:${source?.owner_group_id ?? me?.groups[0]?.id}`],
      },
      applies_to: { keywords: [] },
    };
  }
  const update = (i: number, v: Partial<SourceTargetDraft>) =>
    setTargets((old) => old.map((t, n) => (n === i ? { ...t, ...v } : t)));
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const cleaned = targets.map((t) => ({
      slug: t.slug,
      kind: t.kind,
      path: t.path,
      category: t.category,
      scenario_ids: t.scenario_ids,
      distribution: t.distribution,
      applies_to: t.applies_to,
      ...(source
        ? {
            ...(t.binding_id ? { binding_id: t.binding_id, asset_id: t.asset_id } : {}),
            enabled: t.enabled,
          }
        : {}),
    }));
    try {
      await mutate(
        source ? '/api/sources/' + source.id : '/api/sources',
        source
          ? {
              branch,
              credential_ref: credential || null,
              ...(source.state === 'blocked' ? {} : { state }),
              targets: cleaned,
            }
          : {
              repository_url: url,
              provider: 'generic-git',
              branch,
              owner_group_id: group,
              ...(credential ? { credential_ref: credential } : {}),
              targets: cleaned,
            },
        source ? 'PATCH' : 'POST',
        source?.revision,
      );
      onSaved();
    } catch (e) {
      setError(
        errorMessage(e) +
          (e instanceof ApiError && e.code === 'REVISION_CONFLICT'
            ? '。你的输入已保留；请关闭并刷新来源后对照重新编辑。'
            : ''),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogTitle title={source ? '编辑 Git 来源' : '新增 Git 来源'} onClose={onClose} />
      <form className={cn(sheetScrollStyles, formStackStyles)} onSubmit={submit}>
        <label>
          仓库地址
          <InputField
            icon="link"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            readOnly={!!source}
            required
            placeholder="https://host/team/repo.git 或 git@host:team/repo.git"
          />
          {source && <small>仓库身份不可直接修改；更换正本需要受控迁移。</small>}
        </label>
        <div className={formRowStyles}>
          <label>
            分支
            <InputField
              icon="branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              required
              maxLength={255}
              placeholder="main"
            />
          </label>
          <label>
            维护团队
            <SelectField
              value={group}
              disabled={!!source}
              onValueChange={(nextValue) => setGroup(nextValue)}
            >
              {me?.groups.map((g) => (
                <option value={g.id} key={g.id}>
                  {g.name}
                </option>
              ))}
            </SelectField>
          </label>
        </div>
        <label>
          仓库访问凭据
          <SelectField
            value={credential}
            required={repositoryKind === 'ssh'}
            onValueChange={(nextValue) => setCredential(nextValue)}
          >
            <option value="" disabled={repositoryKind === 'ssh'}>
              {repositoryKind === 'ssh' ? '请选择 SSH 凭据' : '公开仓库 · 不使用凭据'}
            </option>
            {availableCredentials.map((r) => (
              <option
                key={r.id}
                value={r.id}
                disabled={
                  !!r.revoked_at || !!(r.expires_at && Date.parse(r.expires_at) <= Date.now())
                }
              >
                {r.name} · {r.kind === 'ssh' ? 'SSH' : 'Token'} · {r.host}
                {r.revoked_at
                  ? ' · 已撤销'
                  : r.expires_at && Date.parse(r.expires_at) <= Date.now()
                    ? ' · 已过期'
                    : ''}
              </option>
            ))}
            {retainedCredential && (
              <option value={retainedCredential}>当前绑定凭据 · 由所属账号维护</option>
            )}
          </SelectField>
          <small>
            请先在 <a href="/account?tab=credentials">个人中心 → Git 凭据</a> 维护 Token 或 SSH
            密钥。域名和认证方式须与仓库一致。
          </small>
          {personalCredentials &&
            repositoryKind === 'ssh' &&
            !availableCredentials.length &&
            !retainedCredential && (
              <small className={dangerTextStyles}>
                该域名暂无可用的 SSH 凭据，请先在个人中心添加。
              </small>
            )}
        </label>
        {credentialError && <Message error>{credentialError}</Message>}
        {source && source.state !== 'blocked' && (
          <label>
            同步状态
            <SelectField
              optionIcons={sourceStateIcons}
              value={state}
              onValueChange={(nextValue) => setState(nextValue)}
            >
              <option value="active">活动</option>
              <option value="paused">暂停</option>
            </SelectField>
          </label>
        )}
        <h3>精确读取目标</h3>
        {targets.map((t, i) => (
          <fieldset className={targetEditorStyles} key={keys[i]}>
            <legend>目标 {i + 1}</legend>
            <div className={formRowStyles}>
              <label>
                资产名称
                <InputField
                  icon="package"
                  value={t.slug}
                  readOnly={!!t.binding_id}
                  required
                  maxLength={64}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  onChange={(e) => update(i, { slug: e.target.value })}
                  placeholder="java-conventions"
                />
              </label>
              <label>
                类型
                <SelectField
                  optionIcons={resourceKindIcons}
                  value={t.kind}
                  disabled={!!t.binding_id}
                  onValueChange={(nextValue) =>
                    update(i, { kind: nextValue as SourceTargetDraft['kind'] })
                  }
                >
                  <option value="skill">Skill 目录</option>
                  <option value="mcp">MCP 描述文件</option>
                </SelectField>
              </label>
            </div>
            <label>
              读取路径
              <InputField
                icon="folder"
                value={t.path}
                onChange={(e) => update(i, { path: e.target.value })}
                required
                maxLength={240}
                placeholder={
                  t.kind === 'skill' ? '.agents/skills/java-conventions' : 'mcp/docs/server.json'
                }
              />
              <small>
                {t.kind === 'skill'
                  ? '填写包含 SKILL.md 的目录，仓库根可用单独的 .'
                  : '填写具体 server.json 文件路径'}
                ；不支持通配符。
              </small>
            </label>
            <PublicationPolicyFields value={t} onChange={(v) => update(i, v)} />
            <KeywordField
              value={t.applies_to.keywords ?? []}
              onChange={(keywords) => update(i, { applies_to: { ...t.applies_to, keywords } })}
            />
            {t.binding_id ? (
              <label className={checkLabelStyles}>
                <input
                  type="checkbox"
                  checked={t.enabled}
                  onChange={(e) => update(i, { enabled: e.target.checked })}
                />
                <span>启用目标（停用仍保留资产身份）</span>
              </label>
            ) : (
              targets.length > 1 && (
                <button
                  className={cn(textBtnStyles, dangerTextStyles)}
                  type="button"
                  onClick={() => {
                    setTargets((old) => old.filter((_, n) => n !== i));
                    setKeys((old) => old.filter((_, n) => n !== i));
                  }}
                >
                  <Trash2 size={14} />
                  移除新目标
                </button>
              )
            )}
          </fieldset>
        ))}
        <button
          className={btnStyles}
          type="button"
          onClick={() => {
            setTargets((old) => [...old, newTarget()]);
            setKeys((old) => [...old, browserUuid()]);
          }}
        >
          <Plus size={15} />
          添加读取目标
        </button>
        <Message>保存只更新读取配置；同步成功后需确认具体快照并提交审核，不会直接发布。</Message>
        {error && <Message error>{error}</Message>}
        <Submit busy={busy}>保存来源配置</Submit>
      </form>
    </>
  );
}

type SourceTargetDraft = Policy & {
  slug: string;
  kind: 'skill' | 'mcp';
  path: string;
  binding_id?: string;
  asset_id?: string;
  enabled?: boolean;
  applies_to: Applicability;
};
