/**
 * 审核申请详情：变更清单、来源授权、受众变化与扫描结论，并在同一视图里做出通过/退回决定。
 * 决定与撤回都提交到 `/api/publication-requests/:id/{decision,cancel}`，携带 `revision`。
 */
import { BusinessAgentPanel } from '../ai/BusinessAgentPanel.js';
import { VersionComparison } from '../../shared/components/VersionComparison.js';
import {
  reviewOverviewStyles,
  reviewAssetHeadingStyles,
  reviewAssetIconStyles,
  reviewAssetKickerStyles,
  reviewJumpDecisionStyles,
  reviewSummaryGridStyles,
  versionTransitionStyles,
  miniLabelStyles,
  expandedStyles,
  changeSummaryStyles,
  addedStyles,
  modifiedStyles,
  removedStyles,
  reviewInlineWarningStyles,
  reviewUsageStyles,
  reviewUsageHeadingStyles,
  reviewUsageDeclarationStyles,
  reviewUsageDescriptionStyles,
  reviewStageTabsStyles,
  nominationReviewSummaryStyles,
  reviewEvidencePanelsStyles,
  reviewRiskPanelStyles,
  reviewRiskHeadingStyles,
  reviewRiskStatusStyles,
  reviewRiskItemsStyles,
  reviewRiskItemStyles,
  riskLevelStyles,
  riskFileLinkStyles,
  scanInformationalStyles,
  reviewPolicyPanelStyles,
  policyFactsStyles,
  policyComparisonStyles,
  digestPanelStyles,
  reviewDecisionDockStyles,
  reviewDecisionSheetHeaderStyles,
  reviewDecisionPanelStyles,
  reviewDecisionSheetBodyStyles,
  decisionPanelHeadingStyles,
  decisionIconStyles,
  decisionWarningStyles,
  warningAcceptanceStyles,
  reviewAcknowledgementStyles,
  reviewCommentLabelStyles,
  decisionPanelFooterStyles,
  reviewViewOnlyStyles,
  reviewRecordStyles,
} from './styles.js';
import {
  btnStyles,
  tagStyles,
  tagTealStyles,
  selectedStyles,
  subtleStyles,
  btnPrimaryStyles,
  iconBtnStyles,
  checkLabelStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import type { ReviewResponse } from '@capability-hub/contracts/http';
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CornerUpLeft,
  FileCode2,
  GitCompareArrows,
  Info,
  LockKeyhole,
  ShieldCheck,
  X,
} from '../../shared/icons/lucide.js';
import { useState } from 'react';
import { ApiError, mutate } from '../../shared/api/client.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { Message } from '../../shared/components/Message.js';
import { Submit } from '../../shared/components/Submit.js';
import { useHub } from '../../shared/context/HubContext.js';
import { categoryLabel, dateLabel, stateLabel } from '../../shared/format/labels.js';
import { FileWorkbench } from './FileWorkbench.js';
import type { ChangeFile } from './types.js';
import { shortVersion } from './version-label.js';
import { audienceChange } from './audience-change.js';
import { ApiKeyBadge } from '../catalog/ApiKeyBadge.js';
/**
 * 通过是终态：必须勾选审查确认、为每条 `warning` 级发现填写接受理由，且扫描已 `passed`；
 * 退回必须填审核意见，否则只聚焦意见框而不发请求。受众被放宽（`expanded`）时会额外提示。
 * 版本冲突类错误只提示刷新重核，系统不自动重试。
 */
export function ReviewDetail({ request: r }: { request: ReviewResponse }) {
  const { reload, me } = useHub();
  const [comment, setComment] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false),
    [warnings, setWarnings] = useState<Record<string, string>>({}),
    [section, setSection] = useState('changes'),
    [decisionOpen, setDecisionOpen] = useState(false),
    [fileFocus, setFileFocus] = useState<{ path: string }>();
  const changed = r.diff.filter((f: ChangeFile) => f.status !== 'unchanged');
  const important = r.scan?.findings.filter((f) => f.severity !== 'info') ?? [];
  const infos = r.scan?.findings.filter((f) => f.severity === 'info') ?? [];
  const change = r.current
    ? audienceChange(r.current.release.distribution.audience, r.distribution.audience)
    : 'initial';
  const widened = change === 'expanded';
  const warningMissing = important.some((f) => f.severity === 'warning' && !warnings[f.id]?.trim());
  async function withdrawNomination() {
    setBusy(true);
    setError('');
    try {
      await mutate(
        `/api/publication-requests/${r.id}/cancel`,
        {
          reason: '提名者主动撤回通用提名',
        },
        'POST',
        r.revision,
      );
      reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : '撤回失败，请刷新后重试');
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: string) {
    if (decision === 'reject' && !comment.trim()) {
      setError('请在审核意见中说明需要修改的问题');
      document.getElementById('review-comment')?.focus();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await mutate(
        `/api/publication-requests/${r.id}/decision`,
        {
          decision,
          comment,
          policy_digest: r.policy_digest,
          accepted_warnings: Object.entries(warnings)
            .filter(([, reason]) => reason.trim())
            .map(([finding_id, reason]) => ({ finding_id, reason })),
        },
        'POST',
        r.revision,
      );
      reload();
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : '操作失败') +
          ([
            'REVISION_CONFLICT',
            'REVIEW_STALE',
            'REVIEW_RESOLVED',
            'AUTH_CONTEXT_CHANGED',
          ].includes(e instanceof ApiError ? e.code : '')
            ? '。请刷新队列后重新核对，系统未自动重试。'
            : ''),
      );
    } finally {
      setBusy(false);
    }
  }
  const stats = {
    added: r.diff.filter((f: ChangeFile) => f.status === 'added').length,
    modified: r.diff.filter((f: ChangeFile) => f.status === 'modified').length,
    removed: r.diff.filter((f: ChangeFile) => f.status === 'removed').length,
  };
  return (
    <>
      <section className={reviewOverviewStyles}>
        <div className={reviewAssetHeadingStyles}>
          <span className={reviewAssetIconStyles}>
            {r.asset.kind === 'skill' ? <FileCode2 size={23} /> : <Archive size={23} />}
          </span>
          <div>
            <div className={reviewAssetKickerStyles}>
              <span>
                {r.nomination
                  ? '通用提名'
                  : !r.current
                    ? '首次发布'
                    : r.current.content_digest === r.candidate.content_digest
                      ? '分发与发布信息调整'
                      : '内容版本更新'}
              </span>
              <span>·</span>
              <span>{r.submitter} 提交</span>
            </div>
            <h2>{r.asset.slug}</h2>
          </div>
          {r.can_decide && (
            <button
              className={cn(btnStyles, reviewJumpDecisionStyles)}
              onClick={() => setDecisionOpen(true)}
            >
              <CheckCheck size={14} />
              审核决定
            </button>
          )}
          <span className={cn(tagStyles, r.state === 'approved' ? tagTealStyles : '')}>
            {stateLabel(r.state)}
          </span>
        </div>
        <VersionComparison
          kind={r.asset.kind}
          previous={
            r.current
              ? {
                  version_label: r.current.version_label ?? '历史版本',
                  content_digest: r.current.content_digest ?? '',
                }
              : null
          }
          candidate={r.candidate}
          previousLabel="提交时发布"
          candidateLabel="申请发布"
        />
        <div className={reviewSummaryGridStyles}>
          <div>
            <span>内容版本</span>
            <strong className={versionTransitionStyles}>
              {r.current && (
                <>
                  <code title={r.current.version_label}>
                    {shortVersion(r.current.version_label ?? '历史版本')}
                  </code>
                  <ArrowRight size={13} />
                </>
              )}
              <code title={r.candidate.version_label}>
                {shortVersion(r.candidate.version_label)}
              </code>
            </strong>
          </div>
          <div>
            <span>分发受众</span>
            <strong>
              {r.visibility_label}
              <span className={cn(miniLabelStyles, widened ? expandedStyles : '')}>
                {
                  {
                    initial: '首次共享',
                    unchanged: '受众不变',
                    expanded: '范围扩大',
                    narrowed: '范围收窄',
                    changed: '受众调整',
                  }[change]
                }
              </span>
            </strong>
          </div>
          <div>
            <span>本次变更</span>
            <strong>
              {changed.length} 个文件{' '}
              <span className={changeSummaryStyles}>
                <i className={addedStyles}>+{stats.added}</i>
                <i className={modifiedStyles}>~{stats.modified}</i>
                <i className={removedStyles}>−{stats.removed}</i>
              </span>
            </strong>
          </div>
        </div>
        {widened && (
          <div className={reviewInlineWarningStyles}>
            <AlertTriangle size={15} />
            <span>本次扩大分发范围。即使文件未变，仍需确认来源授权和目标受众。</span>
          </div>
        )}
        {r.asset.kind === 'skill' && (
          <section className={reviewUsageStyles} aria-label="认证与使用要求">
            <div className={reviewUsageHeadingStyles}>
              <div className={reviewUsageDeclarationStyles}>
                <h3>认证与使用要求</h3>
                <span className={reviewUsageDescriptionStyles}>提交者声明：</span>
                {r.requires_api_key ? (
                  <ApiKeyBadge />
                ) : (
                  <span className={reviewUsageDescriptionStyles}>未声明需要 API Key</span>
                )}
              </div>
              <button
                type="button"
                className={cn(textBtnStyles, 'shrink-0')}
                aria-label="定位到 SKILL.md 文件预览"
                onClick={() => {
                  setSection('changes');
                  setFileFocus({ path: 'SKILL.md' });
                }}
              >
                定位到 SKILL.md
                <ArrowRight size={14} />
              </button>
            </div>
            {r.current && (
              <p className={reviewUsageDescriptionStyles}>
                上次发布声明：
                {r.current.release.requires_api_key ? '需 API Key' : '未声明需要 API Key'}
              </p>
            )}
            <p className={reviewUsageDescriptionStyles}>
              请核对 SKILL.md 及引用文件中的认证方式、配置步骤和凭据用途。 未声明 API Key
              需求不代表没有登录、OAuth 等独立认证流程；静态扫描不验证认证是否可用。
            </p>
          </section>
        )}
        <div
          className={reviewStageTabsStyles}
          role="tablist"
          aria-label="审核内容"
          onKeyDown={(event) => {
            const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
            if (!keys.includes(event.key)) return;
            event.preventDefault();
            const next =
              event.key === 'Home'
                ? 'changes'
                : event.key === 'End'
                  ? 'policy'
                  : section === 'changes'
                    ? 'policy'
                    : 'changes';
            setSection(next);
            event.currentTarget
              .querySelectorAll<HTMLButtonElement>('[role=tab]')
              ?.[next === 'changes' ? 0 : 1]?.focus();
          }}
        >
          <button
            role="tab"
            id="review-tab-changes"
            aria-controls="review-panel-changes"
            tabIndex={section === 'changes' ? 0 : -1}
            aria-selected={section === 'changes'}
            className={section === 'changes' ? selectedStyles : ''}
            onClick={() => setSection('changes')}
          >
            <GitCompareArrows size={15} />
            变更审查<span>{r.diff.length}</span>
          </button>
          <button
            role="tab"
            id="review-tab-policy"
            aria-controls="review-panel-policy"
            tabIndex={section === 'policy' ? 0 : -1}
            aria-selected={section === 'policy'}
            className={section === 'policy' ? selectedStyles : ''}
            onClick={() => setSection('policy')}
          >
            <LockKeyhole size={15} />
            发布信息与授权
          </button>
        </div>
      </section>
      <BusinessAgentPanel versionId={r.version_id} title={r.asset.slug} />
      {r.nomination && (
        <section className={nominationReviewSummaryStyles}>
          <h3>通用提名理由</h3>
          <p>{r.nomination.reason}</p>
          <span className={subtleStyles}>
            本次仅申请归入通用分类，内容版本和可见范围沿用当前发布。提名者与来源共享者均不能自审。
          </span>
        </section>
      )}
      {section === 'changes' ? (
        <div
          className={reviewEvidencePanelsStyles}
          role="tabpanel"
          id="review-panel-changes"
          aria-labelledby="review-tab-changes"
        >
          <section className={reviewRiskPanelStyles}>
            <div className={reviewRiskHeadingStyles}>
              <span className={reviewRiskStatusStyles}>
                <ShieldCheck size={17} />
                {r.scan?.state === 'passed' ? '静态检查无阻断项' : '静态检查未通过'}
              </span>
              <span>
                {important.length ? important.length + ' 项需注意' : '检查完成'} ·{' '}
                {r.scan?.ruleset_version}
              </span>
            </div>
            {important.length > 0 && (
              <div className={reviewRiskItemsStyles}>
                {important.map((f) => (
                  <div className={cn(reviewRiskItemStyles, `group/${f.severity}`)} key={f.id}>
                    <span className={riskLevelStyles}>
                      {f.severity === 'block' ? '阻断' : '需确认'}
                    </span>
                    <div>
                      <strong>
                        {f.rule_id === 'ARCHIVE_RESOURCE'
                          ? '包含未展开的归档资源'
                          : f.rule_id === 'DOWNLOAD_EXECUTE'
                            ? '存在远程下载后执行语句'
                            : f.rule_id}
                      </strong>
                      <button
                        className={riskFileLinkStyles}
                        title="在下方预览相关文件"
                        onClick={() => {
                          setFileFocus({ path: f.file });
                        }}
                      >
                        <code>
                          {f.file}:{f.line}
                        </code>
                        <ArrowUpRight size={13} />
                      </button>
                      <p>{f.evidence_summary}</p>
                      {r.accepted_warnings?.find((w) => w.finding_id === f.id) && (
                        <small>
                          已接受：
                          {r.accepted_warnings.find((w) => w.finding_id === f.id)?.reason}
                        </small>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <FileWorkbench request={r} focus={fileFocus} />
          {infos.length > 0 && (
            <details className={scanInformationalStyles}>
              <summary>
                <Info size={14} />
                {infos.length} 项脚本与打包说明
                <ChevronDown size={13} />
              </summary>
              <div>
                {infos.map((f) => (
                  <p key={f.id}>
                    <code>{f.file}</code>
                    <span>{f.evidence_summary}</span>
                  </p>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : (
        <section
          className={reviewPolicyPanelStyles}
          role="tabpanel"
          id="review-panel-policy"
          aria-labelledby="review-tab-policy"
        >
          <h3>本次共享目的</h3>
          <p>{r.source_consent.purpose}</p>
          <div className={policyFactsStyles}>
            <span>
              目标分类<strong>{categoryLabel(r.category)}</strong>
            </span>
            <span>
              获批受众<strong>{r.visibility_label}</strong>
            </span>
            <span>
              授权确认时间<strong>{dateLabel(r.source_consent.confirmed_at)}</strong>
            </span>
            <span>
              服务端权限依据<strong>{r.source_consent.permission_basis}</strong>
            </span>
          </div>
          <div className={policyComparisonStyles}>
            <span>当前分发</span>
            <strong>
              {r.current
                ? r.current.visibility_label + ' · ' + categoryLabel(r.current.release.category)
                : '尚无已发布版本'}
            </strong>
            <ArrowRight size={14} />
            <span>本次申请</span>
            <strong>
              {r.visibility_label} · {categoryLabel(r.category)}
            </strong>
          </div>
          <div className={policyComparisonStyles}>
            <span>当前关键词</span>
            <strong>{r.current?.release.applies_to.keywords?.join('、') || '未设置'}</strong>
            <ArrowRight size={14} />
            <span>本次关键词</span>
            <strong>{r.applies_to.keywords?.join('、') || '未设置'}</strong>
          </div>
          <div className={digestPanelStyles}>
            <span>内容摘要</span>
            <code>{r.content_digest}</code>
            <span>审批策略摘要</span>
            <code>{r.policy_digest}</code>
          </div>
          <p className={subtleStyles}>
            授权与内容一起冻结在本次申请中。审核期间发生变化，服务器会拒绝旧决定。
          </p>
        </section>
      )}
      {r.state === 'pending' ? (
        r.can_decide ? (
          <>
            <div className={reviewDecisionDockStyles}>
              <div>
                <ShieldCheck size={18} />
                <span>
                  <strong>完成本次审查后，记录决定</strong>
                  <small>
                    {important.filter((f) => f.severity === 'warning').length
                      ? '有风险提示需要说明接受理由'
                      : '核对内容与分发受众后即可处理'}
                  </small>
                </span>
              </div>
              <button
                className={cn(btnStyles, btnPrimaryStyles)}
                onClick={() => setDecisionOpen(true)}
              >
                <CheckCheck size={15} />
                审核决定
              </button>
            </div>
            <Overlay
              open={decisionOpen}
              onClose={() => {
                if (!busy) setDecisionOpen(false);
              }}
              label="记录审核决定"
              variant="sheet"
            >
              <div className={reviewDecisionSheetHeaderStyles}>
                <span>
                  <CheckCheck size={18} />
                  记录审核决定
                </span>
                <button
                  aria-label="关闭审核决定"
                  className={iconBtnStyles}
                  disabled={busy}
                  onClick={() => setDecisionOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <section
                id="review-decision"
                className={cn(reviewDecisionPanelStyles, reviewDecisionSheetBodyStyles)}
              >
                <div className={decisionPanelHeadingStyles}>
                  <span className={decisionIconStyles}>
                    <CheckCheck size={18} />
                  </span>
                  <div>
                    <h3>{r.asset.slug}</h3>
                    <p>
                      {r.candidate.version_label} · {r.visibility_label} · {changed.length}{' '}
                      个文件变化
                    </p>
                  </div>
                </div>
                {important
                  .filter((f) => f.severity === 'warning')
                  .map((f) => (
                    <div key={f.id} className={decisionWarningStyles}>
                      <span className={riskLevelStyles}>风险确认</span>
                      <code>{f.file}</code>
                      <p>{f.evidence_summary}</p>
                      <label className={warningAcceptanceStyles}>
                        接受此项的理由
                        <textarea
                          aria-label={'接受告警 ' + f.file}
                          value={warnings[f.id] ?? ''}
                          onChange={(e) => setWarnings((v) => ({ ...v, [f.id]: e.target.value }))}
                          maxLength={2000}
                          placeholder="核对来源和用途后，记录接受理由；若无法接受，请退回修改。"
                        />
                      </label>
                    </div>
                  ))}
                <label className={cn(checkLabelStyles, reviewAcknowledgementStyles)}>
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                  />
                  <span>
                    {r.asset.kind === 'skill'
                      ? '我已核对变更摘要、相关内容、认证与使用要求及分发受众，并完成本次审查。'
                      : '我已核对变更摘要、相关内容与分发受众，并完成本次审查。'}
                  </span>
                </label>
                <label className={reviewCommentLabelStyles} htmlFor="review-comment">
                  审核意见 <small>退回必填</small>
                </label>
                <textarea
                  id="review-comment"
                  aria-label="审核意见"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={4000}
                  placeholder="记录你的判断；如需退回，请说明具体问题和修改建议。"
                />
                {error && <Message error>{error}</Message>}
                <div className={decisionPanelFooterStyles}>
                  <span>
                    {warningMissing
                      ? '还有告警需要填写接受理由'
                      : !accepted
                        ? '完成审查后勾选确认，即可通过'
                        : '通过后生成不可变发布记录'}
                  </span>
                  <div>
                    <button className={btnStyles} disabled={busy} onClick={() => decide('reject')}>
                      <CornerUpLeft size={15} />
                      退回修改
                    </button>
                    <Submit
                      busy={busy}
                      disabled={!accepted || warningMissing || r.scan?.state !== 'passed'}
                      onClick={() => decide('approve')}
                    >
                      <Check size={16} />
                      通过并发布
                    </Submit>
                  </div>
                </div>
              </section>
            </Overlay>
          </>
        ) : (
          <div className={reviewViewOnlyStyles}>
            <LockKeyhole size={17} />
            <div>
              <strong>
                {r.submitted_by === me?.id || (r.nomination && r.source_consent.actor_id === me?.id)
                  ? '等待另一位审核者'
                  : '当前申请仅可查看'}
              </strong>
              <p>
                {r.submitted_by === me?.id || (r.nomination && r.source_consent.actor_id === me?.id)
                  ? '这是你的提交，平台要求独立人工审核。'
                  : r.context_valid === false
                    ? '内容、来源或策略上下文已变化，请刷新并重新提交申请。'
                    : '当前账号的审核权限不覆盖此申请。'}
              </p>
              {r.nomination && r.submitted_by === me?.id && (
                <button
                  type="button"
                  className={textBtnStyles}
                  disabled={busy}
                  onClick={withdrawNomination}
                >
                  撤回提名
                </button>
              )}
              {error && <Message error>{error}</Message>}
            </div>
          </div>
        )
      ) : (
        <section className={reviewRecordStyles}>
          <CheckCheck size={18} />
          <div>
            <strong>此申请{stateLabel(r.state)}</strong>
            <p>{r.decision_reason || '本次审核记录已保留。'}</p>
          </div>
        </section>
      )}
    </>
  );
}
