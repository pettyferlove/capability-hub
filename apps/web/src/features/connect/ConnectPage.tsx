/**
 * 连接页：把团队能力接进 Agent 的入口，兼作三类授权回调的落点——`authorization=<requestId>`
 * 交给 {@link ConnectionAuthorization}，`code=<授权码>` 交给 CLI 审批，其余情况展示连接指引。
 * 依赖 `/api/hub-share` 生成 Hub MCP 配置、`/api/cli/approve` 批准 CLI 登录，
 * 以及 `hubMcpConnectionGuide` / `agentClients` 契约。
 */
import { InputField } from '../../shared/components/InputField.js';
import { configurationScopeIcons } from '../../shared/components/select-icons.js';
import { checkLabelStyles } from '../../shared/styles/recipes.js';
import {
  panelStyles,
  formStackStyles,
  btnStyles,
  btnPrimaryStyles,
  connectLayoutStyles,
  panelHeadingStyles,
  stepNumberStyles,
  subtleStyles,
  codewrapStyles,
  textBtnStyles,
  installationRouteStyles,
} from '../../shared/styles/recipes.js';
import {
  connectionAuthorizationStyles,
  connectOverviewStyles,
  connectEntryStyles,
  connectionMethodsStyles,
  connectionMethodStyles,
  isActiveStyles,
  connectionStepsStyles,
  connectToolboxStyles,
} from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import {
  agentClients,
  agentClientSchema,
  agentConfigurationScopeSchema,
  hubMcpConnectionGuide,
  type AgentClient,
  type HubShareResponse,
} from '@capability-hub/contracts';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { ListSkeleton } from '../../shared/components/Skeleton.js';
import { useState } from 'react';
import { ArrowRight, Link, ShieldCheck } from '../../shared/icons/lucide.js';
import { AgentClientSelect } from '../../shared/components/AgentClientSelect.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { CopyButton } from '../../shared/components/CopyButton.js';
import { CodeBlock } from '../../shared/components/CodeBlock.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useHub } from '../../shared/context/HubContext.js';
import { loginHref } from '../../shared/navigation/history-route.js';
import { AccessTokenForm } from '../profile/AccessTokenForm.js';
import { ConnectedAgents } from '../profile/ConnectedAgents.js';
import { ConnectionAuthorization } from './ConnectionAuthorization.js';
import { ConversationInstallIntro } from './ConversationInstallIntro.js';
import { AgentConversationDemo } from './AgentConversationDemo.js';
import { HubToolbox } from './HubToolbox.js';

/**
 * 路由查询串决定视图：带授权参数时只渲染确认区，未登录则引导登录并带回跳地址；
 * 否则渲染连接指引、已连接客户端与演示区。`routeQuery` 可注入以便测试，默认取当前地址。
 */
export default function ConnectPage({ routeQuery = location.search }: { routeQuery?: string }) {
  const { me } = useHub();
  const query = new URLSearchParams(routeQuery);
  const authorization = query.get('authorization');
  const code = query.get('code');
  const approving = !!authorization || !!code;
  return (
    <>
      <PageHead
        eyebrow="CAPABILITIES, WHERE YOU WORK"
        title={approving ? '确认连接' : '连接你的 Agent'}
        description={
          approving
            ? '确认本次请求，让 Agent 以你的身份使用团队能力。'
            : '把团队的 Skill 与 MCP 带进工作流。连接、授权，开始使用。'
        }
      />
      {approving ? (
        me ? (
          authorization ? (
            <ConnectionAuthorization key={authorization} requestId={authorization} />
          ) : (
            <CliApproval initialCode={code!} />
          )
        ) : (
          <section className={cn(panelStyles, formStackStyles, connectionAuthorizationStyles)}>
            <h2>登录后继续授权</h2>
            <p>登录你的 Hub 账号，随后确认本次连接请求。</p>
            <a
              className={cn(btnStyles, btnPrimaryStyles)}
              href={loginHref(location.pathname + location.search)}
            >
              登录并继续
              <ArrowRight size={15} />
            </a>
          </section>
        )
      ) : (
        <div className="grid min-w-0 gap-[var(--section-gap)]">
          <HubConnection />
          {me && <ConnectedAgents className="my-0" />}
          <div className={connectOverviewStyles}>
            <ConversationInstallIntro />
            <AgentConversationDemo />
          </div>
        </div>
      )}
    </>
  );
}
function CliApproval({ initialCode }: { initialCode: string }) {
  const [code, setCode] = useState(initialCode);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <section className={cn(panelStyles, formStackStyles, connectionAuthorizationStyles)}>
      <h2>确认 CLI 登录</h2>
      <p>仅批准你自己刚发起的 CLI 登录。核对终端中显示的授权码。</p>
      <label>
        授权码
        <InputField
          icon="key"
          value={code}
          disabled={busy || approved}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={8}
        />
      </label>
      {approved ? (
        <Message>已批准，回到 CLI 等待登录完成。</Message>
      ) : (
        <Submit
          busy={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await mutate('/api/cli/approve', { code });
              setApproved(true);
            } catch (error) {
              setError(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          确认这是我的 CLI 并批准
        </Submit>
      )}
      {error && <Message error>{error}</Message>}
    </section>
  );
}
function HubConnection() {
  const { me } = useHub();
  const [initial] = useState(() => {
    const query = new URLSearchParams(location.search);
    return {
      client: agentClientSchema.safeParse(query.get('client')).data ?? 'codex',
      scope: agentConfigurationScopeSchema.safeParse(query.get('scope')).data ?? 'project',
      contribute: query.get('permission') === 'contribute',
      method: query.get('method') === 'assistant' ? ('assistant' as const) : ('oauth' as const),
      manual: query.get('method') === 'token',
    };
  });
  const [scope, setScope] = useState<'project' | 'user'>(initial.scope);
  const [client, setClient] = useState<AgentClient>(initial.client);
  const [contribute, setContribute] = useState(initial.contribute);
  const [manualOpen, setManualOpen] = useState(initial.manual);
  const permission = contribute ? 'contribute' : 'read';
  const [method, setMethod] = useState<'oauth' | 'assistant'>(initial.method);
  const { data: invitation, error } = useQuery<HubShareResponse>('/api/hub-share');
  if (error) return <ErrorState message={error} />;
  if (!invitation) return <ListSkeleton rows={3} label="正在准备连接方案…" />;
  const config = hubMcpConnectionGuide(
    client,
    new URL(invitation.installation_url).origin,
    scope,
    method,
    permission,
  );
  const manual = hubMcpConnectionGuide(client, config.hub_url, scope, 'token');
  return (
    <div className={connectLayoutStyles}>
      <section
        className={cn(
          panelStyles,
          connectEntryStyles,
          formStackStyles,
          'scroll-mt-28 max-[600px]:scroll-mt-24',
        )}
        id="hub-connection"
      >
        <div className={panelHeadingStyles}>
          <span className={stepNumberStyles}>
            <Link size={20} />
          </span>
          <div>
            <h2>连接 Hub MCP</h2>
            <p>复制指令给 Agent，让它准备配置，再由你确认授权。</p>
          </div>
        </div>
        <AgentClientSelect value={client} onChange={setClient} />
        <label>
          MCP 配置范围
          <SelectField
            optionIcons={configurationScopeIcons}
            value={scope}
            onValueChange={(value) => setScope(agentConfigurationScopeSchema.parse(value))}
          >
            <option value="project">仅当前项目</option>
            <option value="user">我的所有项目</option>
          </SelectField>
        </label>
        <label className={checkLabelStyles}>
          <input
            type="checkbox"
            checked={contribute}
            onChange={(event) => setContribute(event.target.checked)}
          />
          <span>我还需要分享、推荐与反馈</span>
        </label>
        <div className={connectionMethodsStyles} role="group" aria-label="连接方式">
          <button
            className={cn(connectionMethodStyles, method === 'oauth' ? isActiveStyles : '')}
            aria-pressed={method === 'oauth'}
            onClick={() => setMethod('oauth')}
          >
            <ShieldCheck size={20} />
            <strong>浏览器授权</strong>
            <span>推荐 · 凭据由客户端管理</span>
          </button>
          <button
            className={cn(connectionMethodStyles, method === 'assistant' ? isActiveStyles : '')}
            aria-pressed={method === 'assistant'}
            onClick={() => setMethod('assistant')}
          >
            <Link size={20} />
            <strong>接入助手</strong>
            <span>为需要本地桥接的客户端准备</span>
          </button>
        </div>
        <ol className={connectionStepsStyles}>
          <li>
            <strong>准备连接</strong>
            <span>交给 Agent 合并配置</span>
          </li>
          <li>
            <strong>确认授权</strong>
            <span>在浏览器登录并允许连接</span>
          </li>
          <li>
            <strong>开始使用</strong>
            <span>检查工具，继续原来的任务</span>
          </li>
        </ol>
        {method === 'assistant' && (
          <>
            <p className={subtleStyles}>
              先安装部署方提供的 Capability Hub CLI，在运行 Agent
              的同一环境执行。助手会保存凭据并配置桥接；远程环境可按终端提示手动打开授权链接。
            </p>
            <CodeBlock title="启动接入助手" code={config.assistant_command} />
          </>
        )}
        <div className={cn(codewrapStyles, 'flex items-center justify-between gap-3 p-4')}>
          <span>无需复制或保存令牌</span>
          <CopyButton
            key={`${client}:${scope}:${method}:${permission}`}
            label="复制 Hub 接入指令"
            text={config.installation_prompt}
          />
        </div>
        <a
          className={textBtnStyles}
          href={`/connect/mcp?${new URLSearchParams({ client, scope, ...(contribute ? { permission } : {}), ...(method !== 'oauth' ? { method } : {}) })}`}
          target="_blank"
          rel="noreferrer"
        >
          查看对话接入说明
        </a>
        <p className={subtleStyles}>
          {agentClients[client].note}{' '}
          <a href={agentClients[client].documentation} target="_blank" rel="noreferrer">
            官方接入文档
          </a>
        </p>
        <details className={installationRouteStyles}>
          <summary>查看配置 · {config.target_file}</summary>
          <CodeBlock title={config.target_file} code={config.text} />
        </details>
        <details
          className={installationRouteStyles}
          open={manualOpen}
          onToggle={(event) => setManualOpen(event.currentTarget.open)}
        >
          <summary>高级手动接入 · 访问令牌</summary>
          <p className={subtleStyles}>
            用于明确需要 Bearer
            令牌的环境。请由用户在客户端运行环境设置变量，不要把真实值发到对话中。
          </p>
          <CodeBlock title="手动令牌配置" code={manual.text} />
          {me ? (
            <AccessTokenForm key={client} defaultName={client + ' 手动接入'} />
          ) : (
            <a
              className={btnStyles}
              href={loginHref(
                '/connect?' +
                  new URLSearchParams({ client, scope, method: 'token', permission }).toString(),
              )}
            >
              登录并创建手动令牌
            </a>
          )}
        </details>
        <details className={installationRouteStyles}>
          <summary>CLI 下载与安装</summary>
          <p className={subtleStyles}>命令行独立使用时，可运行 login 完成浏览器批准。</p>
          <CodeBlock
            title="CLI 使用"
            code={`capability-hub login --url ${config.hub_url}\ncapability-hub add NAME --version VERSION --to ${agentClients[client].skillDirectory} --dry-run --url ${config.hub_url}\ncapability-hub mcp-config NAME --version VERSION --client ${client} --option OPTION_ID --scope ${scope} --url ${config.hub_url}`}
          />
        </details>
      </section>
      <aside className={connectToolboxStyles}>
        <HubToolbox />
      </aside>
    </div>
  );
}
