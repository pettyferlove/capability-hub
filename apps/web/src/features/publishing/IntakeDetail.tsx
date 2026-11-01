/**
 * 单条接收记录的校验与发布工作台：证据页展示扫描结果与固定内容快照，发布页填写策略后向
 * `POST /api/publication-requests` 提交人工审核。失败记录可 `POST /api/intakes/{id}/retry` 重试，
 * 规则集过期时用 `/api/intakes/{id}/rescan` 按最新规则重扫并切到新记录。
 */
import { createPortal } from 'react-dom';
import { FieldSuggestion } from './FieldSuggestion.js';
import { SubmittedFields } from './SubmittedFields.js';
import { PublicationFooter, type PublicationNotice } from './PublicationFooter.js';
import { DraftReceipt, type DraftChange } from './DraftReceipt.js';
import type { ReviewOrigin } from '../ai/quick-review.js';
import { categoryLabels, type AuditSuggestion } from '../ai/publication-suggestion.js';
import { PageTabs } from '../../shared/components/PageTabs.js';
import { VersionComparison } from '../../shared/components/VersionComparison.js';
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
import type { IntakeResponse } from '@capability-hub/contracts/http';
import { ArrowRight, ShieldCheck } from '../../shared/icons/lucide.js';
import { useEffect, useId, useLayoutEffect, useRef, useState, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
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
import { SkillApiKeyField } from '../../shared/components/SkillApiKeyField.js';
/**
 * 详情工作台：仅当校验通过、规则集未过期且未处于待审核时可编辑（已发布需点重新申请），
 * `asset_lifecycle` 非 `active` 时整页只读。提交前用 `notices` 汇总缺少的必填项与扫描发现，底部操作栏
 * 由 {@link PublicationFooter} 门户挂到父级提供的插槽。
 */
export function IntakeDetail({
  intake: i,
  suggestion,
  origin,
  onSelect,
  connection,
  footerSlot,
}: {
  intake: IntakeResponse;
  footerSlot?: HTMLElement | null;
  suggestion?: AuditSuggestion;
  origin?: ReviewOrigin;
  connection?: IntakeConnection;
  onSelect?: (id: string) => void;
}) {
  const { reload } = useHub();
  const [section, setSection] = useState(i.state === 'ready' ? 'publication' : 'evidence');
  const inactive = i.asset_lifecycle !== 'active';
  const [requiresApiKey, setRequiresApiKey] = useState(
    i.publication?.requires_api_key ?? i.proposed_requires_api_key,
  );
  const [value, setValue] = useState<Policy>(i.proposed_policy),
    [appliesTo, setAppliesTo] = useState(i.proposed_applies_to),
    [purpose, setPurpose] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [submitted, setSubmitted] = useState(''),
    [reapplying, setReapplying] = useState(false);
  useEffect(() => {
    setValue(i.proposed_policy);
    setAppliesTo(i.publication?.applies_to ?? i.proposed_applies_to);
    setRequiresApiKey(i.publication?.requires_api_key ?? i.proposed_requires_api_key);
    setSubmitted('');
    setReapplying(false);
    setError('');
    setPurpose(i.publication?.source_consent.purpose ?? '');
    applied.current = '';
    edited.current = {
      category: i.proposed_policy.category !== 'uncategorized',
      keywords: false,
      purpose: !!i.publication?.source_consent.purpose,
    };
  }, [i.id]);
  const edited = useRef({ category: false, keywords: false, purpose: false });
  const applied = useRef('');
  const [receipt, setReceipt] = useState<{
    id: string;
    origin?: ReviewOrigin;
    changes: DraftChange[];
  }>();
  const source = receipt?.origin ?? origin;
  const proposal =
    suggestion?.versionId === i.version_id && suggestion?.digest === i.content_digest
      ? suggestion
      : undefined;
  const editable =
    !inactive &&
    i.state === 'ready' &&
    i.ruleset_current &&
    !submitted &&
    i.publication?.state !== 'pending' &&
    (i.publication?.state !== 'approved' || reapplying);
  const formId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [jump, setJump] = useState<PublicationNotice>();
  function locate(notice: PublicationNotice) {
    setSection(notice.evidence ? 'evidence' : 'publication');
    setJump(notice);
  }
  useLayoutEffect(() => {
    if (!jump) return;
    const target = Array.from(
      root.current?.querySelectorAll<HTMLElement>('[data-review-target]') ?? [],
    ).find((node) => node.dataset.reviewTarget === jump.target);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView?.({ block: 'center' });
    setJump(undefined);
  }, [jump]);
  const notices: PublicationNotice[] = [];
  if (editable) {
    if (value.category === 'scenario' && !value.scenario_ids.length)
      notices.push({ target: 'scenarios', evidence: false, text: '场景分类还缺少适用场景' });
    if (!value.distribution.audience.length)
      notices.push({ target: 'audience', evidence: false, text: '请指定至少一个受众' });
    if (i.version?.manifest.kind === 'skill' && i.proposed_requires_api_key && !requiresApiKey)
      notices.push({
        target: 'api-key',
        evidence: false,
        text: '接收记录标记了需要 API Key，请核对当前设置',
      });
    for (const finding of i.scan?.findings ?? [])
      if (finding.severity !== 'info')
        notices.push({
          target: 'scan-' + finding.id,
          evidence: true,
          text: finding.file + ' · ' + finding.evidence_summary,
        });
    proposal?.notices?.forEach((notice, index) =>
      notices.push({ target: 'audit-' + index, evidence: true, text: notice.title }),
    );
  }
  function fillProposal(field?: DraftChange['field'], button?: DOMRect) {
    if (!proposal || proposal.pending || !editable) return;
    if (field) edited.current[field] = true;
    const fields = proposal.fields;
    const writeCategory = field ? field === 'category' : !edited.current.category;
    const writeKeywords = field ? field === 'keywords' : !edited.current.keywords;
    const writePurpose = field ? field === 'purpose' : !edited.current.purpose;
    const existing = appliesTo.keywords ?? [];
    const seen = new Set(existing.map((word) => word.toLowerCase()));
    const additions = fields.keywords.filter((word) => !seen.has(word.toLowerCase()));
    const keywords = [...existing, ...additions].slice(0, 20);
    const changedCategory =
      value.category !== fields.category ||
      [...value.scenario_ids].sort().join() !== [...fields.scenario_ids].sort().join();
    const changedKeywords = JSON.stringify(existing) !== JSON.stringify(keywords);
    if (writeCategory)
      setValue({ ...value, category: fields.category, scenario_ids: fields.scenario_ids });
    if (writeKeywords) setAppliesTo({ ...appliesTo, keywords });
    if (writePurpose) setPurpose(fields.purpose);
    const changes: DraftChange[] = [
      {
        field: 'category',
        label: '分类',
        value: categoryLabels[writeCategory ? fields.category : value.category],
        result: !writeCategory ? '保留手动填写' : changedCategory ? '已填入' : '已有相同内容',
      },
      {
        field: 'keywords',
        label: '关键词',
        value: (writeKeywords ? keywords : existing).join(' · '),
        result: !writeKeywords
          ? '保留手动填写'
          : changedKeywords
            ? '已填入'
            : additions.length
              ? '已达关键词上限'
              : '已有相同内容',
      },
      {
        field: 'purpose',
        label: '共享目的',
        value: writePurpose ? fields.purpose : purpose,
        result: !writePurpose
          ? '保留手动填写'
          : purpose !== fields.purpose
            ? '已填入'
            : '已有相同内容',
      },
    ];
    setReceipt({
      id: proposal.executionId,
      changes: field ? changes.filter((change) => change.field === field) : changes,
      origin: button && {
        executionId: proposal.executionId,
        x: button.left + button.width / 2,
        y: button.top + button.height / 2,
      },
    });
    applied.current = proposal.executionId;
  }
  useEffect(() => {
    if (proposal && !proposal.pending && applied.current !== proposal.executionId) fillProposal();
  }, [proposal, editable]);
  useEffect(() => {
    if (origin && receipt?.id === origin.executionId && editable) setSection('publication');
  }, [origin, receipt?.id, editable]);
  function hint(field: DraftChange['field']) {
    if (!proposal) return;
    const fields = proposal.fields;
    const keywords = new Set((appliesTo.keywords ?? []).map((term) => term.toLowerCase()));
    const missing = fields.keywords.filter((term) => !keywords.has(term.toLowerCase()));
    const categoriesMatch =
      value.category === fields.category &&
      value.scenario_ids.length === fields.scenario_ids.length &&
      fields.scenario_ids.every((id) => value.scenario_ids.includes(id));
    const config = {
      category: {
        label: '分类',
        values: [categoryLabels[fields.category]],
        matched: categoriesMatch,
      },
      keywords: {
        label: '关键词',
        values: missing.length ? missing : fields.keywords,
        matched: missing.length === 0,
      },
      purpose: { label: '共享目的', values: [fields.purpose], matched: purpose === fields.purpose },
    }[field];
    return (
      <FieldSuggestion
        {...config}
        pending={proposal.pending}
        onApply={
          field === 'keywords' && keywords.size >= 20
            ? undefined
            : (event) => fillProposal(field, event.currentTarget.getBoundingClientRect())
        }
      />
    );
  }
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await mutate<{ id: string }>('/api/publication-requests', {
        source_intake_id: i.id,
        version_id: i.version_id,
        ...value,
        applies_to: appliesTo,
        ...(i.version?.manifest.kind === 'skill' ? { requires_api_key: requiresApiKey } : {}),
        purpose,
        base_release_id: i.current_release_id,
      });
      setSubmitted(result.id);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const reviewId = submitted || (i.publication?.state === 'pending' ? i.publication.id : '');
  const reviewHref = submitted
    ? '/review?request=' + submitted
    : '/review?state=pending&request=' + reviewId;
  const footer = (editable || reviewId) && (
    <PublicationFooter
      notices={section === 'publication' ? notices : []}
      locate={locate}
      hint={reviewId ? '申请已提交，等待人工审核' : '请确认用途和受众后提交人工审核'}
      action={
        reviewId ? (
          <a href={reviewHref} className={cn(btnStyles, btnPrimaryStyles)}>
            查看审核
            <ArrowRight size={15} />
          </a>
        ) : section === 'publication' ? (
          <Submit form={formId} type="submit" busy={busy}>
            确认内容并提交审核
            <ArrowRight size={16} />
          </Submit>
        ) : (
          <button
            type="button"
            className={cn(btnStyles, btnPrimaryStyles)}
            onClick={() => setSection('publication')}
          >
            填写发布申请
            <ArrowRight size={15} />
          </button>
        )
      }
    />
  );
  return (
    <div ref={root} className={intakeDetailStyles}>
      <h3>
        {i.asset_slug} <span className={tagStyles}>{intakeLabel(i)}</span>
      </h3>
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
      {i.version && (
        <PageTabs
          label="校验与发布步骤"
          panelId="intake-workspace"
          value={section}
          onValueChange={setSection}
          items={[
            { id: 'evidence', label: '01 校验与证据' },
            { id: 'publication', label: '02 发布申请' },
          ]}
        />
      )}
      <div
        hidden={section !== 'evidence'}
        id="intake-workspace-evidence"
        role="tabpanel"
        aria-labelledby="intake-workspace-tab-evidence"
        className="space-y-5"
      >
        <IntakeProgress intake={i} connection={connection} />
        {i.version && (
          <VersionComparison
            kind={i.version.manifest.kind}
            previous={i.current_version}
            candidate={i.version}
          />
        )}
        {!!proposal?.notices?.length && (
          <section aria-label="研判核对依据" className="space-y-3">
            <h4 className="font-semibold">研判核对依据</h4>
            {proposal.notices.map((notice, index) => (
              <article
                key={index}
                tabIndex={-1}
                data-review-target={'audit-' + index}
                className="space-y-2 rounded-lg border border-warning/25 bg-warning-soft/40 p-3 focus:outline-brand"
              >
                <strong>{notice.title}</strong>
                <p>{notice.explanation}</p>
                {notice.evidence.map((ref, index) => (
                  <code key={index} className="mr-2 break-all text-caption">
                    {ref}
                  </code>
                ))}
              </article>
            ))}
          </section>
        )}
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
      </div>
      <div
        hidden={section !== 'publication'}
        id="intake-workspace-publication"
        role="tabpanel"
        aria-labelledby="intake-workspace-tab-publication"
        className="w-full space-y-5"
      >
        {i.state !== 'ready' && <Message>完成资源校验后即可填写发布申请。</Message>}
        {!inactive &&
          i.state === 'ready' &&
          (i.ruleset_current || i.publication?.state === 'approved') &&
          (submitted || i.publication?.state === 'pending' ? (
            i.publication?.state === 'pending' ? (
              <SubmittedFields publication={i.publication} suggestion={proposal} />
            ) : (
              <Message>已提交人工审核。</Message>
            )
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
            <form id={formId} onSubmit={submit} className={formStackStyles}>
              {source &&
                receipt?.id === proposal?.executionId &&
                receipt &&
                receipt.id === source.executionId && (
                  <DraftReceipt
                    visible={section === 'publication'}
                    origin={source}
                    changes={receipt.changes}
                  />
                )}
              {i.publication &&
                ['rejected', 'stale', 'cancelled'].includes(i.publication.state) && (
                  <Message>
                    {i.publication.decision_reason ||
                      i.publication.stale_reason ||
                      '上次申请未发布。'}{' '}
                    请核对后重新提交。
                  </Message>
                )}
              <section
                className="space-y-4 rounded-2xl border border-[color:var(--line)] bg-page/50 p-5"
                aria-label="分发设置"
              >
                <h4 className="font-semibold">分发设置</h4>
                <PublicationPolicyFields
                  categoryHint={hint('category')}
                  value={value}
                  onChange={(next) => {
                    if (
                      next.category !== value.category ||
                      next.scenario_ids !== value.scenario_ids
                    )
                      edited.current.category = true;
                    setValue(next);
                  }}
                />
              </section>
              <section className="flex min-w-0 flex-col gap-4" aria-label="内容说明">
                <h4 className="font-semibold">内容说明</h4>
                <div
                  data-draft-field="keywords"
                  onInput={() => {
                    edited.current.keywords = true;
                  }}
                >
                  <KeywordField
                    value={appliesTo.keywords ?? []}
                    onChange={(keywords) => {
                      if (JSON.stringify(keywords) !== JSON.stringify(appliesTo.keywords ?? []))
                        edited.current.keywords = true;
                      setAppliesTo({ ...appliesTo, keywords });
                    }}
                  />
                  {hint('keywords')}
                </div>
                {i.version?.manifest.kind === 'skill' && (
                  <div tabIndex={-1} data-review-target="api-key">
                    <SkillApiKeyField
                      checked={requiresApiKey}
                      onChange={setRequiresApiKey}
                      disabled={busy}
                    />
                  </div>
                )}
                <div>
                  <label data-draft-field="purpose">
                    共享目的与授权确认
                    <textarea
                      value={purpose}
                      onChange={(e) => {
                        edited.current.purpose = true;
                        setPurpose(e.target.value);
                      }}
                      required
                      maxLength={2000}
                      placeholder="说明内容适用范围，并确认你有权将此快照共享给所选受众。"
                    />
                  </label>
                  {hint('purpose')}
                </div>
              </section>
            </form>
          ))}
      </div>
      {footerSlot ? createPortal(footer, footerSlot) : footer}
    </div>
  );
}
