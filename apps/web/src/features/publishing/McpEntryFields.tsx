import { InputField } from '../../shared/components/InputField.js';
import { mcpEntryFieldsStyles, optionalLabelStyles } from './styles.js';
import { fieldErrorStyles, checkLabelStyles } from '../../shared/styles/recipes.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useEffect, useId, useRef, useState } from 'react';
import { Segmented } from '../../shared/components/Segmented.js';
import { mcpAddress, parseNpmInstallation, type McpEntryDraft } from './mcp-entry.js';
import { fixedVersionPattern } from './upload-identity.js';

/**
 * MCP 入口字段：随输入用 {@link mcpAddress} / {@link parseNpmInstallation} 实时校验，并把首个错误写入
 * 底层 input 的 `setCustomValidity`，让表单提交被浏览器原生拦截；切换添加方式时重置 `touched` 并重新
 * 校验。版本号优先取命令里的固定版本，其次取手填值。
 */
export function McpEntryFields({
  value,
  onChange,
}: {
  value: McpEntryDraft;
  onChange: (value: McpEntryDraft) => void;
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
          setTouched(false);
          update({ mode });
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
              onChange={(event) => update({ url: event.target.value })}
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
          <label className={checkLabelStyles}>
            <input
              type="checkbox"
              checked={value.authenticated}
              onChange={(event) => update({ authenticated: event.target.checked })}
            />
            <span>连接时需要 Bearer Token</span>
          </label>
          {value.authenticated && (
            <label>
              Token 环境变量名
              <InputField
                icon="variable"
                value={value.tokenVariable}
                onChange={(event) => update({ tokenVariable: event.target.value })}
                required
                pattern="[A-Za-z_][A-Za-z0-9_]*"
                maxLength={128}
                placeholder="DOCS_TOKEN"
                autoCapitalize="none"
              />
              <small>只填写变量名；使用者在本机设置 Token。</small>
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
