import { useState, type SubmitEvent } from 'react';
import type { McpSharedKeysResponse } from '@capability-hub/contracts/http';
import { mcpSharedKeyValueSchema } from '@capability-hub/contracts';
import { mutate } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { InputField } from '../../shared/components/InputField.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { Message } from '../../shared/components/Message.js';
import { McpSharingConfirmation } from '../../shared/components/McpSharingConfirmation.js';
import { Submit } from '../../shared/components/Submit.js';
import { btnStyles, formStackStyles } from '../../shared/styles/recipes.js';

/** 密钥只可替换或移除，读取维护表单只获取绑定状态。 */
export function McpSharedKeysForm({
  assetId,
  assetSlug,
  onSaved,
}: {
  assetId: string;
  assetSlug: string;
  onSaved: () => void;
}) {
  const path = '/api/management/assets/' + assetId + '/mcp-keys';
  const { data, error: loadError } = useQuery<McpSharedKeysResponse>(path);
  const [index, setIndex] = useState('0');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    target: McpSharedKeysResponse['targets'][number];
    value: string;
    revision: number;
  }>();
  const target = data?.targets[Number(index)];
  async function save(
    selected: McpSharedKeysResponse['targets'][number],
    secret: string | null,
    revision: number,
  ) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await mutate(
        path,
        {
          url: selected.url,
          name: selected.name,
          scheme: selected.scheme,
          value: secret,
          ...(secret !== null ? { confirm_sharing: true } : {}),
        },
        'PUT',
        revision,
      );
      setValue('');
      onSaved();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!target || !data || busy || pending) return;
    const parsed = mcpSharedKeyValueSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError('');
    setPending({ target, value: parsed.data, revision: data.revision });
  }
  if (loadError) return <Message error>{loadError}</Message>;
  if (!data) return null;
  if (!target)
    return (
      <Message>
        当前发布版本尚未声明可共享的 API Key 或 Bearer Token。可在“更新版本”的服务地址表单中添加。
      </Message>
    );
  return (
    <>
      <form className={formStackStyles} onSubmit={submit} aria-label="MCP 共享凭据">
        <h3>MCP 共享凭据</h3>
        <label>
          服务地址与请求头
          <SelectField
            value={index}
            disabled={busy}
            onValueChange={(next) => {
              setIndex(next);
              setValue('');
              setError('');
            }}
          >
            {data.targets.map((item, i) => (
              <option key={JSON.stringify([item.url, item.name, item.scheme])} value={String(i)}>
                {item.scheme === 'bearer' ? 'Bearer Token' : 'API Key'} · {item.name} · {item.url}
              </option>
            ))}
          </SelectField>
        </label>
        <label>
          {target.configured ? '替换共享' : '共享'}{' '}
          {target.scheme === 'bearer' ? 'Bearer Token' : 'API Key'}
          <InputField
            icon="key"
            type="password"
            autoComplete="new-password"
            maxLength={4096}
            placeholder={
              target.scheme === 'bearer'
                ? '输入 Token 原值，省略 Bearer 前缀'
                : '输入服务签发的 API Key'
            }
            required
            disabled={busy}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <small>
            {target.scheme === 'bearer' ? '仅填写团队服务账号的 Token 原值。' : ''}
            已登录且有该版本读取权限的人可以在安装配置中查看、复制真实凭据。
          </small>
        </label>
        {error && <Message error>{error}</Message>}
        <Submit type="submit" busy={busy} disabled={!value}>
          保存共享凭据
        </Submit>
        {target.configured && (
          <button
            type="button"
            className={btnStyles}
            disabled={busy}
            onClick={() => void save(target, null, data.revision)}
          >
            移除共享凭据
          </button>
        )}
      </form>
      {pending && (
        <McpSharingConfirmation
          details={{
            asset: assetSlug,
            url: pending.target.url,
            name: pending.target.name,
            scheme: pending.target.scheme,
            action: pending.target.configured ? 'replace' : 'save',
          }}
          onCancel={() => setPending(undefined)}
          onConfirm={() => {
            setPending(undefined);
            void save(pending.target, pending.value, pending.revision);
          }}
        />
      )}
    </>
  );
}
