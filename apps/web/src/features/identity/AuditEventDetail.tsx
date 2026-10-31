import {
  auditActorAvatarStyles,
  auditResultStyles,
  tnumStyles,
  auditRowNoteStyles,
  auditActorStyles,
  auditSubjectStyles,
  auditDetailStyles,
  auditDetailHeadingStyles,
  auditDetailFactsStyles,
  auditDetailSectionStyles,
  auditChangesStyles,
  auditTechnicalStyles,
} from './styles.js';
import {
  tableCellStatusStyles,
  tableCellActionsStyles,
  textBtnStyles,
  sheetScrollStyles,
  tagStyles,
  btnStyles,
  subtleStyles,
} from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { auditCategories } from '@capability-hub/contracts';
import type { AuditEventResponse } from '@capability-hub/contracts/http';
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  UserRound,
} from '../../shared/icons/lucide.js';
import { CodeBlock } from '../../shared/components/CodeBlock.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { Message } from '../../shared/components/Message.js';
import { UserAvatar } from '../../shared/components/UserAvatar.js';

function ActorAvatar({ actor }: { actor: AuditEventResponse['actor'] }) {
  if (actor.kind === 'user')
    return <UserAvatar identity={actor.id} color={actor.avatar_color} size={32} />;
  return (
    <span className={cn(auditActorAvatarStyles, `group/${actor.kind}`)} aria-hidden="true">
      {actor.kind === 'system' ? (
        <Bot size={16} />
      ) : actor.kind === 'unknown' ? (
        <CircleHelp size={16} />
      ) : (
        <UserRound size={16} />
      )}
    </span>
  );
}

export function AuditResult({ result }: { result: AuditEventResponse['result'] }) {
  return (
    <span className={cn(auditResultStyles, `group/${result}`)}>
      {result === 'failure' ? <CircleAlert size={13} /> : <CheckCircle2 size={13} />}
      {result === 'failure' ? '失败' : '成功'}
    </span>
  );
}
export function auditTimestamp(value: string) {
  const date = new Date(value);
  return {
    date: date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    time: date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}
export function AuditEventRow({
  event,
  onOpen,
}: {
  event: AuditEventResponse;
  onOpen: (event: AuditEventResponse) => void;
}) {
  const timestamp = auditTimestamp(event.occurred_at);
  return (
    <tr>
      <td>
        <time dateTime={event.occurred_at}>
          <span>{timestamp.date}</span>
          <small className={tnumStyles}>{timestamp.time}</small>
        </time>
      </td>
      <td>
        <strong>{event.action_label}</strong>
        <small className={auditRowNoteStyles} title={event.reason}>
          {event.reason || auditCategories[event.category]}
        </small>
      </td>
      <td>
        <span className={auditActorStyles}>
          <ActorAvatar actor={event.actor} />
          <span>
            <strong>{event.actor.name}</strong>
            <small>
              {event.actor.username
                ? '@' + event.actor.username
                : event.actor.kind === 'system'
                  ? '自动或本机操作'
                  : '未验证用户身份'}
            </small>
          </span>
        </span>
      </td>
      <td>
        <span className={auditSubjectStyles}>
          {event.subject.href ? (
            <a
              href={event.subject.href}
              title={event.subject.request_id ? '查看申请记录' : '打开当前关联对象'}
            >
              {event.subject.name}
            </a>
          ) : (
            <strong>{event.subject.name}</strong>
          )}
          <small>{event.subject.detail}</small>
        </span>
      </td>
      <td className={tableCellStatusStyles}>
        <AuditResult result={event.result} />
      </td>
      <td className={tableCellActionsStyles}>
        <button
          type="button"
          className={textBtnStyles}
          aria-label={'查看' + event.action_label + '事件详情'}
          onClick={() => onOpen(event)}
        >
          详情
          <ArrowUpRight size={13} />
        </button>
      </td>
    </tr>
  );
}

export function AuditEventDetail({
  event,
  onClose,
}: {
  event: AuditEventResponse;
  onClose: () => void;
}) {
  const timestamp = auditTimestamp(event.occurred_at);
  const updated = event.action.endsWith('_updated');
  return (
    <>
      <DialogTitle title="审计事件详情" onClose={onClose} />
      <div className={cn(sheetScrollStyles, auditDetailStyles)}>
        <div className={auditDetailHeadingStyles}>
          <span className={tagStyles}>{auditCategories[event.category]}</span>
          <AuditResult result={event.result} />
          <h2>{event.action_label}</h2>
          <time dateTime={event.occurred_at}>
            {timestamp.date} {timestamp.time}
          </time>
        </div>
        <dl className={auditDetailFactsStyles}>
          <div>
            <dt>操作身份</dt>
            <dd>
              <span className={auditActorStyles}>
                <ActorAvatar actor={event.actor} />
                <span>
                  {event.actor.name}
                  {event.actor.username && <small>@{event.actor.username}</small>}
                </span>
              </span>
            </dd>
          </div>
          <div>
            <dt>关联对象</dt>
            <dd>
              {event.subject.name}
              <small>{event.subject.detail}</small>
            </dd>
          </div>
        </dl>
        {event.subject.href && (
          <a className={btnStyles} href={event.subject.href} onClick={onClose}>
            {event.subject.request_id ? '查看这次申请' : '查看当前关联对象'}
            <ArrowUpRight size={14} />
          </a>
        )}
        {event.reason && (
          <section className={auditDetailSectionStyles}>
            <h3>{event.result === 'failure' ? '失败原因' : '操作说明'}</h3>
            <p>{event.reason}</p>
          </section>
        )}
        {(updated || event.changes.length > 0) && (
          <section className={auditDetailSectionStyles}>
            <h3>字段变更</h3>
            {event.changes.length ? (
              <div className={auditChangesStyles}>
                <table aria-label="字段变更">
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>变更前</th>
                      <th>变更后</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.changes.map((change) => (
                      <tr key={change.label}>
                        <th scope="row">{change.label}</th>
                        <td>{change.before}</td>
                        <td>{change.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={subtleStyles}>
                这条事件没有记录字段级变更，无法从原始证据确认具体修改内容。
              </p>
            )}
          </section>
        )}
        {event.facts.length > 0 && (
          <dl className={auditDetailFactsStyles}>
            {event.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <details className={auditTechnicalStyles}>
          <summary>排查信息与原始标识</summary>
          <p className={subtleStyles}>
            {event.actor.name_source === 'event' && event.subject.name_source === 'event'
              ? '名称来自事件发生时的快照。'
              : '部分名称依据当前关联记录解析；事件时间和原始标识保持不变。'}
          </p>
          <CodeBlock
            title="事件标识 · 原始记录"
            code={JSON.stringify(
              {
                event_id: event.id,
                action: event.action,
                actor_id: event.actor.id,
                entity_id: event.subject.id,
                recorded_result: event.recorded_result,
                occurred_at_utc: event.occurred_at,
              },
              null,
              2,
            )}
          />
          {event.recorded_result !== event.result && (
            <Message>
              此事件明确记录了失败；原始结果字段为 {event.recorded_result}，原记录保持不变。
            </Message>
          )}
        </details>
      </div>
    </>
  );
}
