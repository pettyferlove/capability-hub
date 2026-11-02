import { InputField } from '../../shared/components/InputField.js';
import { mcpHeaderNamePattern } from '@capability-hub/contracts';
import { mcpEntryFieldsStyles, optionalLabelStyles } from './styles.js';
import { fieldErrorStyles } from '../../shared/styles/recipes.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useEffect, useId, useRef, useState } from 'react';
import { Segmented } from '../../shared/components/Segmented.js';
import { Message } from '../../shared/components/Message.js';
import {
  environmentNamePattern,
  mcpAddress,
  parseNpmInstallation,
  type McpEntryDraft,
} from './mcp-entry.js';
import { fixedVersionPattern } from './upload-identity.js';

/**
 * MCP 入口字段：随输入用 {@link mcpAddress} / {@link parseNpmInstallation} 实时校验，并把首个错误写入
 * 底层 input 的 `setCustomValidity`，让表单提交被浏览器原生拦截；切换添加方式时重置 `touched` 并重新
 * 校验。版本号优先取命令里的固定版本，其次取手填值。
 */
export function McpEntryFields({
  value,
  onChange,
  existingAsset = false,
}: {
  value: McpEntryDraft;
  onChange: (value: McpEntryDraft) => void;
  existingAsset?: boolean;
}) {
  const sourceId = useId();
  const [touched, setTouched] = useState(false);
  const sourceInput = useRef<HTMLInputElement>(null);
  let sourceError = '';
  let address: URL | undefined;
  let parsed: ReturnType<typeof parseNpmInstallation> | undefined;
  try {
    if (value.mode === 'url') address = mcpAddress(value.url);
    else if (value.mode === 'command') parsed = parseNpmInstallation(value.command);
  } catch (error) {
    sourceError = errorMessage(error);
  }
  useEffect(() => {
    sourceInput.current?.setCustomValidity(sourceError);
  }, [sourceError, value.mode]);
  const update = (patch: Partial<McpEntryDraft>) => onChange({ ...value, ...patch });
  const apiKey = value.authMode === 'api-key';
  const authenticated = value.authMode !== 'none';
  const fixedPackageVersion =
    parsed?.version ??
    (fixedVersionPattern.test(value.packageVersion.trim()) ? value.packageVersion.trim() : '');
  return (
    <div className={mcpEntryFieldsStyles}>
      <Segmented
        id="mcp-entry"
        label="MCP 添加方式"
        value={value.mode}
        onChange={(mode) => {
          if (mode === value.mode) return;
          setTouched(false);
          update({ mode, sharedKey: '' });
        }}
        options={[
          { id: 'url', label: '服务地址' },
          { id: 'command', label: 'npx 命令' },
          { id: 'file', label: '描述文件' },
        ]}
      />
      {value.mode === 'url' ? (
        <>
          <label>
            <span id={`${sourceId}-label`}>MCP 服务地址</span>
            <InputField
              icon="link"
              ref={sourceInput}
              type="url"
              required
              value={value.url}
              onChange={(event) => update({ url: event.target.value, sharedKey: '' })}
              onBlur={() => setTouched(true)}
              aria-invalid={(touched && !!sourceError) || undefined}
              aria-labelledby={`${sourceId}-label`}
              aria-describedby={`${sourceId}-hint`}
              maxLength={4096}
              placeholder="https://docs.example.com/mcp"
              autoCapitalize="none"
              spellCheck={false}
            />
            <small
              id={`${sourceId}-hint`}
              className={touched && sourceError ? fieldErrorStyles : ''}
            >
              {touched && sourceError
                ? sourceError
                : address?.protocol === 'http:'
                  ? '当前使用 HTTP，连接内容未经加密；请确认处于可信内网，公网服务建议使用 HTTPS。'
                  : '支持 HTTP 或 HTTPS 的 Streamable HTTP 连接地址。'}
            </small>
          </label>
          <Segmented
            id="mcp-auth"
            label="连接认证方式"
            value={value.authMode}
            onChange={(authMode) => {
              if (authMode !== value.authMode)
                update({
                  authMode,
                  keySource: authMode === 'bearer' ? 'client' : 'shared',
                  sharedKey: '',
                });
            }}
            options={[
              { id: 'none', label: '无需认证' },
              { id: 'bearer', label: 'Bearer Token' },
              { id: 'api-key', label: 'API Key' },
            ]}
          />
          {apiKey && (
            <label>
              请求头名称
              <InputField
                icon="key"
                value={value.headerName}
                onChange={(event) => update({ headerName: event.target.value, sharedKey: '' })}
                required
                pattern={mcpHeaderNamePattern.source}
                maxLength={128}
                placeholder="X-Api-Key"
                title="以字母或数字开头，可包含字母、数字、点、下划线和连字符"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
          )}
          {authenticated && (
            <Segmented
              id="mcp-key-source"
              label="凭据来源"
              value={value.keySource}
              onChange={(keySource) => {
                if (keySource !== value.keySource) update({ keySource, sharedKey: '' });
              }}
              options={[
                { id: 'shared', label: 'Hub 共享凭据' },
                { id: 'client', label: '使用者自备' },
              ]}
            />
          )}
          {authenticated && value.keySource === 'shared' && (
            <>
              <label>
                {apiKey ? '共享 API Key' : '共享 Bearer Token'}
                <InputField
                  icon="key"
                  type="password"
                  required
                  maxLength={4096}
                  placeholder={
                    apiKey ? '输入服务签发的 API Key' : '输入 Token 原值，省略 Bearer 前缀'
                  }
                  autoComplete="new-password"
                  spellCheck={false}
                  value={value.sharedKey}
                  onChange={(event) => update({ sharedKey: event.target.value })}
                />
                <small>
                  {apiKey
                    ? '填写服务签发的 API Key。'
                    : '填写团队服务账号的 Token 原值，客户端配置会自动添加 Bearer 前缀。个人登录请选择“使用者自备”。'}
                </small>
              </label>
              <Message>已登录且有该版本读取权限的用户可以从安装配置中查看、复制真实凭据。</Message>
            </>
          )}
          {authenticated && value.keySource === 'client' && (
            <label>
              {apiKey ? '密钥环境变量名' : 'Token 环境变量名'}
              <InputField
                icon="variable"
                value={apiKey ? value.apiKeyVariable : value.tokenVariable}
                onChange={(event) =>
                  update({ [apiKey ? 'apiKeyVariable' : 'tokenVariable']: event.target.value })
                }
                required
                pattern={environmentNamePattern.source}
                maxLength={128}
                placeholder={apiKey ? 'MCP_API_KEY' : 'DOCS_TOKEN'}
                autoCapitalize="none"
                spellCheck={false}
              />
              <small>
                只填写变量名。使用者在启动客户端的环境中设置实际值。
                {existingAsset &&
                  '若该资产已共享同一地址、请求头和认证方式的凭据，请先在维护设置中移除该绑定，再改用自备凭据。'}
              </small>
            </label>
          )}
        </>
      ) : value.mode === 'command' ? (
        <>
          <label>
            <span id={`${sourceId}-label`}>npm 包或 npx 命令</span>
            <InputField
              icon="terminal"
              ref={sourceInput}
              value={value.command}
              onChange={(event) => update({ command: event.target.value })}
              onBlur={() => setTouched(true)}
              required
              maxLength={4096}
              placeholder="npx -y @example/docs@1.2.3"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={(touched && !!sourceError) || undefined}
              aria-labelledby={`${sourceId}-label`}
              aria-describedby={`${sourceId}-hint`}
            />
            <small
              id={`${sourceId}-hint`}
              className={touched && sourceError ? fieldErrorStyles : ''}
            >
              {touched && sourceError
                ? sourceError
                : parsed
                  ? `${parsed.identifier}${fixedPackageVersion ? ` · 固定版本 ${fixedPackageVersion}` : ' · 请在下方补充固定版本'}${parsed.args.length ? ` · ${parsed.args.length} 个启动参数` : ''}`
                  : '可直接粘贴带参数的命令；此处只解析，不执行。'}
            </small>
          </label>
          {parsed && !parsed.version && (
            <label>
              npm 包固定版本
              <InputField
                icon="tag"
                value={value.packageVersion}
                onChange={(event) => update({ packageVersion: event.target.value })}
                required
                maxLength={128}
                pattern={fixedVersionPattern.source}
                placeholder="例如 1.2.3"
              />
              <small>固定使用者安装的包版本，不能使用 latest。</small>
            </label>
          )}
          <label>
            <span>
              环境变量名 <span className={optionalLabelStyles}>（可选）</span>
            </span>
            <InputField
              icon="variable"
              value={value.environment}
              onChange={(event) => update({ environment: event.target.value })}
              maxLength={2600}
              placeholder="例如 GITHUB_TOKEN, PROJECT_PATH"
              autoCapitalize="none"
              spellCheck={false}
            />
            <small>多个名称用逗号分隔，使用者在本机设置值。</small>
          </label>
        </>
      ) : null}
    </div>
  );
}
