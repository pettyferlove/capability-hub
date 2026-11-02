import type { ReactNode } from 'react';
import type { AiExecutionResponse, AiExecutionViewResponse } from '@capability-hub/contracts';
import { cn } from '../../shared/styles/cn.js';
import { AgentSignal, type BriefSignal } from '../ai/AgentSignal.js';
import { PhaseTrack } from '../ai/PhaseTrack.js';
import { businessPhase } from '../ai/activity.js';
import { liveAction, riskLabels, type BriefAction, type Glyph } from '../ai/agent-brief.js';
import { jsonObject, statusLabels, type Json } from '../ai/presentation.js';

type AuditStatus = AiExecutionResponse['status'];
type Signal = {
  signal: BriefSignal;
  label: string;
  caption: string;
  glyph?: Glyph;
  action?: BriefAction;
};

function auditSignal(
  status: AuditStatus,
  view: AiExecutionViewResponse | undefined,
  saving: boolean,
  report: Json | undefined,
): Signal {
  const phase = view && businessPhase(view).index;
  if (
    (status === 'queued' || status === 'running' || status === 'waiting_input') &&
    (saving || phase === 3)
  )
    return {
      signal: 'working',
      glyph: 'report',
      label: status === 'running' ? '记录结论' : '等待记录',
      caption: '你的选择已提交。',
    };
  switch (status) {
    case 'queued':
      return {
        signal: 'working',
        glyph: 'think',
        label: '已排队',
        caption: '等待开始审计，可继续填写审核意见。',
      };
    case 'running': {
      if (phase === 1)
        return {
          signal: 'working',
          glyph: 'report',
          label: '整理报告',
          caption: '正在汇总已读文件、行号依据和扫描发现。',
        };
      const action = view && liveAction(view);
      return {
        signal: 'working',
        glyph: action?.glyph ?? 'browse',
        label: '查阅证据',
        caption: action?.label ?? '正在核对版本内容。',
        action,
      };
    }
    case 'waiting_input':
      return {
        signal: 'waiting',
        label: '等待采纳',
        caption: report ? '请核对审计建议，再决定是否采纳。' : '正在读取供你确认的审计报告。',
      };
    case 'succeeded': {
      const { approved, assessment } = jsonObject(report);
      const { risk, summary } = jsonObject(assessment);
      return {
        signal: !report ? 'idle' : risk === 'low' ? 'complete' : 'caution',
        label: approved === true ? '已采纳' : approved === false ? '未采纳' : statusLabels[status],
        caption: typeof summary === 'string' && summary ? summary : '本次版本审计已结束。',
      };
    }
    case 'cancelled':
      return {
        signal: 'idle',
        label: statusLabels[status],
        caption: '本次审计已停止，可重新发起。',
      };
    case 'failed':
    case 'timed_out':
      return {
        signal: 'error',
        label: statusLabels[status],
        caption: '本次审计未完成，可继续人工审核。',
      };
  }
}

/** 阶段跟随本次执行的事件，风险只取自与候选内容匹配的报告。 */
export function ReviewAuditActivity({
  status,
  view,
  report,
  saving,
  emptyLabel,
  emptyHint,
  children,
}: {
  status?: AuditStatus;
  view?: AiExecutionViewResponse;
  report?: Json;
  saving: boolean;
  emptyLabel: string;
  emptyHint: string;
  children: ReactNode;
}) {
  const state: Signal = status
    ? auditSignal(status, view, saving, report)
    : { signal: 'idle', label: emptyLabel, caption: emptyHint };
  const { risk } = jsonObject(jsonObject(report).assessment);
  const tone = {
    working: 'from-brand-soft text-brand',
    waiting: 'from-warning-soft text-warning',
    complete: 'from-success-soft text-success',
    caution: risk === 'high' ? 'from-danger-soft text-danger' : 'from-warning-soft text-warning',
    error: 'from-danger-soft text-danger',
    idle: 'from-page text-muted-ink',
  }[state.signal];
  const action = state.action;
  return (
    <div className={cn('@container/audit bg-linear-to-r to-paper to-80% px-3.5 py-3', tone)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div aria-hidden="true" className="shrink-0">
          <AgentSignal
            large
            signal={state.signal}
            glyph={state.glyph}
            risk={typeof risk === 'string' ? risk : undefined}
            pulse={view?.activity.at(-1)?.seq}
          />
        </div>
        <div className="min-w-0 flex-[1_1_10rem]">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h4 className="text-body font-semibold leading-5 text-ink">版本资源审计</h4>
            <span
              role="status"
              aria-atomic="true"
              className="rounded-full bg-current/8 px-2 py-0.5 text-caption font-medium"
            >
              <span
                key={state.label}
                className="inline-block motion-safe:animate-[popover-in_200ms_var(--ease-out)_both]"
              >
                {state.label}
                {typeof risk === 'string' && ' · ' + (riskLabels[risk] ?? '证据有限')}
              </span>
            </span>
          </div>
          <div
            key={action?.key ?? state.label}
            className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 text-caption leading-5 motion-safe:animate-[audit-action-in_260ms_var(--ease-out)_both]"
          >
            {action && <action.Icon aria-hidden="true" size={13} className="shrink-0" />}
            <span
              title={state.caption}
              className={cn(
                'min-w-0 max-w-full text-muted-ink',
                action ? 'truncate' : 'line-clamp-2',
              )}
            >
              {state.caption}
            </span>
            {action?.detail && (
              <code
                title={action.detail}
                dir="rtl"
                className="min-w-0 max-w-full truncate text-left font-medium text-ink"
              >
                <bdi dir="ltr">{action.detail}</bdi>
              </code>
            )}
          </div>
        </div>
        {children}
      </div>
      {view && (
        <PhaseTrack
          view={view}
          labeled
          className="mt-3 border-t border-current/12 pt-2.5 @max-[18rem]/audit:gap-1 @max-[16rem]/audit:grid-cols-2"
        />
      )}
    </div>
  );
}
