import { InputField } from '../../shared/components/InputField.js';
import {
  formStackStyles,
  installationContentStyles,
  btnStyles,
  btnPrimaryStyles,
  subtleStyles,
  formActionsStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import type { IssuedTokenResponse } from '@capability-hub/contracts/http';
import { KeyRound } from '../../shared/icons/lucide.js';
import { useRef, useState, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { CodeBlock } from '../../shared/components/CodeBlock.js';
import { Message } from '../../shared/components/Message.js';
import { Segmented } from '../../shared/components/Segmented.js';
import { Submit } from '../../shared/components/Submit.js';
import { useHub } from '../../shared/context/HubContext.js';

/**
 * 新建个人访问令牌：明文只在 `POST /api/tokens` 的响应里返回一次，保存在本地 state 中，
 * 关闭或点击「我已安全保存」后即丢弃，无法再次查看。令牌长期有效、只能撤销，
 * 在途请求与尚未收起的回执都会阻止重复签发，切换客户端只重置草稿。
 */
export function AccessTokenForm({
  defaultName = '',
  onDone,
  onBusyChange,
}: {
  defaultName?: string;
  onDone?: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { reload } = useHub();
  const pending = useRef(false);
  const [scope, setScope] = useState<'hub:read' | 'hub:contribute'>('hub:read');
  const [receipt, setReceipt] = useState<{ token: string; name: string }>();
  const [draftFor, setDraftFor] = useState(defaultName);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (draftFor !== defaultName) {
    setDraftFor(defaultName);
    setScope('hub:read');
    setError('');
  }

  async function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || receipt) return;
    const value = new FormData(event.currentTarget).get('name');
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name) {
      setError('请输入令牌名称');
      return;
    }
    pending.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError('');
    try {
      const result = await mutate<IssuedTokenResponse>('/api/tokens', { name, scope });
      setReceipt({ token: result.token, name });
      reload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      pending.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  if (receipt)
    return (
      <div className={installationContentStyles}>
        <Message>
          令牌「{receipt.name}」已创建，只展示这一次。请先复制并安全保存，关闭后无法再次查看。
        </Message>
        <div data-sensitive="" className="min-w-0">
          <CodeBlock title="个人 Hub 访问令牌" code={receipt.token} />
        </div>
        <div>
          <button
            type="button"
            className={cn(btnStyles, btnPrimaryStyles)}
            onClick={() => {
              setReceipt(undefined);
              onDone?.();
            }}
          >
            我已安全保存，隐藏令牌
          </button>
        </div>
      </div>
    );

  return (
    <form className={formStackStyles} onSubmit={create} autoComplete="off">
      <label>
        令牌名称
        <InputField
          key={defaultName}
          icon="tag"
          name="name"
          defaultValue={defaultName}
          placeholder="例如：工作电脑 · Codex"
          required
          maxLength={80}
          disabled={busy}
        />
      </label>
      <Segmented
        id="token-scope"
        label="访问令牌权限"
        value={scope}
        onChange={(value) => {
          if (!pending.current) setScope(value);
        }}
        options={[
          { id: 'hub:read', label: '读取与使用' },
          { id: 'hub:contribute', label: '读取、分享、推荐与反馈' },
        ]}
      />
      <p className={subtleStyles}>
        {scope === 'hub:read'
          ? '可搜索、加载和安装资源，也可在 CLI 提交和跟进本人的平台反馈；MCP 贡献需另行授权。'
          : '另可经 MCP 分享 Skill、推荐资源与提交资源反馈；资产权限仍由你的角色决定。'}
      </p>
      <p className={subtleStyles}>令牌长期有效，可在账号安全中随时撤销。创建后请立即复制保存。</p>
      {error && <Message error>{error}</Message>}
      <div className={formActionsStyles}>
        {onDone && (
          <button className={btnStyles} type="button" onClick={onDone} disabled={busy}>
            取消
          </button>
        )}
        <Submit busy={busy}>
          <KeyRound size={15} />
          生成令牌
        </Submit>
      </div>
    </form>
  );
}
