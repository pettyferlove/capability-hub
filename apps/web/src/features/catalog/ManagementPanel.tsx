/**
 * 资产维护面板：发布页「维护」标签的内容，列出 `GET /api/management/assets` 的结果。
 * 单个资产在抽屉里操作版本、来源与反馈；生命周期与迁移请求带 `revision` 做并发校验，
 * 回退与吊销只提交 `reason`，失败时回显错误文案。
 */
import { VersionLabel } from '../../shared/components/VersionLabel.js';
import { shortVersion } from '../../shared/format/version-label.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { InputField } from '../../shared/components/InputField.js';
import { intakeStatusIcons, managementIcons } from '../../shared/components/select-icons.js';
import {
  formStackStyles,
  sectionHeadingStyles,
  subtleStyles,
  monoStyles,
  dataTableStyles,
  tableWrapStyles,
  btnStyles,
  btnDangerStyles,
  dangerTextStyles,
  formActionsStyles,
  textBtnStyles,
  sheetScrollStyles,
} from '../../shared/styles/recipes.js';
import {
  managementTableStyles,
  managementActionsStyles,
  managementStatusStyles,
  historyListStyles,
} from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { AssetFeedback } from './AssetFeedback.js';
import { SkillUsageForm } from './SkillUsageForm.js';
import { McpSharedKeysForm } from './McpSharedKeysForm.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type {
  ManagementAssetResponse,
  ManagementAssetListResponse,
  SourceResponse,
  VersionHistoryResponse,
} from '@capability-hub/contracts/http';
import {
  ArrowRight,
  ShieldCheck,
  UploadCloud,
  GitBranch,
  Trash2,
  CircleDashed,
  CircleHelp,
  type IconComponent,
} from '../../shared/icons/lucide.js';
import { browserUuid } from '@capability-hub/logging/browser';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { api, mutate } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { CardGridSkeleton, TableSkeleton } from '../../shared/components/Skeleton.js';
import { ServerPagination } from '../../shared/components/ServerPagination.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { Empty } from '../../shared/components/Empty.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { assetHref, pageHref } from '../../shared/navigation/history-route.js';
import { useHub } from '../../shared/context/HubContext.js';
import { stateLabel } from '../../shared/format/labels.js';

const managementStatusIcons: Readonly<Record<string, IconComponent>> = {
  ...intakeStatusIcons,
  active: managementIcons.active,
  unreleased: CircleDashed,
  received: intakeStatusIcons.processing,
  fetching: intakeStatusIcons.processing,
  scanning: intakeStatusIcons.processing,
};

function ManagementStatus({ state, label }: { state: string; label?: string }) {
  const Icon = managementStatusIcons[state] ?? CircleHelp;
  return (
    <span className={managementStatusStyles} data-state={state}>
      <Icon size={13} aria-hidden="true" />
      {label ??
        (state === 'unreleased' ? '尚未发布' : state === 'blocked' ? '已封禁' : stateLabel(state))}
    </span>
  );
}

/** 筛选与翻页由服务端完成；管理抽屉保留选中资源的修订号。 */
export default function ManagementPanel() {
  const { refresh, reload } = useHub();
  const [asset, setAsset] = useState<ManagementAssetResponse>();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    if (search.trim() === q) return;
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, q]);
  const params = new URLSearchParams({
    q,
    state: filter,
    page: String(page),
    page_size: String(pageSize),
  });
  const { data, error, loading, isPreviousData } = useQuery<ManagementAssetListResponse>(
    '/api/management/assets?' + params.toString(),
    refresh,
    { keepPreviousData: true },
  );
  const filtered = !!q || filter !== 'all';
  return (
    <div className={formStackStyles}>
      <div className={sectionHeadingStyles}>
        <div>
          <h2>资产维护</h2>
          <p className={subtleStyles}>查看当前发布、跟进审核，或为同一资产添加新版本。</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <InputField
            icon="package"
            type="search"
            aria-label="搜索维护资产"
            placeholder="搜索资产名称或类型…"
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-40 max-w-full">
          <SelectField
            aria-label="维护资产状态"
            value={filter}
            onValueChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
          >
            <option value="all">全部资产</option>
            <option value="pending">待审核</option>
            <option value="active">活动</option>
            <option value="deprecated">已弃用</option>
            <option value="blocked">已封禁</option>
          </SelectField>
        </div>
      </div>
      <QueryRegion
        label="资产维护查询结果"
        loading={loading}
        isPreviousData={isPreviousData}
        showProgress={!!data}
      >
        {error ? (
          <ErrorState message={error} retry={reload} />
        ) : loading && !data ? (
          <TableSkeleton label="正在加载可维护资产…" rows={5} columns={4} paginated stackOnMobile />
        ) : !data?.items.length ? (
          <Empty title={filtered ? '没有匹配的资产' : '没有可维护的资产'}>
            {filtered
              ? '请调整名称、类型或状态筛选。'
              : '有明确维护或分发管理权限的资产会出现在这里。'}
          </Empty>
        ) : (
          <div className={cn(dataTableStyles, managementTableStyles)} aria-busy={loading}>
            <div className={tableWrapStyles} tabIndex={0} role="region" aria-label="资产维护表格">
              <table aria-label="维护资产">
                <thead>
                  <tr>
                    <th scope="col">资源</th>
                    <th scope="col">当前发布</th>
                    <th scope="col">最近接收</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="flex min-w-0 items-center gap-3">
                          <Glyph
                            seed={a.current_version?.content_digest ?? a.id}
                            kind={a.kind}
                            size={32}
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <strong className={monoStyles}>{a.slug}</strong>
                              <ManagementStatus state={a.lifecycle} />
                            </div>
                            <span className={subtleStyles}>
                              {a.kind.toUpperCase()} ·{' '}
                              {a.source_kind === 'git' ? 'Git 同步' : '文件上传'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="mb-1 block text-caption text-muted-ink min-[761px]:hidden">
                          当前发布
                        </span>
                        {a.current_version ? (
                          <strong className={monoStyles}>
                            <VersionLabel value={a.current_version.version_label} />
                          </strong>
                        ) : (
                          <ManagementStatus state="unreleased" />
                        )}
                        {a.current_release && (
                          <small>第 {a.current_release.release_seq} 次发布</small>
                        )}
                      </td>
                      <td>
                        <span className="mb-1 block text-caption text-muted-ink min-[761px]:hidden">
                          最近接收
                        </span>
                        {a.latest_intake ? (
                          <>
                            <a
                              className={textBtnStyles}
                              aria-label={'查看接收 ' + a.latest_intake.version_label}
                              href={pageHref('publish', { intake: a.latest_intake.id })}
                            >
                              <VersionLabel value={a.latest_intake.version_label} />
                              <ArrowRight size={13} />
                            </a>
                            {!(
                              a.latest_intake.state === 'pending' && a.pending_requests.length > 0
                            ) && (
                              <div className="mt-1">
                                <ManagementStatus state={a.latest_intake.state} />
                              </div>
                            )}
                          </>
                        ) : (
                          <span className={subtleStyles}>尚无接收</span>
                        )}
                        {a.pending_requests.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <ManagementStatus
                              state="pending"
                              label={`待审核 · ${a.pending_requests.length} 项`}
                            />
                            {a.pending_requests.map((request) => (
                              <a
                                key={request.id}
                                className={textBtnStyles}
                                href={pageHref('review', { request: request.id })}
                              >
                                <VersionLabel value={request.version_label} />
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className={managementActionsStyles}>
                          {a.can_submit && a.lifecycle === 'active' && (
                            <a
                              className={btnStyles}
                              href={pageHref(
                                'publish',
                                a.source_kind === 'upload' ? { asset: a.id } : { tab: 'git' },
                              )}
                            >
                              {a.source_kind === 'upload' ? (
                                <UploadCloud size={14} />
                              ) : (
                                <GitBranch size={14} />
                              )}
                              {a.source_kind === 'upload' ? '更新版本' : '前往 Git 同步'}
                            </a>
                          )}
                          <button
                            type="button"
                            className={btnStyles}
                            aria-label="版本与管理"
                            title="版本与管理"
                            onClick={() => setAsset(a)}
                          >
                            <ShieldCheck size={14} />
                            管理
                          </button>
                          {a.can_view_catalog && (
                            <a className={textBtnStyles} href={assetHref(a.slug)}>
                              查看详情 <ArrowRight size={13} />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ServerPagination
              label="资产维护"
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              disabled={loading}
              onChange={(next, size) => {
                setPage(next);
                setPageSize(size);
              }}
            />
          </div>
        )}
      </QueryRegion>
      <Overlay open={!!asset} onClose={() => setAsset(undefined)} label="维护资产" variant="sheet">
        {asset && (
          <Controls
            asset={asset}
            initialTab="versions"
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
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteRetry = useRef<{ signature: string; key: string } | null>(null);
  const { data: sources } = useQuery<SourceResponse[]>(
    action === 'migrate' ? '/api/sources' : null,
  );
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    if (action === 'delete') {
      setError('');
      setConfirmDelete(true);
      return;
    }
    await execute();
  }
  function closeDelete() {
    if (!busy) setConfirmDelete(false);
  }
  async function execute() {
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
      } else if (action === 'delete') {
        const body = JSON.stringify({ reason });
        const signature = JSON.stringify([a.id, a.revision, body]);
        if (deleteRetry.current?.signature !== signature)
          deleteRetry.current = { signature, key: browserUuid() };
        await api('/api/assets/' + a.id, {
          method: 'DELETE',
          body,
          headers: {
            'If-Match': `"${a.revision}"`,
            'Idempotency-Key': deleteRetry.current.key,
          },
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
                当前发布：
                <VersionLabel value={a.current_version?.version_label ?? '尚未发布'} />
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
                        <strong>
                          <VersionLabel value={v.version_label} />
                        </strong>
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
              {a.kind === 'mcp' && a.can_submit && a.lifecycle === 'active' && (
                <McpSharedKeysForm
                  key={a.id + ':' + a.revision}
                  assetId={a.id}
                  assetSlug={a.slug}
                  onSaved={onSaved}
                />
              )}
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
                    {a.can_delete && (
                      <option value="delete" className={dangerTextStyles}>
                        删除错误资源
                      </option>
                    )}
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
                            {shortVersion(v.version_label, true)} · {v.availability}
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
                {action === 'delete' && (
                  <Message>
                    将永久删除「{a.slug}
                    」及其失败或已取消的接收记录，释放资源名称。操作不可恢复，审计记录会保留。
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
                        placeholder="说明操作依据和影响范围…"
                      />
                    </label>
                    {error && !confirmDelete && <Message error>{error}</Message>}
                    <Submit
                      busy={busy}
                      disabled={action === 'delete' && !reason.trim()}
                      className={action === 'delete' ? btnDangerStyles : undefined}
                    >
                      {action === 'rollback'
                        ? '确认提交回退申请'
                        : action === 'delete'
                          ? '删除资源'
                          : '确认执行操作'}
                    </Submit>
                  </>
                )}
              </form>
            </>
          )}
        </div>
      </div>
      <Overlay
        open={confirmDelete}
        onClose={closeDelete}
        label="确认删除错误资源"
        variant="palette"
      >
        <DialogTitle title="确认删除错误资源" onClose={closeDelete} />
        <div className="space-y-4 px-6.5 py-5.5 max-[600px]:p-[17px]">
          <p>
            即将永久删除资源 <strong>{a.slug}</strong> 及其失败或已取消的接收记录。操作不可恢复。
          </p>
          <p className={subtleStyles}>删除原因：{reason}</p>
          <Message>资源名称将释放，审计记录会保留。</Message>
          {error && <Message error>{error}</Message>}
          <div className={formActionsStyles}>
            <button type="button" className={btnStyles} disabled={busy} onClick={closeDelete}>
              取消
            </button>
            <Submit type="button" busy={busy} className={btnDangerStyles} onClick={execute}>
              <Trash2 size={16} aria-hidden="true" />
              确认永久删除
            </Submit>
          </div>
        </div>
      </Overlay>
    </>
  );
}
