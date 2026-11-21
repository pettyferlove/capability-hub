import { conversationInstallStyles, installationLoginStyles } from './styles.js';
import {
  subtleStyles,
  textBtnStyles,
  formRowStyles,
  installationRouteStyles,
} from '../../shared/styles/recipes.js';
import { AgentClientSelect } from '../../shared/components/AgentClientSelect.js';
import type { ClientConfigurationResponse } from '@capability-hub/contracts/http';
import { publicResourcePath } from '@capability-hub/contracts';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../shared/api/client.js';
import { useHub } from '../../shared/context/HubContext.js';
import { CodeBlock } from '../../shared/components/CodeBlock.js';
import { CliInstallationGuide } from '../../shared/components/CliInstallationGuide.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { installationPrompt } from './installation-prompt.js';
import type { AssetView } from './asset-view.js';
import {
  agentSkillInstallPrompt,
  cliResourceCommand,
  hubMcpConfigurationPrompt,
  installationMethods,
  type InstallationClient,
} from './installation-methods.js';

/**
 * 「使用与安装」标签的内容，按 {@link installationMethods} 的结果三选一：
 * 公开资源给对话安装指令，Skill 给 CLI 命令，MCP 交给受限配置表单。
 * 各分支都锁定视图展示的发布，因此安装结果与页面展示的版本一致。
 * 渲染与切换页签不请求配置或票据，只有用户点「生成配置预览」才取配置。
 */
export function ResourceInstallation({ view, origin }: { view: AssetView; origin: string }) {
  const { me } = useHub();
  const { asset, release } = view;
  const methods = installationMethods(view);
  const [client, setClient] = useState<InstallationClient>('codex');
  if (methods.conversation)
    return (
      <section className={conversationInstallStyles} aria-label="公开资源对话安装">
        <h3>对话安装</h3>
        <p className={subtleStyles}>复制指令到 Agent 对话中安装此资源。</p>
        <CodeBlock title="安装指令" code={installationPrompt(view, origin)} />
        <a
          className={textBtnStyles}
          href={publicResourcePath(asset.kind, asset.slug, release.version_label)}
          download={`${asset.slug}-install.md`}
        >
          下载安装说明
        </a>
      </section>
    );
  if (asset.kind === 'skill')
    return (
      <section className={conversationInstallStyles} aria-label="受限 Skill 安装">
        <h3>CLI 安装</h3>
        <p className={subtleStyles}>使用有访问权限的账号授权 CLI，安装到指定目录。</p>
        <AgentClientSelect value={client} onChange={setClient} />
        <CliLogin />
        <CodeBlock
          title="安装到当前项目 · 可修改目标目录"
          code={cliResourceCommand(view, origin, undefined, client)}
        />
        <p className={subtleStyles}>
          已接入 Hub 的 Agent 可使用一次性下载票据安装，无需另外登录 CLI。
        </p>
        <CodeBlock
          title="交给 Agent 安装"
          code={agentSkillInstallPrompt(
            [{ slug: asset.slug, version_label: release.version_label }],
            origin,
            client,
          )}
        />
      </section>
    );
  return (
    <RestrictedMcpInstallation
      key={release.release_id + ':' + (me?.id ?? '')}
      view={view}
      origin={origin}
    />
  );
}

function CliLogin() {
  return (
    <details className={installationLoginStyles}>
      <summary>首次使用：安装与授权 CLI</summary>
      <CliInstallationGuide />
    </details>
  );
}

function RestrictedMcpInstallation({ view, origin }: { view: AssetView; origin: string }) {
  const { options, cli } = installationMethods(view);
  const [client, setClient] = useState<InstallationClient>('codex');
  const [optionId, setOptionId] = useState(options[0]?.option_id ?? '');
  const shared = options.find((option) => option.option_id === optionId)?.has_shared_key;
  const [configuration, setConfiguration] = useState<ClientConfigurationResponse>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    setConfiguration(undefined);
    setError('');
    setBusy(false);
    pending.current?.abort();
    return () => pending.current?.abort();
  }, [client, optionId, shared]);

  async function previewConfiguration() {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setConfiguration(undefined);
    setBusy(true);
    setError('');
    try {
      const result = await api<ClientConfigurationResponse>(
        `/api/versions/${view.release.version_id}/mcp-config?` +
          new URLSearchParams({
            installation_option_id: optionId,
            client,
            scope: shared ? 'user' : 'project',
          }).toString(),
        { signal: request.signal },
      );
      if (!request.signal.aborted) setConfiguration(result);
    } catch (error) {
      if (!request.signal.aborted)
        setError(error instanceof Error ? error.message : '配置生成失败');
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  if (!options.length)
    return (
      <section className={conversationInstallStyles} aria-label="受限 MCP 获取方式">
        <h3>MCP 配置</h3>
        <p className={subtleStyles}>
          当前安装项暂不支持 CLI 或 Hub MCP 配置生成。请下载 server.json，按目标客户端要求配置。
        </p>
      </section>
    );
  return (
    <section className={conversationInstallStyles} aria-label="受限 MCP 配置方式">
      <h3>配置 MCP</h3>
      <p className={subtleStyles}>
        选择客户端和安装项，可预览此版本的配置或交给已接入 Hub MCP 的 Agent 生成。
      </p>
      <div className={formRowStyles}>
        <AgentClientSelect value={client} onChange={setClient} />
        <label>
          安装项
          <SelectField value={optionId} onValueChange={setOptionId}>
            {options.map((option) => (
              <option key={option.option_id} value={option.option_id}>
                {option.option_id} · {option.kind === 'remote' ? '远程 HTTP' : option.registryType}
              </option>
            ))}
          </SelectField>
        </label>
      </div>
      {shared && (
        <Message>登录后生成的配置包含共享密钥。请保存到客户端的用户配置，轮换后重新获取。</Message>
      )}
      {cli && (
        <details className={installationRouteStyles} open>
          <summary>通过 CLI 生成配置</summary>
          <CliLogin />
          <CodeBlock
            title={shared ? '生成用户配置 · 含共享密钥' : '生成项目配置 · 保留现有客户端设置'}
            code={cliResourceCommand(view, origin, optionId, client)}
          />
        </details>
      )}
      <details className={installationRouteStyles} open={!cli}>
        <summary>通过 Hub MCP 生成配置</summary>
        <p className={subtleStyles}>先在 Agent 中接入 Hub MCP，再复制以下请求。</p>
        <CodeBlock
          title="Hub MCP 配置请求"
          code={hubMcpConfigurationPrompt(view, optionId, client)}
        />
        <a className={textBtnStyles} href="/connect">
          Hub MCP 接入说明
        </a>
      </details>
      <p className={subtleStyles}>配置写入、变量设置和连接验证在目标客户端完成。</p>
      <details className={installationRouteStyles}>
        <summary>预览客户端配置</summary>
        <Submit type="button" busy={busy} onClick={previewConfiguration}>
          生成配置预览
        </Submit>
        {error && <Message error>{error}</Message>}
        {configuration && (
          <>
            <CodeBlock title={configuration.target_file} code={configuration.text} />
            {configuration.required_variables.map((variable) => (
              <Message key={variable.name}>{variable.instruction}</Message>
            ))}
            {configuration.notes.map((note) => (
              <p key={note} className={subtleStyles}>
                {note}
              </p>
            ))}
          </>
        )}
      </details>
    </section>
  );
}
