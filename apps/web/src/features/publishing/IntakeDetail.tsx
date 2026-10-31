import { intakeDetailStyles, intakeSnapshotStyles, intakePublishedStyles } from './styles.js';
import {
  tagStyles,
  textBtnStyles,
  btnStyles,
  btnPrimaryStyles,
  subtleStyles,
  formStackStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { PublicationPolicyFields } from './PublicationPolicyFields.js';
import type { Policy } from '@capability-hub/contracts';
import type { IntakeResponse, ManagementAssetResponse } from '@capability-hub/contracts/http';
import { ArrowRight, ShieldCheck } from '../../shared/icons/lucide.js';
import { useEffect, useState, type FormEvent } from 'react';
import { api, mutate } from '../../shared/api/client.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { assetHref } from '../../shared/navigation/history-route.js';
import { useHub } from '../../shared/context/HubContext.js';
import { bytesLabel } from '../../shared/format/labels.js';
import { intakeLabel } from './intake-label.js';
import { IntakeProgress } from './IntakeProgress.js';
import type { IntakeConnection } from './use-intake-detail.js';
import { IntakeScan } from './IntakeScan.js';
import { KeywordField } from '../../shared/components/KeywordField.js';
export function IntakeDetail({
  intake: i,
  onSelect,
  connection,
}: {
  intake: IntakeResponse;
  connection?: IntakeConnection;
  onSelect?: (id: string) => void;
}) {
  const { reload } = useHub();
  const inactive = i.asset_lifecycle !== 'active';
  const [value, setValue] = useState<Policy>(i.proposed_policy),
    [appliesTo, setAppliesTo] = useState(i.proposed_applies_to),
    [purpose, setPurpose] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [submitted, setSubmitted] = useState(false),
    [reapplying, setReapplying] = useState(false);
  useEffect(() => {
    setValue(i.proposed_policy);
    setAppliesTo(i.publication?.applies_to ?? i.proposed_applies_to);
    setSubmitted(false);
    setReapplying(false);
    setError('');
    setPurpose('');
  }, [i.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const assets = await api<ManagementAssetResponse[]>('/api/management/assets');
      await mutate('/api/publication-requests', {
        source_intake_id: i.id,
        version_id: i.version_id,
        ...value,
        applies_to: appliesTo,
        purpose,
        base_release_id: assets.find((a) => a.id === i.asset_id)?.current_release_id ?? null,
      });
      setSubmitted(true);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={intakeDetailStyles}>
      <h3>
        {i.asset_slug} <span className={tagStyles}>{intakeLabel(i)}</span>
      </h3>
      <IntakeProgress intake={i} connection={connection} />
      {inactive && (
        <Message>
          资产已{i.asset_lifecycle === 'deprecated' ? '弃用' : '封禁'}，当前不能提交审核。
          {i.asset_lifecycle_reason && `原因：${i.asset_lifecycle_reason}。`}
          接收快照与历史审核记录保留；如需继续发布，请先联系有权限的管理员恢复活动状态。
        </Message>
      )}
      {i.error_code && <Message error>{i.error_message ?? i.error_code}</Message>}
      {!inactive && i.state === 'failed' && i.retryable && (
        <Submit
          busy={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await mutate('/api/intakes/' + i.id + '/retry', {});
              reload();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          重新校验原始包
        </Submit>
      )}
      {error && <Message error>{error}</Message>}
      {i.scan && <IntakeScan scan={i.scan} />}
      {i.version && (
        <details className={intakeSnapshotStyles}>
          <summary>
            <ShieldCheck size={14} />
            <strong>{i.version.version_label}</strong>
            <span>
              {i.version.manifest.files.length} 个文件 ·{' '}
              {bytesLabel(i.version.manifest.files.reduce((sum, f) => sum + f.size, 0))}
            </span>
          </summary>
          <div>
            <span>固定内容快照</span>
            <code>{i.version.content_digest}</code>
          </div>
        </details>
      )}
      {!inactive && ['ready', 'failed'].includes(i.state) && i.version && !i.ruleset_current && (
        <Message>
          扫描规则已更新；重新申请分发前请先按最新规则扫描此固定内容。
          <button
            className={textBtnStyles}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const result = await mutate<{ intake_id: string }>(
                  '/api/intakes/' + i.id + '/rescan',
                  {},
                );
                onSelect?.(result.intake_id);
                reload();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            重新扫描固定快照
          </button>
        </Message>
      )}
      {!inactive &&
        i.state === 'ready' &&
        (i.ruleset_current || i.publication?.state === 'approved') &&
        (submitted || i.publication?.state === 'pending' ? (
          <Message>
            已提交人工审核。当前发布在审核通过前保持原样。
            <a
              href={
                i.publication
                  ? `/review?state=${i.publication.state}&request=${i.publication.id}`
                  : '/review'
              }
            >
              查看审核
            </a>
          </Message>
        ) : i.publication?.state === 'approved' && !reapplying ? (
          <div className={intakePublishedStyles}>
            <ShieldCheck size={27} />
            <h4>此快照已审核发布</h4>
            <p>调整分类或分发范围时，需要创建新的审核申请。</p>
            {i.can_view_catalog ? (
              <a className={cn(btnStyles, btnPrimaryStyles)} href={assetHref(i.asset_slug)}>
                查看目录详情
                <ArrowRight size={15} />
              </a>
            ) : (
              <p className={subtleStyles}>当前发布不可访问，可从资产维护查看版本记录。</p>
            )}
            <button
              className={textBtnStyles}
              disabled={!i.ruleset_current}
              onClick={() => setReapplying(true)}
            >
              重新申请分发
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className={formStackStyles}>
            <PublicationPolicyFields value={value} onChange={setValue} />
            <KeywordField
              value={appliesTo.keywords ?? []}
              onChange={(keywords) => setAppliesTo({ ...appliesTo, keywords })}
            />
            <label>
              共享目的与授权确认
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                required
                maxLength={2000}
                placeholder="说明内容适用范围，并确认你有权将此快照共享给所选受众。"
              />
            </label>
            <Submit busy={busy}>
              确认内容并提交审核
              <ArrowRight size={16} />
            </Submit>
          </form>
        ))}
    </div>
  );
}
