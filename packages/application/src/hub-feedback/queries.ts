import { userLoginProvider } from '@capability-hub/domain/identity';
import type { HubFeedbackAttachmentRecord, HubFeedbackRecord } from '@capability-hub/domain/models';
import type { HubFeedbackEventPage, RecordStore } from '../ports/index.js';
import type { HubFeedbackAccess } from './commands.js';

export async function presentHubFeedbackItem(
  store: RecordStore,
  row: HubFeedbackRecord,
  access: HubFeedbackAccess,
) {
  const submitter = access === 'handler' ? await store.get('users', row.submitted_by) : undefined;
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    surface: row.surface,
    area: row.area,
    channel: row.channel,
    title: row.title,
    blocking: row.blocking,
    status: row.status,
    created_at: row.created_at,
    last_activity_at: row.last_activity_at,
    revision: row.revision,
    unread:
      row.last_handler_public_at !== null && row.last_handler_public_at > row.submitter_seen_at,
    awaiting_reply:
      (row.closed_at === null || row.last_submitter_activity_at > row.closed_at) &&
      (row.last_handler_public_at === null ||
        row.last_handler_public_at < row.last_submitter_activity_at),
    ...(access === 'handler' && { assignee_id: row.assignee_id }),
    ...(submitter && {
      submitter: {
        id: submitter.id,
        display_name: submitter.display_name,
        auth_provider: userLoginProvider(submitter),
      },
    }),
  };
}

function presentAttachments(
  files: readonly HubFeedbackAttachmentRecord[],
  row: HubFeedbackRecord,
  self: boolean,
) {
  return files.map((file) => ({
    id: file.id,
    event_id: file.event_id,
    kind: file.kind,
    media_type: file.media_type,
    name: file.name,
    size: file.size,
    width: file.width,
    height: file.height,
    removed_at: file.removed_at,
    can_remove:
      file.sha256 !== null &&
      (!self || (row.closed_at === null && file.uploaded_by === row.submitted_by)),
  }));
}

/** 读修订无需加载历史正文，写回执只投影这次操作关联的可见附件。 */
export async function presentHubFeedbackReceipt(
  store: RecordStore,
  row: HubFeedbackRecord,
  access: HubFeedbackAccess,
  eventIds: readonly (string | null)[] = [],
) {
  const self = access === 'submitter';
  return {
    view: 'receipt' as const,
    id: row.id,
    number: row.number,
    status: row.status,
    revision: row.revision,
    unread:
      row.last_handler_public_at !== null && row.last_handler_public_at > row.submitter_seen_at,
    attachments: eventIds.length
      ? presentAttachments(
          await store.listHubFeedbackAttachments(row.id, self, eventIds),
          row,
          self,
        )
      : [],
  };
}

/** 第一页包含首帖附件；其余分页只返回可见事件所附的文件。 */
export async function presentHubFeedbackDetail(
  store: RecordStore,
  row: HubFeedbackRecord,
  access: HubFeedbackAccess,
  page?: HubFeedbackEventPage,
) {
  const self = access === 'submitter';
  const [item, events, duplicate] = await Promise.all([
    presentHubFeedbackItem(store, row, access),
    store.listHubFeedbackEvents(row.id, self, page && { ...page, limit: page.limit + 1 }),
    self ? undefined : store.get('hub_feedback', row.duplicate_of_id),
  ]);
  const more = page && events.length > page.limit;
  if (more) events.pop();
  const eventIds: (string | null)[] | undefined = page && events.map(({ id }) => id);
  if (page?.afterSequence === 0) eventIds?.push(null);
  const attachments = await store.listHubFeedbackAttachments(row.id, self, eventIds);
  const actors = new Map<string, string>();
  for (const event of events) {
    if (event.actor_id && !actors.has(event.actor_id)) {
      const actor = await store.get('users', event.actor_id);
      actors.set(event.actor_id, actor?.display_name ?? '账号不可用');
    }
  }
  return {
    ...item,
    ...(page && { next_after: more ? events[events.length - 1].sequence : null }),
    description: row.description,
    steps: row.steps,
    expected: row.expected,
    diagnostics: row.diagnostics,
    description_redacted_at: row.description_redacted_at,
    closed_at: row.closed_at,
    decline_reason: row.decline_reason,
    ...(!self && { duplicate_of: duplicate?.number ?? null, submission: row.submission }),
    events: events.map(({ actor_id, feedback_id: _feedback, ...event }) => ({
      ...event,
      actor_name: actor_id ? (actors.get(actor_id) ?? null) : null,
    })),
    attachments: presentAttachments(attachments, row, self),
  };
}
