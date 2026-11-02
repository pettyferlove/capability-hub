import { InputField } from '../../shared/components/InputField.js';
import {
  credentialKindIcons,
  credentialMethodIcons,
} from '../../shared/components/select-icons.js';
import {
  sheetScrollStyles,
  formStackStyles,
  formRowStyles,
  monoStyles,
  formActionsStyles,
  btnStyles,
} from '../../shared/styles/recipes.js';
import { credentialFormStyles } from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type { GitCredentialResponse } from '@capability-hub/contracts/http';
import { LockKeyhole } from '../../shared/icons/lucide.js';
import { useState, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { formFields } from '../../shared/api/form-fields.js';
import { DateTimeField } from '../../shared/components/DateTimeField.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { useHub } from '../../shared/context/HubContext.js';

/**
 * Git 凭据新增/轮换表单：密文提交后不回显 Token 与私钥，轮换时必须回传 `existing.revision`
 * 做乐观并发校验。`kind` 与 `host` 一旦创建即锁定（`existing` 存在时下拉禁用，提交时强制沿用
 * 原值），换仓库域名只能新建一份；SSH 私钥固定按 `basic` 认证方式入库。
 */
export function CredentialForm({
  existing,
  close,
  saved,
}: {
  existing: GitCredentialResponse | null | undefined;
  close: () => void;
  saved: () => void;
}) {
  const { me } = useHub();
  const [kind, setKind] = useState(existing?.kind ?? 'token'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = e.currentTarget;
    try {
      const fields = formFields(form);
      const b = {
        ...fields,
        kind,
        expires_at: fields.expires_at ? new Date(fields.expires_at).toISOString() : null,
        host: existing?.host ?? fields.host,
        auth_method: kind === 'ssh' ? 'basic' : fields.auth_method,
      };
      await mutate(
        '/api/git-credentials' + (existing ? '/' + existing.id : ''),
        b,
        existing ? 'PUT' : 'POST',
        existing?.revision,
      );
      saved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogTitle title={existing ? '轮换 Git 凭据' : '新增 Git 凭据'} onClose={close} />
      <form
        className={cn(sheetScrollStyles, formStackStyles, credentialFormStyles)}
        onSubmit={submit}
        autoComplete="off"
      >
        <Message>
          凭据在当前 Hub 加密保存。Token 与私钥不回显；请使用仓库只读权限，并核对目标域名。
        </Message>
        <label>
          凭据名称
          <InputField
            icon="tag"
            name="name"
            defaultValue={existing?.name}
            required
            maxLength={80}
            placeholder="例如 工作 GitLab · 只读"
          />
        </label>
        <div className={formRowStyles}>
          <label>
            认证方式
            <SelectField
              optionIcons={credentialKindIcons}
              value={kind}
              disabled={!!existing}
              onValueChange={(nextValue) => setKind(nextValue as 'token' | 'ssh')}
            >
              <option value="token">HTTPS Token</option>
              <option value="ssh">SSH 私钥</option>
            </SelectField>
          </label>
          <label>
            Git 域名
            <SelectField
              name="host"
              required
              defaultValue={existing?.host ?? me?.features.git_hosts[0]}
              disabled={!!existing}
            >
              {me?.features.git_hosts.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </SelectField>
          </label>
        </div>
        <label>
          Git 用户名
          <InputField
            icon="user"
            name="username"
            required
            defaultValue={existing?.username ?? 'git'}
            maxLength={80}
            placeholder={kind === 'ssh' ? '通常为 git' : '由 Git 平台规定的用户名'}
          />
          <small>
            {kind === 'ssh'
              ? '远端 SSH 登录账号，通常为 git。'
              : '填写 Git 用户名或平台指定的 Token 用户名。'}
          </small>
        </label>
        {kind === 'token' ? (
          <>
            <label>
              HTTP 认证格式
              <SelectField
                optionIcons={credentialMethodIcons}
                name="auth_method"
                defaultValue={existing?.auth_method ?? 'basic'}
              >
                <option value="basic">用户名 + Token（Basic）</option>
                <option value="bearer">Bearer Token</option>
              </SelectField>
            </label>
            <label>
              {existing ? '新的 Token' : 'Token'}
              <InputField
                icon="key"
                name="secret"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={4096}
                placeholder="粘贴只读访问 Token"
              />
            </label>
          </>
        ) : (
          <>
            <label>
              {existing ? '新的 SSH 私钥' : 'SSH 私钥'}
              <textarea
                name="secret"
                autoComplete="off"
                spellCheck={false}
                className={monoStyles}
                required
                maxLength={32768}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              />
            </label>
            <label>
              私钥口令 <small>仅加密私钥必填</small>
              <InputField
                icon="lock"
                name="passphrase"
                type="password"
                autoComplete="new-password"
                maxLength={1024}
                placeholder="输入私钥的解密口令"
              />
            </label>
            <label>
              服务器主机公钥
              <textarea
                name="host_key"
                className={monoStyles}
                defaultValue={existing?.host_key ?? ''}
                required
                maxLength={8192}
                spellCheck={false}
                placeholder="ssh-ed25519 AAAA…"
              />
              <small>
                从 Git 平台官方配置或可信管理员处核对，填写算法与 Base64
                公钥部分。同步严格校验主机身份。
              </small>
            </label>
          </>
        )}
        <label>
          到期时间 <small>选填</small>
          <DateTimeField name="expires_at" defaultValue={existing?.expires_at ?? undefined} />
        </label>
        {error && <Message error>{error}</Message>}
        <div className={formActionsStyles}>
          <button className={btnStyles} type="button" onClick={close} disabled={busy}>
            取消
          </button>
          <Submit busy={busy}>
            <LockKeyhole size={15} />
            {existing ? '保存并轮换' : '加密保存凭据'}
          </Submit>
        </div>
      </form>
    </>
  );
}
