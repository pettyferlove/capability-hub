import { feedbackStatusIcons } from '../../shared/components/select-icons.js';
import { assetCommunityStyles, communityHeadingStyles, communityActionsStyles } from './styles.js';
import {
  subtleStyles,
  btnStyles,
  btnPrimaryStyles,
  textBtnStyles,
  tagStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { feedbackKinds, feedbackStatuses } from '@capability-hub/contracts';
import type {
  AssetFeedbackListResponse,
  AssetFeedbackResponse,
} from '@capability-hub/contracts/http';
import { useRef, useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Plus, RefreshCw } from '../../shared/icons/lucide.js';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Empty } from '../../shared/components/Empty.js';
import { Message } from '../../shared/components/Message.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { loginHref } from '../../shared/navigation/history-route.js';
import { dateLabel } from '../../shared/format/labels.js';
import { useHub } from '../../shared/context/HubContext.js';
import { FeedbackForm } from './FeedbackForm.js';
import { FeedbackDetail } from './FeedbackDetail.js';

/**
 * 目录详情里的反馈区：列表态（10 条一页）、详情态与表单态互斥，靠 `?feedback=` 深链进入详情。
 * 未登录时不发请求，只提示登录；`revision` 本地自增用于重新拉取列表与详情。
 */
export function AssetFeedback({ assetId, versionId }: { assetId: string; versionId?: string }) {
  const { me, refresh } = useHub();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(() =>
    versionId ? (new URLSearchParams(window.location.search).get('feedback') ?? '') : '',
  );
  const [formOpen, setFormOpen] = useState(false);
  const [formStarted, setFormStarted] = useState(false);
  const [receipt, setReceipt] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus({ preventScroll: true });
  }, [selected, formOpen]);
  const reload = () => setRevision((value) => value + 1);
  const list = useQuery<AssetFeedbackListResponse>(
    me
      ? `/api/assets/${assetId}/feedback?page=${page}&limit=10${status ? '&status=' + status : ''}`
      : null,
    refresh + revision,
  );
  const detail = useQuery<AssetFeedbackResponse>(
    me && selected ? '/api/feedback/' + encodeURIComponent(selected) : null,
    refresh + revision,
  );
  return (
    <section className={cn(assetCommunityStyles, 'my-0')} aria-label="问题与建议">
      <div className={communityHeadingStyles}>
        <h3 ref={heading} tabIndex={-1}>
          {formOpen ? '提交问题或建议' : selected ? '反馈详情' : '问题与建议'}
        </h3>
        <p>
          {formOpen
            ? '描述你遇到的问题或期望的改进，维护者会在这里回复处理结果。'
            : '查看反馈进展，或向资产维护者提交问题和建议。仅提交者和维护者可见。'}
        </p>
      </div>
      {!me ? (
        <div className={subtleStyles}>
          <p>登录后可提交和查看反馈。</p>
          <a href={loginHref(window.location.pathname + window.location.search)}>登录后继续</a>
        </div>
      ) : (
        <>
          {formOpen || selected ? (
            <button
              className={textBtnStyles}
              type="button"
              onClick={() => {
                setFormOpen(false);
                setSelected('');
                setReceipt('');
              }}
            >
              <ArrowLeft size={15} />
              返回反馈列表{formOpen ? '（保留草稿）' : ''}
            </button>
          ) : (
            <div className={communityActionsStyles}>
              {versionId && (
                <button
                  className={cn(btnStyles, btnPrimaryStyles)}
                  type="button"
                  onClick={() => {
                    setFormStarted(true);
                    setFormOpen(true);
                    setReceipt('');
                  }}
                >
                  <Plus size={15} />
                  {formStarted ? '继续填写反馈' : '提交问题或建议'}
                </button>
              )}
              <button className={textBtnStyles} type="button" onClick={reload}>
                <RefreshCw size={14} />
                刷新
              </button>
            </div>
          )}
          {receipt && <Message>{receipt}</Message>}
          {formStarted && versionId && (
            <div hidden={!formOpen}>
              <FeedbackForm
                assetId={assetId}
                versionId={versionId}
                onSubmitted={(feedback) => {
                  setFormOpen(false);
                  setFormStarted(false);
                  setSelected(feedback.id);
                  setReceipt('反馈已提交，可在此查看后续处理结果。');
                  setPage(1);
                  setStatus('');
                  reload();
                }}
              />
            </div>
          )}
          {!formOpen &&
            (selected ? (
              detail.error ? (
                <ErrorState message={detail.error} retry={reload} />
              ) : !detail.data ? (
                <p role="status">正在加载详情…</p>
              ) : detail.data.asset_id !== assetId ? (
                <Message error>此反馈不属于当前资产，请返回列表重新选择。</Message>
              ) : (
                <FeedbackDetail key={detail.data.id} feedback={detail.data} onRefresh={reload} />
              )
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="w-44">
                    <SelectField
                      aria-label="筛选处理状态"
                      optionIcons={feedbackStatusIcons}
                      value={status}
                      onValueChange={(value) => {
                        setStatus(value);
                        setPage(1);
                      }}
                    >
                      <option value="">全部状态</option>
                      {Object.entries(feedbackStatuses).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  {list.data && <span className={subtleStyles}>{list.data.total} 条反馈</span>}
                </div>
                {list.error ? (
                  <ErrorState message={list.error} retry={reload} />
                ) : list.loading ? (
                  <p role="status">正在加载反馈…</p>
                ) : (
                  list.data && (
                    <>
                      {list.data.items.length ? (
                        <ul className="m-0 grid list-none gap-2 p-0">
                          {list.data.items.map((feedback) => (
                            <li key={feedback.id}>
                              <button
                                type="button"
                                className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 rounded-xl border border-separator bg-paper p-4 text-left hover:bg-page focus-visible:outline-brand"
                                onClick={() => {
                                  setSelected(feedback.id);
                                  setReceipt('');
                                }}
                              >
                                <strong className="min-w-0 [overflow-wrap:anywhere]">
                                  {feedback.title}
                                </strong>
                                <span
                                  className={cn(tagStyles, 'justify-self-end whitespace-nowrap')}
                                >
                                  {feedbackStatuses[feedback.status]}
                                </span>
                                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-ink">
                                  <span>
                                    {feedbackKinds[feedback.kind]} · {feedback.version_label}
                                  </span>
                                  {feedback.blocking && (
                                    <span className="text-warning">阻塞任务</span>
                                  )}
                                  <span>{dateLabel(feedback.created_at)}</span>
                                </span>
                                <ArrowRight
                                  aria-hidden="true"
                                  size={14}
                                  className="self-center justify-self-end text-muted-ink"
                                />
                                {feedback.resolution && (
                                  <span className="col-span-2 truncate text-caption text-muted-ink">
                                    处理说明 · {feedback.resolution}
                                  </span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <Empty title={status ? '暂无该状态的反馈' : '还没有问题或建议'}>
                          {status
                            ? '切换状态查看其他反馈。'
                            : '遇到问题或有改进想法，可以从上方提交。'}
                        </Empty>
                      )}
                      {list.data.total > 10 && (
                        <div className={communityActionsStyles}>
                          <button
                            className={btnStyles}
                            type="button"
                            disabled={page === 1}
                            onClick={() => setPage(page - 1)}
                          >
                            上一页
                          </button>
                          <span>
                            第 {page} 页 · 共 {list.data.total} 条
                          </span>
                          <button
                            className={btnStyles}
                            type="button"
                            disabled={page * 10 >= list.data.total}
                            onClick={() => setPage(page + 1)}
                          >
                            下一页
                          </button>
                        </div>
                      )}
                    </>
                  )
                )}
              </>
            ))}
        </>
      )}
    </section>
  );
}
