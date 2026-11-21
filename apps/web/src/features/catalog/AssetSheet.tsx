/**
 * 资产详情抽屉：由 App 通过 Overlay 懒加载。没有固定版本时拉取 `GET /api/assets/{slug}`；
 * 指定版本时只拉取 `GET /api/assets/{slug}/versions/{version_id}`，失败也不改读当前发布。
 * 维护动作走 `PATCH /api/assets/{asset_id}/lifecycle` 与 `POST /api/versions/{version_id}/revoke`，
 * 只在当前发布视图提供，成功后 `reload()` 刷新详情；权限不足时接口报错，未登录会追加登录入口。
 */
import { VersionLabel } from '../../shared/components/VersionLabel.js';
import { managementIcons } from '../../shared/components/select-icons.js';
import {
  detailIdentityStyles,
  assetSymbolStyles,
  typeLabelStyles,
  detailDescriptionWrapStyles,
  detailDescriptionStyles,
  collapsedStyles,
  detailMetaStyles,
  managementToolsStyles,
} from './styles.js';
import {
  monoStyles,
  subtleStyles,
  textBtnStyles,
  chipsStyles,
  tagStyles,
  tagTealStyles,
  formStackStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type { AssetResponse, AssetVersionResponse } from '@capability-hub/contracts/http';
import { ShieldCheck } from '../../shared/icons/lucide.js';
import { useState } from 'react';
import { mutate } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { DetailSkeleton } from '../../shared/components/Skeleton.js';
import { ScriptBadge } from '../../shared/components/ScriptBadge.js';
import { useHub } from '../../shared/context/HubContext.js';
import { categoryLabel, dateLabel } from '../../shared/format/labels.js';
import {
  assetHref,
  loginHref,
  type AssetDrawer,
  type AssetDrawerTab,
} from '../../shared/navigation/history-route.js';
import { AssetContent } from './AssetContent.js';
import { ApiKeyBadge } from './ApiKeyBadge.js';
import { SkillUsageForm } from './SkillUsageForm.js';
import { currentAssetView, fixedAssetView } from './asset-view.js';

/** 不区分撤回、不可见与不存在，避免据此推断受限版本。 */
const unavailableVersion = '此版本已不可用或你无权查看';

/**
 * 详情抽屉外壳：先占位骨架，再渲染身份信息、{@link AssetContent} 与维护工具。
 * 参数全部来自当前地址的抽屉解析结果；`invalid` 时不发请求，直接报错。
 */
export default function AssetSheet({
  slug,
  versionId,
  tab,
  invalid,
}: {
  slug: string;
  versionId?: string;
  tab?: AssetDrawerTab;
  invalid?: AssetDrawer['invalid'];
}) {
  const { refresh, reload, me } = useHub();
  const assetPath = '/api/assets/' + encodeURIComponent(slug);
  const current = useQuery<AssetResponse>(invalid || versionId ? null : assetPath, refresh);
  const fixed = useQuery<AssetVersionResponse>(
    !invalid && versionId ? assetPath + '/versions/' + encodeURIComponent(versionId) : null,
    refresh,
  );
  const query = versionId ? fixed : current;
  const view = versionId
    ? fixed.data && fixedAssetView(fixed.data)
    : current.data && currentAssetView(current.data);
  const [expandedDescription, setExpandedDescription] = useState(false),
    [errorAction, setErrorAction] = useState(''),
    [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(''),
    [action, setAction] = useState('');
  async function lifecycle() {
    const a = view?.current;
    if (!a) return;
    setBusy(true);
    setErrorAction('');
    try {
      if (action === 'revoke')
        await mutate(`/api/versions/${a.current_release.version_id}/revoke`, { reason });
      else
        await mutate(
          `/api/assets/${a.asset_id}/lifecycle`,
          { lifecycle: action, reason },
          'PATCH',
          a.revision,
        );
      reload();
      setAction('');
    } catch (e) {
      setErrorAction(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (invalid)
    return <ErrorState message={invalid === 'version' ? unavailableVersion : '详情链接参数无效'} />;
  if (query.loading && !view) return <DetailSkeleton />;
  if (query.error) {
    const inaccessible =
      query.errorStatus === 401 || query.errorStatus === 403 || query.errorStatus === 404;
    return (
      <>
        <ErrorState
          message={versionId && inaccessible ? unavailableVersion : query.error}
          {...query.errorProps}
          retry={reload}
        />
        {!me && inaccessible && (
          <Message>
            受限资源需要登录后访问。
            <a href={loginHref(window.location.pathname + window.location.search)}>登录后重试</a>
          </Message>
        )}
      </>
    );
  }
  if (!view) return null;
  const { asset: a, release } = view;
  const manageable = view.current;
  const latest = fixed.data && !fixed.data.is_latest ? fixed.data.latest_release : null;
  return (
    <>
      <div className={detailIdentityStyles}>
        <span className={cn(assetSymbolStyles, `group/${a.kind}`)}>
          <Glyph seed={a.content_digest} kind={a.kind} size={52} />
        </span>
        <div>
          <span className={cn(typeLabelStyles, `group/${a.kind}`)}>{a.kind.toUpperCase()}</span>
          <h2>{a.slug}</h2>
          <p className={cn(monoStyles, subtleStyles)}>
            {versionId && '固定版本 '}
            <VersionLabel value={release.version_label} />
          </p>
        </div>
      </div>
      {latest && (
        <Message>
          最新可读版本为 <VersionLabel value={latest.version_label} />。
          <a href={assetHref(a.slug, { versionId: latest.version_id })}>查看最新可读版本</a>
        </Message>
      )}
      <div className={detailDescriptionWrapStyles}>
        <p className={cn(detailDescriptionStyles, !expandedDescription ? collapsedStyles : '')}>
          {a.description}
        </p>
        {a.description.length > 180 && (
          <button
            className={textBtnStyles}
            aria-expanded={expandedDescription}
            onClick={() => setExpandedDescription((value) => !value)}
          >
            {expandedDescription ? '收起说明' : '展开完整说明'}
          </button>
        )}
      </div>
      <div className={chipsStyles}>
        <span className={cn(tagStyles, tagTealStyles)}>
          <ShieldCheck size={12} />
          已审核
        </span>
        <span className={tagStyles}>{categoryLabel(release.category)}</span>
        <span className={tagStyles}>{release.visibility_label}</span>
        {(a.applies_to.keywords ?? []).map((keyword) => (
          <span className={tagStyles} key={keyword}>
            {keyword}
          </span>
        ))}
        {release.has_scripts && <ScriptBadge />}
        {a.kind === 'skill' && a.requires_api_key && <ApiKeyBadge />}
      </div>
      {a.lifecycle === 'deprecated' && <Message>已弃用：{a.deprecation_reason}</Message>}
      <div className={detailMetaStyles}>
        <span>
          维护团队<strong>{a.owner.name}</strong>
        </span>
        <span>
          来源<strong>{a.source.kind === 'git' ? 'Git 固定快照' : '网页上传'}</strong>
        </span>
        <span>
          {versionId ? '版本发布' : '最近发布'}
          <strong>{dateLabel(release.published_at)}</strong>
        </span>
      </div>
      <AssetContent key={release.version_id} view={view} tab={tab} />

      {manageable &&
        (manageable.permissions.can_lifecycle ||
          manageable.permissions.can_revoke ||
          manageable.permissions.can_submit) && (
          <details className={managementToolsStyles}>
            <summary>资产维护与分发控制</summary>
            <div className={formStackStyles}>
              {manageable.kind === 'skill' && manageable.permissions.can_submit && (
                <SkillUsageForm
                  key={manageable.asset_id + ':' + manageable.revision}
                  assetId={manageable.asset_id}
                  revision={manageable.revision}
                  requiresApiKey={manageable.requires_api_key}
                  onSaved={reload}
                />
              )}
              <label>
                操作
                <SelectField
                  optionIcons={managementIcons}
                  value={action}
                  onValueChange={(nextValue) => setAction(nextValue)}
                >
                  <option value="">选择操作</option>
                  {manageable.permissions.can_submit && manageable.lifecycle === 'active' && (
                    <option value="deprecated">标记弃用</option>
                  )}
                  {manageable.permissions.can_lifecycle && (
                    <>
                      <option value="blocked">紧急封禁</option>
                      <option value="active">恢复活动状态</option>
                    </>
                  )}
                  {manageable.permissions.can_revoke && (
                    <option value="revoke">撤销当前版本</option>
                  )}
                </SelectField>
              </label>
              {action && (
                <>
                  <label>
                    操作原因
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      maxLength={2000}
                      required
                      placeholder="说明操作依据和影响范围…"
                    />
                  </label>
                  <Submit busy={busy} disabled={!reason.trim()} onClick={lifecycle}>
                    确认操作
                  </Submit>
                </>
              )}
            </div>
          </details>
        )}
      {errorAction && <Message error>{errorAction}</Message>}
    </>
  );
}
