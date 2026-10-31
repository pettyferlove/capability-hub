import { feedbackStatusIcons } from '../../shared/components/select-icons.js';
import {
  assetCommunityStyles,
  communityHeadingStyles,
  feedbackListStyles,
  communityActionsStyles,
} from './styles.js';
import { subtleStyles, btnStyles, textBtnStyles } from '../../shared/styles/recipes.js';
import { feedbackStatuses } from '@capability-hub/contracts';
import type {
  AssetFeedbackListResponse,
  AssetFeedbackResponse,
} from '@capability-hub/contracts/http';
import { useState } from 'react';
import { useQuery } from '../../shared/api/use-query.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { loginHref } from '../../shared/navigation/history-route.js';
import { useHub } from '../../shared/context/HubContext.js';
import { FeedbackForm } from './FeedbackForm.js';
import { FeedbackDetail } from './FeedbackDetail.js';

export function AssetFeedback({ assetId, versionId }: { assetId: string; versionId?: string }) {
  const { me, refresh } = useHub();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(() =>
    versionId ? (new URLSearchParams(window.location.search).get('feedback') ?? '') : '',
  );
  const [formOpen, setFormOpen] = useState(false);
  const [receipt, setReceipt] = useState('');
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
    <section className={assetCommunityStyles} aria-label="问题与建议">
      <div className={communityHeadingStyles}>
        <h3>问题与建议</h3>
        <p>反馈具体版本的使用问题和业务需求。提交者可查看本人反馈，维护者可查看并处理。</p>
      </div>
      {!me ? (
        <div className={subtleStyles}>
          <p>登录后可提交和查看反馈。</p>
          <a href={loginHref(window.location.pathname + window.location.search)}>登录后继续</a>
        </div>
      ) : (
        <>
          {versionId && (
            <button
              className={btnStyles}
              type="button"
              aria-expanded={formOpen}
              onClick={() => setFormOpen(!formOpen)}
            >
              {formOpen ? '收起反馈表单' : '提交问题或建议'}
            </button>
          )}
          {formOpen && versionId && (
            <FeedbackForm
              assetId={assetId}
              versionId={versionId}
              onSubmitted={(feedback) => {
                setFormOpen(false);
                setSelected(feedback.id);
                setReceipt(feedback.id);
                setPage(1);
                setStatus('');
                reload();
              }}
            />
          )}
          {receipt && <Message>反馈已提交，编号：{receipt}</Message>}
          <label>
            筛选处理状态
            <SelectField
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
          </label>
          {list.error ? (
            <ErrorState message={list.error} retry={reload} />
          ) : list.loading ? (
            <p role="status">正在加载反馈…</p>
          ) : (
            list.data && (
              <>
                {list.data.items.length ? (
                  <ul className={feedbackListStyles}>
                    {list.data.items.map((feedback) => (
                      <li key={feedback.id}>
                        <button
                          type="button"
                          className={textBtnStyles}
                          onClick={() => setSelected(feedback.id)}
                          aria-pressed={selected === feedback.id}
                        >
                          {feedback.title} · {feedback.version_label} ·{' '}
                          {feedbackStatuses[feedback.status]}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={subtleStyles}>暂无符合条件的反馈</p>
                )}
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
              </>
            )
          )}
          {selected && (
            <div>
              <button className={textBtnStyles} type="button" onClick={() => setSelected('')}>
                收起反馈详情
              </button>
              {detail.error ? (
                <ErrorState message={detail.error} retry={reload} />
              ) : detail.loading ? (
                <p role="status">正在加载详情…</p>
              ) : (
                detail.data?.asset_id === assetId && (
                  <FeedbackDetail feedback={detail.data} onSaved={reload} />
                )
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
