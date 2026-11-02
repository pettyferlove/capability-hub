import { conversationInstallStyles, installationLoginStyles } from './styles.js';
import {
  subtleStyles,
  textBtnStyles,
  formRowStyles,
  installationRouteStyles,
} from '../../shared/styles/recipes.js';
import { AgentClientSelect } from '../../shared/components/AgentClientSelect.js';
import type { AssetResponse, ClientConfigurationResponse } from '@capability-hub/contracts/http';
import { publicResourcePath } from '@capability-hub/contracts';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../shared/api/client.js';
import { useHub } from '../../shared/context/HubContext.js';
import { CodeBlock } from '../../shared/components/CodeBlock.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { installationPrompt } from './installation-prompt.js';
import {
  cliLoginCommand,
  cliResourceCommand,
  hubMcpConfigurationPrompt,
  installationMethods,
  type InstallationClient,
} from './installation-methods.js';

/**
 * 「使用与安装」标签的内容，按 {@link installationMethods} 的结果三选一：
 * 公开资源给对话安装指令，Skill 给 CLI 命令，MCP 交给受限配置表单。
 * 各分支都使用当前发布版本，因此安装结果与页面展示的版本一致。
 */
export function ResourceInstallation({ asset, origin }: { asset: AssetResponse; origin: string }) {
  const { me } = useHub();
  const methods = installationMethods(asset);
  const [client, setClient] = useState<InstallationClient>('codex');
  if (methods.conversation)
    return (
      <section className={conversationInstallStyles} aria-label="公开资源对话安装">
        <h3>对话安装</h3>
        <p className={subtleStyles}>复制指令到 Agent 对话中安装此资源。</p>
        <CodeBlock title="安装指令" code={installationPrompt(asset, origin)} />
        <a
          className={textBtnStyles}
          href={publicResourcePath(asset.kind, asset.slug, asset.current_release.version_label)}
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
        <CliLogin origin={origin} />
        <CodeBlock
          title="安装到当前项目 · 可修改目标目录"
          code={cliResourceCommand(asset, origin, undefined, client)}
        />
        <p className={subtleStyles}>
          也可让已接入 Hub 的 Agent 调用 install_skill 获取完整安装包，再确认目录并安装。
        </p>
        <CodeBlock
          title="交给 Agent 安装"
          code={`请调用 install_skill，固定 version_id 为 ${asset.current_release.version_id}，client 为 ${client}，获取完整安装包并校验摘要。先展示安装目录与文件，得到我确认后再写入，保留已有目录。`}
        />
      </section>
    );
  return (
    <RestrictedMcpInstallation
      key={asset.current_release.release_id + ':' + (me?.id ?? '')}
      asset={asset}
      origin={origin}
    />
  );
}

function CliLogin({ origin }: { origin: string }) {
  return (
    <details className={installationLoginStyles}>
      <summary>首次使用：授权 CLI</summary>
      <p className={subtleStyles}>
        安装部署方提供的 CLI 后运行登录命令，在浏览器核对授权码并确认；后续命令使用保存的授权。
      </p>
      <CodeBlock title="CLI 登录" code={cliLoginCommand(origin)} />
    </details>
  );
}

function RestrictedMcpInstallation({ asset, origin }: { asset: AssetResponse; origin: string }) {
  const options = installationMethods(asset).options;
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
        `/api/versions/${asset.current_release.version_id}/mcp-config?` +
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
        选择客户端和安装项，通过已授权的 CLI 或 Hub MCP 获取此版本的配置。
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
      <details className={installationRouteStyles} open>
        <summary>通过 CLI 生成配置</summary>
        <CliLogin origin={origin} />
        <CodeBlock
          title={shared ? '生成用户配置 · 含共享密钥' : '生成项目配置 · 保留现有客户端设置'}
          code={cliResourceCommand(asset, origin, optionId, client)}
        />
      </details>
      <details className={installationRouteStyles}>
        <summary>通过 Hub MCP 生成配置</summary>
        <p className={subtleStyles}>先在 Agent 中接入 Hub MCP，再复制以下请求。</p>
        <CodeBlock
          title="Hub MCP 配置请求"
          code={hubMcpConfigurationPrompt(asset, optionId, client)}
        />
        <a className={textBtnStyles} href="/connect">
          Hub MCP 接入说明
        </a>
      </details>
      <p className={subtleStyles}>
        CLI 与 Hub MCP 输出配置；配置写入、变量设置和连接验证在目标客户端完成。
      </p>
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
