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
import type { AssetResponse } from '@capability-hub/contracts/http';
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
import { assetHref, loginHref } from '../../shared/navigation/history-route.js';
import { AssetContent } from './AssetContent.js';
import { ApiKeyBadge } from './ApiKeyBadge.js';
import { SkillUsageForm } from './SkillUsageForm.js';
export default function AssetSheet({ slug }: { slug: string }) {
  const { refresh, reload, me } = useHub();
  const {
    data: a,
    error,
    loading,
  } = useQuery<AssetResponse>('/api/assets/' + encodeURIComponent(slug), refresh);
  const [expandedDescription, setExpandedDescription] = useState(false),
    [errorAction, setErrorAction] = useState(''),
    [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(''),
    [action, setAction] = useState('');
  async function lifecycle() {
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
  return (
    <>
      {loading && !a ? (
        <DetailSkeleton />
      ) : error ? (
        <>
          <ErrorState message={error} retry={reload} />
          {!me && (
            <Message>
              受限资源需要登录后访问。
              <a href={loginHref(assetHref(slug) + window.location.search)}>登录后重试</a>
            </Message>
          )}
        </>
      ) : (
        a && (
          <>
            <div className={detailIdentityStyles}>
              <span className={cn(assetSymbolStyles, `group/${a.kind}`)}>
                <Glyph seed={a.content_digest} kind={a.kind} size={52} />
              </span>
              <div>
                <span className={cn(typeLabelStyles, `group/${a.kind}`)}>
                  {a.kind.toUpperCase()}
                </span>
                <h2>{a.slug}</h2>
                <p className={cn(monoStyles, subtleStyles)}>{a.current_release.version_label}</p>
              </div>
            </div>
            <div className={detailDescriptionWrapStyles}>
              <p
                className={cn(detailDescriptionStyles, !expandedDescription ? collapsedStyles : '')}
              >
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
              <span className={tagStyles}>{categoryLabel(a.current_release.category)}</span>
              <span className={tagStyles}>{a.current_release.visibility_label}</span>
              {(a.applies_to.keywords ?? []).map((keyword) => (
                <span className={tagStyles} key={keyword}>
                  {keyword}
                </span>
              ))}
              {a.current_release.has_scripts && <ScriptBadge />}
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
                最近发布<strong>{dateLabel(a.current_release.published_at)}</strong>
              </span>
            </div>
            <AssetContent key={a.current_release.version_id} asset={a} />

            {(a.permissions.can_lifecycle ||
              a.permissions.can_revoke ||
              a.permissions.can_submit) && (
              <details className={managementToolsStyles}>
                <summary>资产维护与分发控制</summary>
                <div className={formStackStyles}>
                  {a.kind === 'skill' && a.permissions.can_submit && (
                    <SkillUsageForm
                      key={a.asset_id + ':' + a.revision}
                      assetId={a.asset_id}
                      revision={a.revision}
                      requiresApiKey={a.requires_api_key}
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
                      {a.permissions.can_submit && a.lifecycle === 'active' && (
                        <option value="deprecated">标记弃用</option>
                      )}
                      {a.permissions.can_lifecycle && (
                        <>
                          <option value="blocked">紧急封禁</option>
                          <option value="active">恢复活动状态</option>
                        </>
                      )}
                      {a.permissions.can_revoke && <option value="revoke">撤销当前版本</option>}
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
        )
      )}
    </>
  );
}
