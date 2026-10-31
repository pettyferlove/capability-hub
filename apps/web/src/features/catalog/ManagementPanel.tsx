import { InputField } from '../../shared/components/InputField.js';
import { managementIcons } from '../../shared/components/select-icons.js';
import {
  formStackStyles,
  sectionHeadingStyles,
  subtleStyles,
  sourceGridStyles,
  panelStyles,
  monoStyles,
  tagStyles,
  tagRedStyles,
  tagTealStyles,
  sourceActionsStyles,
  btnStyles,
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
import { ArrowRight, History, ShieldCheck } from '../../shared/icons/lucide.js';
import { useState, type FormEvent } from 'react';
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
import { assetHref } from '../../shared/navigation/history-route.js';
import { useHub } from '../../shared/context/HubContext.js';
import { stateLabel } from '../../shared/format/labels.js';
export default function ManagementPanel() {
  const { refresh, reload } = useHub();
  const { data, error, loading } = useQuery<ManagementAssetResponse[]>(
    '/api/management/assets',
    refresh,
  );
  const [asset, setAsset] = useState<ManagementAssetResponse>();
  return (
    <div className={formStackStyles}>
      <div className={sectionHeadingStyles}>
        <div>
          <h2>资产维护</h2>
          <p className={subtleStyles}>维护权限与分发受众分别判断。封禁资产仍可从这里进行管理。</p>
        </div>
      </div>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading && !data ? (
        <CardGridSkeleton label="正在加载可维护资产…" count={3} variant="source" />
      ) : !data?.length ? (
        <Empty title="没有可维护的资产">有明确维护或分发管理权限的资产会出现在这里。</Empty>
      ) : (
        <div className={cn(sourceGridStyles, managementGridStyles)}>
          {data.map((a) => (
            <section className={cn(panelStyles, managementCardStyles)} key={a.id}>
              <div className={sectionHeadingStyles}>
                <div>
                  <span className={typeLabelStyles}>{a.kind.toUpperCase()}</span>
                  <h3 className={monoStyles}>{a.slug}</h3>
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
                {a.current_release ? '已有审核发布记录' : '尚未发布'} · 修订 {a.revision}
              </p>
              <div className={sourceActionsStyles}>
                <button className={btnStyles} onClick={() => setAsset(a)}>
                  <ShieldCheck size={15} />
                  维护与分发控制
                </button>
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
  onClose,
  onSaved,
}: {
  asset: ManagementAssetResponse;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: versions } = useQuery<VersionHistoryResponse[]>(
    '/api/management/assets/' + a.id + '/versions',
  );
  const { data: sources } = useQuery<SourceResponse[]>('/api/sources');
  const [action, setAction] = useState(''),
    [reason, setReason] = useState(''),
    [version, setVersion] = useState(''),
    [sourceId, setSourceId] = useState(''),
    [path, setPath] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
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
          <Message>
            管理员通过管理接口审查内容；普通目录仍按当前受众与历史版本受众的交集分发。
          </Message>
          <label>
            操作
            <SelectField
              optionIcons={managementIcons}
              required
              value={action}
              onValueChange={(nextValue) => {
                setAction(nextValue);
                setError('');
              }}
            >
              <option value="">请选择</option>
              {a.lifecycle === 'active' && <option value="deprecated">标记弃用</option>}
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
                    (v) => action === 'revoke' || (v.published && v.availability !== 'revoked'),
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
              <Submit busy={busy}>确认{action === 'rollback' ? '提交回退申请' : '执行操作'}</Submit>
            </>
          )}
          <div className={historyListStyles}>
            {versions?.map((v) => (
              <div key={v.version_id}>
                <History size={16} />
                <div>
                  <strong>{v.version_label}</strong>
                  {v.availability && <small>{stateLabel(v.availability)}</small>}
                  <code>{v.content_digest}</code>
                </div>
              </div>
            ))}
          </div>
        </form>
        {a.can_submit && <AssetFeedback key={a.id} assetId={a.id} />}
      </div>
    </>
  );
}
