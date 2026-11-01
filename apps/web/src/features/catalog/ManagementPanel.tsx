import { Glyph } from '../../shared/components/Glyph.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { InputField } from '../../shared/components/InputField.js';
import { managementIcons } from '../../shared/components/select-icons.js';
import {
  formStackStyles,
  sectionHeadingStyles,
  subtleStyles,
  panelStyles,
  monoStyles,
  tagStyles,
  tagRedStyles,
  tagTealStyles,
  sourceActionsStyles,
  btnStyles,
  btnPrimaryStyles,
  textBtnStyles,
  sheetScrollStyles,
} from '../../shared/styles/recipes.js';
import {
  managementGridStyles,
  managementCardStyles,
  typeLabelStyles,
  historyListStyles,
} from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { AssetFeedback } from './AssetFeedback.js';
import { SkillUsageForm } from './SkillUsageForm.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type {
  ManagementAssetResponse,
  SourceResponse,
  VersionHistoryResponse,
} from '@capability-hub/contracts/http';
import {
  ArrowRight,
  ShieldCheck,
  UploadCloud,
  GitBranch,
  MessageSquare,
} from '../../shared/icons/lucide.js';
import { useState, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { CardGridSkeleton } from '../../shared/components/Skeleton.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { Empty } from '../../shared/components/Empty.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { assetHref, pageHref } from '../../shared/navigation/history-route.js';
import { useHub } from '../../shared/context/HubContext.js';
import { stateLabel } from '../../shared/format/labels.js';
export default function ManagementPanel() {
  const { refresh, reload } = useHub();
  const { data, error, loading } = useQuery<ManagementAssetResponse[]>(
    '/api/management/assets',
    refresh,
  );
  const [asset, setAsset] = useState<ManagementAssetResponse>();
  const [controlTab, setControlTab] = useState('versions');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const filtered = data?.filter(
    (item) =>
      `${item.slug} ${item.kind}`.toLowerCase().includes(search.trim().toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'pending' ? item.pending_requests.length > 0 : item.lifecycle === filter)),
  );
  return (
    <div className={formStackStyles}>
      <div className={sectionHeadingStyles}>
        <div>
          <h2>资产维护</h2>
          <p className={subtleStyles}>查看当前发布、跟进审核，或为同一资产添加新版本。</p>
        </div>
      </div>
      {!!data?.length && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <InputField
              icon="package"
              type="search"
              aria-label="搜索维护资产"
              placeholder="搜索资产名称或类型…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="w-40">
            <SelectField aria-label="维护资产状态" value={filter} onValueChange={setFilter}>
              <option value="all">全部资产 · {data.length}</option>
              <option value="pending">待审核</option>
              <option value="active">活动</option>
              <option value="deprecated">已弃用</option>
              <option value="blocked">已封禁</option>
            </SelectField>
          </div>
          <span className={subtleStyles}>{filtered?.length} 个资产</span>
        </div>
      )}
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading && !data ? (
        <CardGridSkeleton label="正在加载可维护资产…" count={3} variant="source" />
      ) : !data?.length ? (
        <Empty title="没有可维护的资产">有明确维护或分发管理权限的资产会出现在这里。</Empty>
      ) : (
        <div className={managementGridStyles}>
          {!filtered?.length && <Empty title="没有匹配的资产">请调整搜索词或状态筛选。</Empty>}
          {filtered?.map((a) => (
            <section className={cn(panelStyles, managementCardStyles)} key={a.id}>
              <div className={sectionHeadingStyles}>
                <div className="flex min-w-0 items-center gap-3">
                  <Glyph seed={a.current_version?.content_digest ?? a.id} kind={a.kind} size={44} />
                  <div className="min-w-0">
                    <span className={typeLabelStyles}>
                      {a.kind.toUpperCase()} · {a.source_kind === 'git' ? 'Git 同步' : '文件上传'}
                    </span>
                    <h3 className={monoStyles}>{a.slug}</h3>
                  </div>
                </div>
                <span
                  className={cn(
                    tagStyles,
                    a.lifecycle === 'blocked' ? tagRedStyles : tagTealStyles,
                  )}
                >
                  {a.lifecycle === 'deprecated' ? '已弃用' : stateLabel(a.lifecycle)}
                </span>
              </div>
              <p className={subtleStyles}>
                当前发布{' '}
                <strong className="text-ink font-mono">
                  {a.current_version?.version_label ?? '尚未发布'}
                </strong>
                {a.current_release && <> · 第 {a.current_release.release_seq} 次发布</>}
              </p>
              {a.pending_requests.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-brand-soft p-3">
                  <span>待审核 · {a.pending_requests.length} 项</span>
                  {a.pending_requests.map((request) => (
                    <a
                      key={request.id}
                      className={textBtnStyles}
                      href={pageHref('review', { request: request.id })}
                    >
                      {request.version_label}
                      <ArrowRight size={13} />
                    </a>
                  ))}
                </div>
              )}
              {a.latest_intake && (
                <a
                  className={textBtnStyles}
                  href={pageHref('publish', { intake: a.latest_intake.id })}
                >
                  最近接收 {a.latest_intake.version_label} · {stateLabel(a.latest_intake.state)}
                  <ArrowRight size={13} />
                </a>
              )}
              <div className={sourceActionsStyles}>
                {a.can_submit && a.lifecycle === 'active' && (
                  <a
                    className={cn(btnStyles, btnPrimaryStyles)}
                    href={pageHref(
                      'publish',
                      a.source_kind === 'upload' ? { asset: a.id } : { tab: 'git' },
                    )}
                  >
                    {a.source_kind === 'upload' ? (
                      <UploadCloud size={15} />
                    ) : (
                      <GitBranch size={15} />
                    )}
                    {a.source_kind === 'upload' ? '更新版本' : '前往 Git 同步'}
                  </a>
                )}
                <button
                  className={btnStyles}
                  onClick={() => {
                    setControlTab('versions');
                    setAsset(a);
                  }}
                >
                  <ShieldCheck size={15} />
                  版本与管理
                </button>
                {a.can_submit && (
                  <button
                    className={btnStyles}
                    onClick={() => {
                      setControlTab('feedback');
                      setAsset(a);
                    }}
                  >
                    <MessageSquare size={15} />
                    问题与建议
                  </button>
                )}
                {a.can_view_catalog ? (
                  <a className={textBtnStyles} href={assetHref(a.slug)}>
                    查看目录详情
                    <ArrowRight size={14} />
                  </a>
                ) : (
                  <span className={subtleStyles}>
                    {!a.current_release
                      ? '尚未发布，无目录详情'
                      : a.lifecycle === 'blocked'
                        ? '资产已封禁，目录不可访问'
                        : '当前发布不可访问，请在维护中查看版本'}
                  </span>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      <Overlay open={!!asset} onClose={() => setAsset(undefined)} label="维护资产" variant="sheet">
        {asset && (
          <Controls
            asset={asset}
            initialTab={controlTab}
            onClose={() => setAsset(undefined)}
            onSaved={() => {
              setAsset(undefined);
              reload();
            }}
          />
        )}
      </Overlay>
    </div>
  );
}
function Controls({
  asset: a,
  initialTab,
  onClose,
  onSaved,
}: {
  asset: ManagementAssetResponse;
  initialTab: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState(initialTab);
  const [versionsRefresh, setVersionsRefresh] = useState(0);
  const {
    data: versions,
    error: versionsError,
    loading: versionsLoading,
  } = useQuery<VersionHistoryResponse[]>(
    '/api/management/assets/' + a.id + '/versions',
    versionsRefresh,
  );
  const [action, setAction] = useState(''),
    [reason, setReason] = useState(''),
    [version, setVersion] = useState(''),
    [sourceId, setSourceId] = useState(''),
    [path, setPath] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const { data: sources } = useQuery<SourceResponse[]>(
    action === 'migrate' ? '/api/sources' : null,
  );
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'rollback') {
        if (!a.current_release) throw new Error('该资产尚未发布，无法回退');
        await mutate('/api/assets/' + a.id + '/rollback-requests', {
          target_version_id: version,
          reason,
          current_policy_digest: a.current_release.policy_digest,
        });
      } else if (action === 'revoke')
        await mutate('/api/versions/' + version + '/revoke', { reason });
      else if (action === 'migrate') {
        const s = sources?.find((s) => s.id === sourceId);
        if (!s) throw new Error('请选择有效的目标来源');
        await mutate(
          '/api/assets/' + a.id + '/migrate-source',
          {
            destination_source_id: sourceId,
            destination_source_revision: s.revision,
            path,
            reason,
          },
          'POST',
          a.revision,
        );
      } else
        await mutate(
          '/api/assets/' + a.id + '/lifecycle',
          { lifecycle: action, reason },
          'PATCH',
          a.revision,
        );
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <DialogTitle title={a.slug + ' · 维护'} onClose={onClose} />
      <div className={cn(sheetScrollStyles, formStackStyles)}>
        <div className="shrink-0">
          <PageTabs
            label="资产管理内容"
            panelId="asset-management"
            value={tab}
            onValueChange={setTab}
            items={[
              { id: 'versions', label: '版本记录' },
              ...(a.can_submit ? [{ id: 'feedback', label: '问题与建议' }] : []),
              { id: 'settings', label: '维护设置' },
            ]}
          />
        </div>
        <div
          role="tabpanel"
          id={'asset-management-' + tab}
          aria-labelledby={'asset-management-tab-' + tab}
          className={formStackStyles}
        >
          {tab === 'versions' ? (
            <>
              <p className={subtleStyles}>
                当前发布：{a.current_version?.version_label ?? '尚未发布'}
                。回退历史内容仍需人工审核。
              </p>
              {versionsError ? (
                <ErrorState
                  message={versionsError}
                  retry={() => setVersionsRefresh((value) => value + 1)}
                />
              ) : versionsLoading && !versions ? (
                <CardGridSkeleton label="正在加载版本记录…" count={1} />
              ) : !versions?.length ? (
                <Empty title="尚无内容版本">接收校验完成后，固定快照会显示在这里。</Empty>
              ) : (
                <div className={historyListStyles}>
                  {versions.map((v) => (
                    <div key={v.version_id}>
                      <Glyph kind={a.kind} seed={v.content_digest} size={40} />
                      <div>
                        <strong>{v.version_label}</strong>
                        <small>
                          {v.availability === 'revoked'
                            ? '已撤销'
                            : v.version_id === a.current_release?.version_id
                              ? '当前发布'
                              : v.published
                                ? '历史发布'
                                : '尚未发布'}
                        </small>
                        <code title={v.content_digest}>
                          {v.content_digest.replace(/^sha256:/, '').slice(0, 12)}
                        </code>
                      </div>
                      {a.can_submit &&
                        a.lifecycle === 'active' &&
                        a.current_release &&
                        v.published &&
                        v.availability !== 'revoked' &&
                        v.version_id !== a.current_release.version_id && (
                          <button
                            className={textBtnStyles}
                            onClick={() => {
                              setVersion(v.version_id);
                              setAction('rollback');
                              setTab('settings');
                            }}
                          >
                            申请回退
                          </button>
                        )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : tab === 'feedback' ? (
            <AssetFeedback
              assetId={a.id}
              versionId={a.can_view_catalog ? a.current_release?.version_id : undefined}
            />
          ) : (
            <>
              {a.kind === 'skill' && a.can_submit && (
                <SkillUsageForm
                  key={a.id + ':' + a.revision}
                  assetId={a.id}
                  revision={a.revision}
                  requiresApiKey={a.requires_api_key}
                  onSaved={onSaved}
                />
              )}
              <form className={formStackStyles} onSubmit={submit}>
                <Message>选择维护操作并填写原因。调整分发范围请从接收记录重新申请审核。</Message>
                <label>
                  操作
                  <SelectField
                    optionIcons={managementIcons}
                    required
                    value={action}
                    onValueChange={(nextValue) => {
                      setAction(nextValue);
                      setVersion('');
                      setReason('');
                      setError('');
                    }}
                  >
                    <option value="">请选择</option>
                    {(a.can_submit || a.can_lifecycle) && a.lifecycle === 'active' && (
                      <option value="deprecated">标记弃用</option>
                    )}
                    {a.can_lifecycle && (
                      <>
                        {a.lifecycle !== 'blocked' && <option value="blocked">紧急封禁</option>}
                        {a.lifecycle !== 'active' && <option value="active">恢复活动状态</option>}
                        <option value="revoke">撤销指定版本</option>
                        <option value="migrate">迁移资产正本</option>
                      </>
                    )}
                    {a.can_submit && a.current_release && a.lifecycle === 'active' && (
                      <option value="rollback">申请回退历史版本</option>
                    )}
                  </SelectField>
                </label>
                {['revoke', 'rollback'].includes(action) && (
                  <label>
                    固定内容版本
                    <SelectField
                      required
                      value={version}
                      onValueChange={(nextValue) => setVersion(nextValue)}
                    >
                      <option value="">请选择版本</option>
                      {versions
                        ?.filter(
                          (v) =>
                            v.availability !== 'revoked' &&
                            (action === 'revoke' ||
                              (v.published && v.version_id !== a.current_release?.version_id)),
                        )
                        .map((v) => (
                          <option key={v.version_id} value={v.version_id}>
                            {v.version_label} · {v.availability}
                          </option>
                        ))}
                    </SelectField>
                  </label>
                )}
                {action === 'migrate' && (
                  <>
                    <label>
                      目标 Git 来源
                      <SelectField
                        required
                        value={sourceId}
                        onValueChange={(nextValue) => setSourceId(nextValue)}
                      >
                        <option value="">请选择已登记的新来源</option>
                        {sources
                          ?.filter((s) => s.id !== a.source_id && s.state !== 'blocked')
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.repository_identity}
                            </option>
                          ))}
                      </SelectField>
                    </label>
                    <label>
                      新读取路径
                      <InputField
                        icon="folder"
                        required
                        value={path}
                        onChange={(e) => setPath(e.target.value)}
                        placeholder={
                          a.kind === 'skill'
                            ? '.agents/skills/' + a.slug
                            : 'mcp/' + a.slug + '/server.json'
                        }
                      />
                    </label>
                    <Message>
                      将保留资产身份和全部历史来源证据，切换之后需要在新来源同步、确认并重新审核；当前发布的来源分发策略继续有效。
                    </Message>
                  </>
                )}
                {action === 'rollback' && (
                  <Message>
                    回退会创建普通审核申请，不会直接切换当前发布。沿用当前分类和受众，并重新核验旧快照来源授权。
                  </Message>
                )}
                {action && (
                  <>
                    <label>
                      操作原因
                      <textarea
                        required
                        maxLength={2000}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      />
                    </label>
                    {error && <Message error>{error}</Message>}
                    <Submit busy={busy}>
                      确认{action === 'rollback' ? '提交回退申请' : '执行操作'}
                    </Submit>
                  </>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
