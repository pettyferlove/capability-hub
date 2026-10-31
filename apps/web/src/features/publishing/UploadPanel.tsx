import { InputField } from '../../shared/components/InputField.js';
import { versionPlanIcons } from '../../shared/components/select-icons.js';
import {
  publishLayoutStyles,
  uploadFormStyles,
  uploadFieldsStyles,
  uploadTargetRowStyles,
  uploadSourceStyles,
  uploadFileSummaryStyles,
  uploadMetadataStyles,
  uploadSectionHeadingStyles,
  uploadIdentityRowStyles,
  mcpDocumentPreviewStyles,
} from './styles.js';
import {
  formStackStyles,
  panelStyles,
  panelHeadingStyles,
  stepNumberStyles,
  inlineIconStyles,
} from '../../shared/styles/recipes.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type {
  AssetVersionPlanResponse,
  ManagementAssetResponse,
} from '@capability-hub/contracts/http';
import { ArrowRight, FileArchive, Plug } from '../../shared/icons/lucide.js';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { KeywordField } from '../../shared/components/KeywordField.js';
import { SkillApiKeyField } from '../../shared/components/SkillApiKeyField.js';
import { Segmented } from '../../shared/components/Segmented.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { useHub } from '../../shared/context/HubContext.js';
import { IntakeHistoryPanel } from './IntakeHistoryPanel.js';
import { McpEntryFields } from './McpEntryFields.js';
import { UploadFilePicker } from './UploadFilePicker.js';
import {
  buildMcpDocument,
  emptyMcpEntry,
  mcpEntryIdentity,
  type McpEntryDraft,
} from './mcp-entry.js';
import {
  emptyUploadIdentity,
  fixedVersionPattern,
  mcpFileIdentity,
  resolveUploadVersion,
  skillFilenameIdentity,
  suggestUploadIdentity,
  type IdentitySuggestion,
  type UploadVersionMode,
} from './upload-identity.js';

export function UploadPanel({
  initialAssetId = '',
  initialIntakeId = '',
}: {
  initialAssetId?: string;
  initialIntakeId?: string;
}) {
  const { me, refresh, reload } = useHub();
  const [target, setTarget] = useState(initialAssetId ? 'existing' : 'new');
  const [assetId, setAssetId] = useState(initialAssetId);
  const [kind, setKind] = useState('skill');
  const [identity, setIdentity] = useState(emptyUploadIdentity);
  const [sourceVersion, setSourceVersion] = useState('');
  const [versionMode, setVersionMode] = useState<UploadVersionMode>('auto');
  const [versionRefresh, setVersionRefresh] = useState(0);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [requiresApiKey, setRequiresApiKey] = useState(false);
  const [group, setGroup] = useState(me?.groups[0]?.id ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [fileSummary, setFileSummary] = useState('');
  const [mcp, setMcp] = useState(emptyMcpEntry);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [active, setActive] = useState(initialIntakeId);
  const [suggestion, setSuggestion] = useState('');
  const fileRead = useRef(0);
  const lastRequest = useRef<{ metadata: string; content: File | string; key: string } | null>(
    null,
  );
  const initialized = useRef(false);
  const { data: managedAssets, error: assetsError } = useQuery<ManagementAssetResponse[]>(
    '/api/management/assets',
    refresh,
  );
  const assets = managedAssets?.filter((asset) => asset.source_kind === 'upload');
  const versionQuery = useQuery<AssetVersionPlanResponse>(
    target === 'existing' && assetId ? `/api/management/assets/${assetId}/version-plan` : null,
    refresh + versionRefresh,
  );
  const versionPlan = versionQuery.data;
  const releaseVersion =
    target === 'existing'
      ? resolveUploadVersion(versionPlan, sourceVersion, versionMode, identity.version)
      : identity.version;
  const waitingForVersion =
    target === 'existing' && versionMode !== 'manual' && versionQuery.loading;
  const versionUnavailable =
    target === 'existing' && versionMode !== 'manual' && (!versionPlan || !!versionQuery.error);
  const needsFile = kind === 'skill' || mcp.mode === 'file';
  const selectedAsset = assets?.find((asset) => asset.id === assetId);
  useEffect(() => {
    if (initialized.current || !initialAssetId || !managedAssets) return;
    initialized.current = true;
    const asset = managedAssets.find(
      (item) =>
        item.id === initialAssetId &&
        item.source_kind === 'upload' &&
        item.can_submit &&
        item.lifecycle === 'active',
    );
    if (asset) {
      setKind(asset.kind);
      setRequiresApiKey(asset.requires_api_key);
    } else {
      setAssetId('');
      setError('该资产当前不能上传新版本，请返回维护页核对权限、来源和状态。');
    }
  }, [initialAssetId, managedAssets]);
  const documentSlug = target === 'existing' ? (selectedAsset?.slug ?? '') : identity.slug;
  let preview = '';
  if (kind === 'mcp' && !needsFile) {
    try {
      preview = JSON.stringify(buildMcpDocument(mcp, documentSlug, releaseVersion), null, 2);
    } catch {
      // 表单未完成时不生成预览，提交时报告缺失字段。
    }
  }

  function applySuggestion(next: IdentitySuggestion, source: string) {
    setSourceVersion(next.version ?? '');
    setIdentity((current) => suggestUploadIdentity(current, next, target === 'existing'));
    setSuggestion(next.slug || next.version ? source : '');
  }
  function clearFile() {
    fileRead.current++;
    setFile(null);
    setFileSummary('');
    setReading(false);
    setError('');
    setSuggestion('');
    setSourceVersion('');
  }
  async function choose(files: FileList | null) {
    if (busy || !files?.length) return;
    clearFile();
    const read = fileRead.current;
    if (files.length !== 1) {
      setError('每次请选择一个文件');
      return;
    }
    const chosen = files[0];
    if (!chosen.size || chosen.size > 20 * 1024 * 1024) {
      setError('文件必须非空且不超过 20 MiB');
      return;
    }
    if (!(kind === 'skill' ? /\.zip$/i : /\.json$/i).test(chosen.name)) {
      setError(kind === 'skill' ? '请选择 Skill ZIP 包' : '请选择 MCP 的 JSON 描述文件');
      return;
    }
    setFile(chosen);
    setActive('');
    if (kind === 'skill') {
      const detected = skillFilenameIdentity(chosen.name);
      applySuggestion(
        detected,
        detected.version
          ? `文件名识别：${detected.slug ?? '待填写名称'} · ${detected.version}`
          : `文件名识别：${detected.slug ?? '待填写名称'}${target === 'new' ? ' · 1.0.0' : ''}`,
      );
      return;
    }
    setReading(true);
    try {
      const details = mcpFileIdentity(await chosen.text());
      if (fileRead.current !== read) return;
      applySuggestion(
        details,
        `描述文件识别：${details.slug ?? details.name}${details.version ? ` · ${details.version}` : '；请确认发布版本'}`,
      );
      setFileSummary(`${details.name} · ${details.description}`);
    } catch (error) {
      if (fileRead.current !== read) return;
      setFile(null);
      setError(errorMessage(error));
    } finally {
      if (fileRead.current === read) setReading(false);
    }
  }
  function changeMcp(next: McpEntryDraft) {
    if (next.mode !== mcp.mode) clearFile();
    setMcp(next);
    if (next.mode !== 'file')
      applySuggestion(mcpEntryIdentity(next), '已根据连接方式预填；手动修改的信息会保留。');
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (
      busy ||
      (target === 'existing' &&
        (!selectedAsset?.can_submit || selectedAsset.lifecycle !== 'active')) ||
      reading ||
      waitingForVersion ||
      versionUnavailable ||
      !releaseVersion ||
      (needsFile && !file)
    )
      return;
    setError('');
    let content: File | string;
    let payload: File;
    try {
      if (needsFile && file) {
        content = file;
        payload =
          kind === 'mcp' ? new File([file], 'server.json', { type: 'application/json' }) : file;
      } else {
        content = JSON.stringify(buildMcpDocument(mcp, documentSlug, releaseVersion), null, 2);
        payload = new File([content], 'server.json', { type: 'application/json' });
      }
    } catch (error) {
      setError(errorMessage(error));
      return;
    }
    const metadata = JSON.stringify(
      target === 'new'
        ? {
            target,
            owner_group_id: group,
            slug: identity.slug,
            kind,
            version_label: releaseVersion,
            keywords,
            ...(kind === 'skill' ? { requires_api_key: requiresApiKey } : {}),
          }
        : {
            target,
            asset_id: assetId,
            version_label: releaseVersion,
            version_mode: versionMode === 'manual' ? 'manual' : 'automatic',
            keywords,
            ...(kind === 'skill' ? { requires_api_key: requiresApiKey } : {}),
          },
    );
    if (lastRequest.current?.metadata !== metadata || lastRequest.current.content !== content)
      lastRequest.current = { metadata, content, key: crypto.randomUUID() };
    const data = new FormData();
    data.append('file', payload);
    data.append('metadata', metadata);
    setBusy(true);
    try {
      const result = await api<{ intake_id: string }>('/api/intakes', {
        method: 'POST',
        body: data,
        headers: { 'Idempotency-Key': lastRequest.current.key },
      });
      setActive(result.intake_id);
      clearFile();
      setIdentity(target === 'new' ? emptyUploadIdentity : { ...emptyUploadIdentity, version: '' });
      setVersionMode('auto');
      setKeywords([]);
      setRequiresApiKey(target === 'existing' && selectedAsset?.requires_api_key === true);
      setMcp({ ...emptyMcpEntry, mode: mcp.mode });
      lastRequest.current = null;
      reload();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VERSION_SUGGESTION_STALE') {
        setVersionRefresh((value) => value + 1);
        setError('已有其他更新，请确认新的建议版本号再提交。');
      } else setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={publishLayoutStyles}>
      <div className={formStackStyles}>
        <section className={panelStyles}>
          <div className={panelHeadingStyles}>
            <span className={stepNumberStyles}>01</span>
            <div>
              <h2>添加共享内容</h2>
              <p>提供文件或连接方式，再确认资产信息。</p>
            </div>
          </div>
          <form className={uploadFormStyles} onSubmit={upload}>
            <fieldset className={uploadFieldsStyles} aria-label="共享内容信息" disabled={busy}>
              <div className={uploadTargetRowStyles} data-target={target}>
                <Segmented
                  id="target"
                  label="上传目标"
                  value={target}
                  onChange={(next) => {
                    if (next === target) return;
                    setTarget(next);
                    setRequiresApiKey(
                      next === 'existing' && selectedAsset?.requires_api_key === true,
                    );
                    if (next === 'existing') setKind(selectedAsset?.kind ?? 'skill');
                    setVersionMode('auto');
                    clearFile();
                    setIdentity(
                      next === 'existing'
                        ? { ...emptyUploadIdentity, version: '' }
                        : emptyUploadIdentity,
                    );
                  }}
                  options={[
                    { id: 'new', label: '新建资产' },
                    { id: 'existing', label: '已有资产新版本' },
                  ]}
                />
                {target === 'new' ? (
                  <Segmented
                    id="upload-kind"
                    label="上传类型"
                    value={kind}
                    onChange={(next) => {
                      if (next === kind) return;
                      setKind(next);
                      setRequiresApiKey(false);
                      clearFile();
                      setIdentity(emptyUploadIdentity);
                      setMcp(emptyMcpEntry);
                    }}
                    options={[
                      {
                        id: 'skill',
                        label: (
                          <span className={inlineIconStyles}>
                            <FileArchive size={15} />
                            Skill ZIP
                          </span>
                        ),
                      },
                      {
                        id: 'mcp',
                        label: (
                          <span className={inlineIconStyles}>
                            <Plug size={15} />
                            MCP 服务
                          </span>
                        ),
                      },
                    ]}
                  />
                ) : (
                  <label>
                    选择资产
                    <SelectField
                      required
                      value={assetId}
                      onValueChange={(next) => {
                        if (next === assetId) return;
                        setAssetId(next);
                        setRequiresApiKey(
                          assets?.find((asset) => asset.id === next)?.requires_api_key === true,
                        );
                        setKind(assets?.find((asset) => asset.id === next)?.kind ?? 'skill');
                        clearFile();
                        setIdentity({ ...emptyUploadIdentity, version: '' });
                        setVersionMode('auto');
                        setMcp(emptyMcpEntry);
                      }}
                    >
                      <option value="">请选择你维护的资产</option>
                      {assets
                        ?.filter((asset) => asset.can_submit && asset.lifecycle === 'active')
                        .map((asset) => (
                          <option value={asset.id} key={asset.id}>
                            {asset.slug} · {asset.kind}
                          </option>
                        ))}
                    </SelectField>
                  </label>
                )}
              </div>
              {assetsError && <Message error>资产列表加载失败：{assetsError}</Message>}
              {error && !assetId && target === 'existing' && <Message error>{error}</Message>}
              {selectedAsset && target === 'existing' && (
                <Message>
                  正在更新 <strong>{selectedAsset.slug}</strong> ·{' '}
                  {selectedAsset.kind.toUpperCase()}。 当前发布{' '}
                  {selectedAsset.current_version?.version_label ?? '尚无'} → 本次{' '}
                  {releaseVersion || '待确认'}。 校验和审核通过前，当前发布保持不变。
                </Message>
              )}
              {(target === 'new' || assetId) && (
                <>
                  <div className={uploadSourceStyles}>
                    {kind === 'mcp' && <McpEntryFields value={mcp} onChange={changeMcp} />}
                    {needsFile && (
                      <UploadFilePicker
                        kind={kind}
                        file={file}
                        reading={reading}
                        onChoose={choose}
                        onClear={clearFile}
                      />
                    )}
                    {fileSummary && <p className={uploadFileSummaryStyles}>{fileSummary}</p>}
                  </div>
                  <div className={uploadMetadataStyles}>
                    <div className={uploadSectionHeadingStyles}>
                      <h3>确认资产信息</h3>
                      <p>
                        {suggestion ||
                          (target === 'existing'
                            ? `为 ${selectedAsset?.slug ?? '所选资产'} 添加版本。`
                            : '名称和版本会根据提供的内容预填。')}
                      </p>
                    </div>
                    <div className={uploadIdentityRowStyles}>
                      {target === 'existing' && (
                        <label>
                          版本方式
                          <SelectField
                            optionIcons={versionPlanIcons}
                            value={versionMode}
                            onValueChange={(next) => {
                              if (next === 'manual')
                                setIdentity((current) => ({
                                  ...current,
                                  version: releaseVersion,
                                  versionEdited: true,
                                }));
                              setVersionMode(next as UploadVersionMode);
                            }}
                          >
                            <option value="auto">自动递增</option>
                            <option value="patch">
                              修订更新 · {versionPlan?.suggestions.patch ?? '+0.0.1'}
                            </option>
                            <option value="minor">
                              功能更新 · {versionPlan?.suggestions.minor ?? '+0.1.0'}
                            </option>
                            <option value="major">
                              重大更新 · {versionPlan?.suggestions.major ?? '+1.0.0'}
                            </option>
                            <option value="manual">手动填写</option>
                          </SelectField>
                          <small>
                            {!versionPlan
                              ? versionQuery.error
                                ? '可手动填写版本号'
                                : '正在获取已有版本…'
                              : versionPlan.current_version
                                ? `当前已发布 ${versionPlan.current_version}`
                                : '尚未发布版本'}
                            {versionPlan?.latest_version &&
                              versionPlan.latest_version !== versionPlan.current_version &&
                              ` · 最新已有 ${versionPlan.latest_version}`}
                          </small>
                        </label>
                      )}
                      {target === 'new' && (
                        <label>
                          资产名称
                          <InputField
                            icon="package"
                            value={identity.slug}
                            onChange={(event) =>
                              setIdentity({
                                ...identity,
                                slug: event.target.value,
                                slugEdited: !!event.target.value,
                              })
                            }
                            required
                            maxLength={64}
                            pattern="[a-z0-9]+(-[a-z0-9]+)*"
                            placeholder="例如 java-conventions"
                            autoCapitalize="none"
                            spellCheck={false}
                          />
                          <small>
                            {kind === 'skill'
                              ? '与包内 SKILL.md 的 name 保持一致。'
                              : '用于平台中的搜索和分享链接。'}
                          </small>
                        </label>
                      )}
                      <label>
                        发布版本
                        <InputField
                          icon="tag"
                          value={releaseVersion}
                          onChange={(event) => {
                            if (target === 'existing') setVersionMode('manual');
                            setIdentity({
                              ...identity,
                              version: event.target.value,
                              versionEdited: !!event.target.value,
                            });
                          }}
                          required
                          maxLength={128}
                          pattern={fixedVersionPattern.source}
                          placeholder={waitingForVersion ? '获取版本…' : '1.0.0'}
                          spellCheck={false}
                        />
                        <small>
                          {target !== 'existing' || versionMode === 'manual'
                            ? '例如 1.0.0 或 2.0.0-beta.1'
                            : versionMode === 'auto' &&
                                sourceVersion &&
                                sourceVersion === releaseVersion
                              ? '已识别文件版本'
                              : versionMode === 'auto' && sourceVersion
                                ? `文件标注 ${sourceVersion}，已建议新版本`
                                : '可直接修改版本号'}
                        </small>
                      </label>
                    </div>
                    {target === 'existing' && versionQuery.error && (
                      <ErrorState
                        message={`获取版本建议失败：${versionQuery.error}`}
                        retry={() => setVersionRefresh((value) => value + 1)}
                      />
                    )}
                    {target === 'new' && (
                      <label>
                        维护团队
                        <SelectField value={group} onValueChange={setGroup} required>
                          <option value="" disabled>
                            请选择团队
                          </option>
                          {me?.groups.map((team) => (
                            <option value={team.id} key={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </SelectField>
                      </label>
                    )}
                    {kind === 'mcp' && !needsFile && (
                      <label>
                        MCP 用途
                        <textarea
                          value={mcp.description}
                          onChange={(event) => setMcp({ ...mcp, description: event.target.value })}
                          required
                          maxLength={100}
                          placeholder="例如：检索团队文档，查询接口说明和代码示例"
                          rows={2}
                        />
                      </label>
                    )}
                    <KeywordField value={keywords} onChange={setKeywords} />
                    {kind === 'skill' && (
                      <SkillApiKeyField checked={requiresApiKey} onChange={setRequiresApiKey} />
                    )}
                    {preview && (
                      <details className={mcpDocumentPreviewStyles}>
                        <summary>查看生成的 server.json</summary>
                        <pre>{preview}</pre>
                      </details>
                    )}
                  </div>
                  {error && <Message error>{error}</Message>}
                  <Submit
                    busy={busy}
                    disabled={
                      (target === 'existing' &&
                        (!selectedAsset?.can_submit || selectedAsset.lifecycle !== 'active')) ||
                      reading ||
                      waitingForVersion ||
                      versionUnavailable ||
                      !releaseVersion ||
                      (needsFile && !file)
                    }
                  >
                    {kind === 'skill' || needsFile ? '上传并校验' : '添加并校验'}
                    <ArrowRight size={16} />
                  </Submit>
                </>
              )}
            </fieldset>
          </form>
        </section>
        <IntakeHistoryPanel active={active} onSelect={setActive} />
      </div>
    </div>
  );
}
