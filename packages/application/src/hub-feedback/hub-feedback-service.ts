import { randomUUID } from 'node:crypto';
import { canonical, digest } from '@capability-hub/domain/canonical';
import { fail, HubError, notFound } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import { has } from '@capability-hub/domain/rbac';
import type {
  HubFeedbackEventRecord,
  HubFeedbackRecord,
  HubFeedbackStatus,
} from '@capability-hub/domain/models';
import type {
  HubFeedbackEventPage,
  HubFeedbackRecordQuery,
  HubFeedbackSecretScanner,
} from '../ports/index.js';
import type { ApplicationContext } from '../shared/application-context.js';
import type { IdempotencyService } from '../shared/idempotency-service.js';
import { matchRevision } from '../shared/revision.js';
import {
  checkHubFeedbackUploads,
  persistHubFeedbackUploads,
  scanHubFeedbackText,
  type HubFeedbackCheckedUpload,
} from './attachments.js';
import type {
  HubFeedbackAccess,
  HubFeedbackCreateCommand,
  HubFeedbackMutation,
  HubFeedbackRedactionCommand,
  HubFeedbackSubmission,
  HubFeedbackUpdateCommand,
  HubFeedbackUpload,
} from './commands.js';
import {
  presentHubFeedbackDetail,
  presentHubFeedbackItem,
  presentHubFeedbackReceipt,
} from './queries.js';

const transitions: Readonly<Record<HubFeedbackStatus, readonly HubFeedbackStatus[]>> = {
  pending: ['in_progress', 'needs_info', 'resolved', 'declined'],
  in_progress: ['needs_info', 'resolved', 'declined'],
  needs_info: ['resolved', 'declined'],
  resolved: ['in_progress'],
  declined: ['in_progress'],
};

type Event = Pick<HubFeedbackEventRecord, 'kind' | 'visibility'> &
  Partial<
    Pick<
      HubFeedbackEventRecord,
      'body' | 'status_from' | 'status_to' | 'decline_reason' | 'attachment_ids'
    >
  >;

function nextActivity(row: HubFeedbackRecord): string {
  return new Date(
    Math.max(
      Date.now(),
      Date.parse(row.last_activity_at) + 1,
      Date.parse(row.submitter_seen_at) + 1,
    ),
  ).toISOString();
}

function createHashMetadata(input: HubFeedbackCreateCommand) {
  const client = input.diagnostics?.client;
  if (!client || typeof client !== 'object' || !('device_pixel_ratio' in client)) return input;
  // 设备像素比可能是小数；幂等摘要用其十进制表示，原始数值仍保存在诊断里。
  return {
    ...input,
    diagnostics: { client: { ...client, device_pixel_ratio: String(client.device_pixel_ratio) } },
  };
}

/** 身份、修订和限额在业务事务内核对，幂等记录不保留可以被隐去的内容。 */
export class HubFeedbackService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly idempotency: IdempotencyService,
    private readonly scan: HubFeedbackSecretScanner,
  ) {}

  private async current(principal: Principal, access: HubFeedbackAccess) {
    const current = await this.context.identity.principal(principal.id);
    if (access === 'handler') this.context.identity.require(current, 'feedback:manage');
    return current;
  }

  private async visible(ref: string | number, principal: Principal, access: HubFeedbackAccess) {
    const row = await this.context.store.findHubFeedback(
      ref,
      access === 'submitter' ? principal.id : undefined,
    );
    if (!row) notFound();
    return row;
  }

  async list(principal: Principal, access: HubFeedbackAccess, query: HubFeedbackRecordQuery) {
    const current = await this.current(principal, access);
    const { items, total } = await this.context.store.listHubFeedback(
      access === 'submitter'
        ? { page: query.page, limit: query.limit, status: query.status, submittedBy: current.id }
        : { ...query, submittedBy: undefined },
    );
    return {
      items: await Promise.all(
        items.map((row) => presentHubFeedbackItem(this.context.store, row, access)),
      ),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async summary(principal: Principal, access: HubFeedbackAccess) {
    const current = await this.current(principal, access);
    return access === 'submitter'
      ? await this.context.store.summarizeHubFeedbackForSubmitter(current.id)
      : await this.context.store.summarizeHubFeedbackForHandler(current.id);
  }

  async detail(
    principal: Principal,
    access: HubFeedbackAccess,
    ref: string | number,
    view?: 'receipt' | HubFeedbackEventPage,
  ) {
    const { store } = this.context;
    return await store.tx(async () => {
      const current = await this.current(principal, access);
      const row = await this.visible(ref, current, access);
      return view === 'receipt'
        ? await presentHubFeedbackReceipt(store, row, access)
        : await presentHubFeedbackDetail(store, row, access, view);
    });
  }

  async create(
    principal: Principal,
    input: HubFeedbackCreateCommand,
    uploads: readonly HubFeedbackUpload[],
    submission: HubFeedbackSubmission,
    key: string | undefined,
    receipt = false,
  ) {
    const { store, blobs } = this.context;
    for (const field of ['title', 'description', 'steps', 'expected'] as const)
      scanHubFeedbackText(this.scan, input[field], { field });
    scanHubFeedbackText(this.scan, JSON.stringify(input.diagnostics), { field: 'diagnostics' });
    const files = checkHubFeedbackUploads(this.scan, uploads);
    return await this.command(
      'hub_feedback.create',
      key,
      digest(canonical({ metadata: createHashMetadata(input), files })),
      {
        authorize: async () => ({ actor: await this.current(principal, 'submitter') }),
        admit: async ({ actor }) => {
          const since = new Date(Date.now() - 3_600_000).toISOString();
          if ((await store.countRecentHubFeedback(actor.id, since)) >= 10)
            throw new HubError(
              429,
              'HUB_FEEDBACK_RATE_LIMIT',
              '每小时最多提交 10 条反馈，请稍后再试',
              {},
              true,
            );
        },
        upload: uploads.length ? () => persistHubFeedbackUploads(blobs, uploads, files) : undefined,
        write: async ({ actor }) => {
          const at = new Date().toISOString();
          const row = await store.insert('hub_feedback', {
            ...input,
            id: randomUUID(),
            number: await store.nextHubFeedbackNumber(),
            submitted_by: actor.id,
            channel: submission.channel,
            status: 'pending',
            decline_reason: null,
            duplicate_of_id: null,
            assignee_id: null,
            submission: { ...submission },
            description_redacted_at: null,
            created_at: at,
            updated_at: at,
            closed_at: null,
            last_activity_at: at,
            last_submitter_activity_at: at,
            last_handler_public_at: null,
            submitter_seen_at: at,
            revision: 1,
          });
          await this.attachments(row.id, actor.id, at, null, files);
          await store.audit(actor.id, 'hub_feedback.submitted', row.id, '', {
            channel: row.channel,
          });
          return row.id;
        },
        view: async (id: string, { actor }) => {
          const row = await this.visible(id, actor, 'submitter');
          return receipt
            ? await presentHubFeedbackReceipt(store, row, 'submitter', [null])
            : await presentHubFeedbackDetail(store, row, 'submitter');
        },
      },
    );
  }

  async comment(
    principal: Principal,
    access: HubFeedbackAccess,
    id: string,
    body: string,
    visibility: 'public' | 'internal',
    uploads: readonly HubFeedbackUpload[],
    mutation: HubFeedbackMutation,
  ) {
    const { store, blobs } = this.context;
    if (access === 'submitter') visibility = 'public';
    scanHubFeedbackText(this.scan, body, { field: 'body' });
    const files = checkHubFeedbackUploads(this.scan, uploads);
    return await this.mutate(
      principal,
      access,
      id,
      'hub_feedback.comment',
      { body, visibility, files },
      mutation,
      async (row, actor) => {
        const at = nextActivity(row);
        const eventId = randomUUID();
        const attachmentIds = await this.attachments(id, actor.id, at, eventId, files);
        await this.event(
          row,
          actor,
          access,
          at,
          { kind: 'comment', visibility, body, attachment_ids: attachmentIds },
          eventId,
        );
        const status =
          access === 'submitter' && row.status === 'needs_info'
            ? row.assignee_id === null
              ? 'pending'
              : 'in_progress'
            : row.status;
        if (status !== row.status) await this.statusEvent(row, actor, access, at, status, '');
        await store.put('hub_feedback', {
          ...row,
          status,
          updated_at: at,
          last_activity_at: visibility === 'public' ? at : row.last_activity_at,
          last_submitter_activity_at: access === 'submitter' ? at : row.last_submitter_activity_at,
          last_handler_public_at:
            access === 'handler' && visibility === 'public' ? at : row.last_handler_public_at,
          revision: row.revision + 1,
        });
        return eventId;
      },
      {
        upload: uploads.length ? () => persistHubFeedbackUploads(blobs, uploads, files) : undefined,
        admit: async (actor) => {
          const since = new Date(Date.now() - 3_600_000).toISOString();
          if ((await store.countRecentHubFeedbackComments(actor.id, since)) >= 60)
            throw new HubError(
              429,
              'HUB_FEEDBACK_RATE_LIMIT',
              '每小时最多发表 60 条留言，请稍后再试',
              {},
              true,
            );
          const { count, size } = await store.summarizeHubFeedbackAttachments(id);
          if (
            count + files.length > 20 ||
            size + files.reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024
          )
            fail(
              413,
              'HUB_FEEDBACK_ATTACHMENT_LIMIT',
              '每条反馈的附件最多 20 个，合计不得超过 40 MiB',
            );
        },
      },
    );
  }

  async update(
    principal: Principal,
    id: string,
    input: HubFeedbackUpdateCommand,
    mutation: HubFeedbackMutation,
  ) {
    const { store, identity } = this.context;
    if (input.message) scanHubFeedbackText(this.scan, input.message, { field: 'message' });
    return await this.mutate(
      principal,
      'handler',
      id,
      'hub_feedback.update',
      input,
      mutation,
      async (row, actor) => {
        let status = input.status;
        const assigned = input.assignee_id !== undefined && input.assignee_id !== row.assignee_id;
        if (input.assignee_id) {
          const user = await store.get('users', input.assignee_id);
          if (!user?.active || !has(await identity.principal(user.id), 'feedback:manage'))
            fail(422, 'VALIDATION_ERROR', '负责人必须持有平台反馈处理权限');
          if (!status && row.status === 'pending') status = 'in_progress';
        }
        if (status && !transitions[row.status].includes(status))
          fail(422, 'HUB_FEEDBACK_INVALID_TRANSITION', '不能切换到此状态');
        const closes = status === 'resolved' || status === 'declined';
        if ((closes || status === 'needs_info') && !input.message)
          fail(422, 'HUB_FEEDBACK_MESSAGE_REQUIRED', '请向提交者说明处理结果或需要补充的信息');
        if ((status === 'declined') !== (input.decline_reason !== undefined))
          fail(422, 'VALIDATION_ERROR', '仅在不采纳时填写不采纳原因');
        let duplicateId: string | null = null;
        if (input.decline_reason === 'duplicate' || input.duplicate_of !== undefined) {
          const target =
            input.duplicate_of === undefined
              ? undefined
              : await store.findHubFeedback(input.duplicate_of);
          if (input.decline_reason !== 'duplicate' || !target || target.id === row.id)
            fail(422, 'HUB_FEEDBACK_INVALID_DUPLICATE', '请选择另一条有效的反馈编号');
          duplicateId = target.id;
        }
        if (!status && !assigned) return;
        const at = nextActivity(row);
        if (assigned) {
          await this.event(row, actor, 'handler', at, {
            kind: 'assignment',
            visibility: 'internal',
          });
          await store.audit(actor.id, 'hub_feedback.assigned', id, '', {
            assignee_id: input.assignee_id ?? null,
          });
        }
        if (status)
          await this.statusEvent(
            row,
            actor,
            'handler',
            at,
            status,
            input.message ?? '',
            input.decline_reason,
          );
        else if (input.message) {
          const since = new Date(Date.now() - 3_600_000).toISOString();
          if ((await store.countRecentHubFeedbackComments(actor.id, since)) >= 60)
            throw new HubError(
              429,
              'HUB_FEEDBACK_RATE_LIMIT',
              '每小时最多发表 60 条留言，请稍后再试',
              {},
              true,
            );
          await this.event(row, actor, 'handler', at, {
            kind: 'comment',
            visibility: 'public',
            body: input.message,
          });
        }
        await store.put('hub_feedback', {
          ...row,
          status: status ?? row.status,
          closed_at: status ? (closes ? at : null) : row.closed_at,
          decline_reason: status ? (input.decline_reason ?? null) : row.decline_reason,
          duplicate_of_id: status ? duplicateId : row.duplicate_of_id,
          assignee_id: assigned ? (input.assignee_id ?? null) : row.assignee_id,
          updated_at: at,
          last_activity_at: at,
          last_handler_public_at: status || input.message ? at : row.last_handler_public_at,
          revision: row.revision + 1,
        });
      },
    );
  }

  async close(principal: Principal, id: string, mutation: HubFeedbackMutation) {
    const { store } = this.context;
    return await this.mutate(
      principal,
      'submitter',
      id,
      'hub_feedback.close',
      null,
      mutation,
      async (row, actor) => {
        if (row.closed_at !== null) fail(422, 'HUB_FEEDBACK_INVALID_TRANSITION', '反馈已结束');
        const at = nextActivity(row);
        await this.statusEvent(row, actor, 'submitter', at, 'resolved', '提交者确认已解决');
        await store.put('hub_feedback', {
          ...row,
          status: 'resolved',
          closed_at: at,
          updated_at: at,
          last_activity_at: at,
          last_submitter_activity_at: at,
          revision: row.revision + 1,
        });
      },
    );
  }

  async markRead(principal: Principal, id: string, mutation: HubFeedbackMutation) {
    return await this.mutate(
      principal,
      'submitter',
      id,
      'hub_feedback.read',
      null,
      mutation,
      async (row) => {
        if (row.last_handler_public_at && row.last_handler_public_at > row.submitter_seen_at)
          await this.context.store.put('hub_feedback', {
            ...row,
            submitter_seen_at: row.last_handler_public_at,
          });
      },
    );
  }

  async redact(
    principal: Principal,
    id: string,
    input: HubFeedbackRedactionCommand,
    mutation: HubFeedbackMutation,
  ) {
    const { store } = this.context;
    return await this.mutate(
      principal,
      'handler',
      id,
      'hub_feedback.redact',
      input,
      mutation,
      async (row, actor) => {
        const at = nextActivity(row);
        let visibility: HubFeedbackEventRecord['visibility'] = 'public';
        if (input.target === 'event') {
          const event = await store.get('hub_feedback_events', input.event_id);
          if (!event || event.feedback_id !== id) notFound();
          if (event.redacted_at || !event.body)
            fail(422, 'VALIDATION_ERROR', '该事件没有可隐去的内容');
          visibility = event.visibility;
          await store.put('hub_feedback_events', { ...event, body: '', redacted_at: at });
        } else {
          if (row.description_redacted_at) fail(422, 'VALIDATION_ERROR', '描述已隐去');
          row = { ...row, description: '', steps: '', expected: '', description_redacted_at: at };
        }
        await this.event(row, actor, 'handler', at, { kind: 'redaction', visibility });
        await store.put('hub_feedback', { ...row, updated_at: at, revision: row.revision + 1 });
        await store.audit(actor.id, 'hub_feedback.redacted', id, '', { target: input.target });
      },
    );
  }

  async removeAttachment(
    principal: Principal,
    access: HubFeedbackAccess,
    id: string,
    attachmentId: string,
    mutation: HubFeedbackMutation,
  ) {
    const { store } = this.context;
    return await this.mutate(
      principal,
      access,
      id,
      'hub_feedback.remove_attachment',
      attachmentId,
      mutation,
      async (row, actor) => {
        const file = await store.get('hub_feedback_attachments', attachmentId);
        if (
          !file?.sha256 ||
          file.feedback_id !== id ||
          (access === 'submitter' && file.uploaded_by !== actor.id)
        )
          notFound();
        if (access === 'submitter' && row.closed_at !== null)
          fail(403, 'FORBIDDEN', '反馈结束后不能移除附件');
        const at = nextActivity(row);
        const event = await store.get('hub_feedback_events', file.event_id);
        await store.put('hub_feedback_attachments', {
          ...file,
          sha256: null,
          removed_at: at,
          removed_by: actor.id,
          removal_reason: access,
        });
        await this.event(row, actor, access, at, {
          kind: 'attachment_removed',
          visibility: event?.visibility ?? 'public',
          attachment_ids: [file.id],
        });
        await store.put('hub_feedback', { ...row, updated_at: at, revision: row.revision + 1 });
        await store.audit(actor.id, 'hub_feedback.attachment_removed', id, '', {
          attachment_id: file.id,
          reason: access,
        });
      },
    );
  }

  async attachment(
    principal: Principal,
    access: HubFeedbackAccess,
    id: string,
    attachmentId: string,
  ) {
    const { store, blobs } = this.context;
    const current = await this.current(principal, access);
    await this.visible(id, current, access);
    const file = await store.get('hub_feedback_attachments', attachmentId);
    if (!file?.sha256 || file.feedback_id !== id) notFound();
    if (access === 'submitter' && file.event_id) {
      const event = await store.get('hub_feedback_events', file.event_id);
      if (!event || event.feedback_id !== id || event.visibility !== 'public') notFound();
    }
    return { name: file.name, mediaType: file.media_type, bytes: await blobs.read(file.sha256) };
  }

  /** 附件存储不占用数据库事务；上传期间准入条件或幂等记录可能已改变。 */
  private async command<State extends { actor: Principal }, Result, View>(
    route: string,
    key: string | undefined,
    hash: string,
    action: {
      authorize: () => Promise<State>;
      admit: (state: State) => Promise<void>;
      upload?: () => Promise<void>;
      write: (state: State) => Promise<Result>;
      view: (result: Result, state: State) => Promise<View>;
    },
  ) {
    const { store } = this.context;
    if (action.upload) {
      const replay = await store.tx(async () => {
        const state = await action.authorize();
        const existing = await this.idempotency.lookup<Result>(state.actor, route, key, hash);
        if (existing.hit) return { view: await action.view(existing.response, state) };
        await action.admit(state);
      });
      if (replay) return replay.view;
      await action.upload();
    }
    return await store.tx(async () => {
      const state = await action.authorize();
      const result = await this.idempotency.execute(state.actor, route, key, hash, async () => {
        await action.admit(state);
        return await action.write(state);
      });
      return await action.view(result, state);
    });
  }

  private async mutate(
    principal: Principal,
    access: HubFeedbackAccess,
    id: string,
    route: string,
    metadata: unknown,
    mutation: HubFeedbackMutation,
    write: (row: HubFeedbackRecord, actor: Principal) => Promise<string | void>,
    attachments?: { admit: (actor: Principal) => Promise<void>; upload?: () => Promise<void> },
  ) {
    const { store } = this.context;
    const hash = digest(canonical({ id, access, metadata }));
    return await this.command(route, mutation.key, hash, {
      authorize: async () => {
        const actor = await this.current(principal, access);
        const row = await this.visible(id, actor, access);
        if (!mutation.etag) matchRevision(row, mutation.etag);
        return { actor, row };
      },
      admit: async ({ actor, row }) => {
        matchRevision(row, mutation.etag);
        if (attachments) await attachments.admit(actor);
      },
      upload: attachments?.upload,
      write: async ({ actor, row }) => (await write(row, actor)) ?? null,
      view: async (eventId: string | null, { actor }) => {
        const current = await this.visible(id, actor, access);
        return mutation.receipt
          ? await presentHubFeedbackReceipt(store, current, access, eventId ? [eventId] : [])
          : await presentHubFeedbackDetail(store, current, access);
      },
    });
  }

  private async event(
    row: HubFeedbackRecord,
    actor: Principal,
    role: HubFeedbackAccess,
    at: string,
    event: Event,
    id = randomUUID(),
  ) {
    const { store } = this.context;
    await store.insert('hub_feedback_events', {
      id,
      feedback_id: row.id,
      sequence: await store.nextHubFeedbackEventSequence(row.id),
      actor_id: actor.id,
      actor_role: role,
      kind: event.kind,
      visibility: event.visibility,
      body: event.body ?? '',
      status_from: event.status_from ?? null,
      status_to: event.status_to ?? null,
      decline_reason: event.decline_reason ?? null,
      attachment_ids: event.attachment_ids ?? [],
      redacted_at: null,
      created_at: at,
    });
  }

  private async statusEvent(
    row: HubFeedbackRecord,
    actor: Principal,
    role: HubFeedbackAccess,
    at: string,
    status: HubFeedbackStatus,
    message: string,
    declineReason = null as HubFeedbackRecord['decline_reason'],
  ) {
    await this.event(row, actor, role, at, {
      kind: 'status',
      visibility: 'public',
      body: message,
      status_from: row.status,
      status_to: status,
      decline_reason: declineReason,
    });
    await this.context.store.audit(actor.id, 'hub_feedback.status_changed', row.id, '', {
      from: row.status,
      to: status,
      decline_reason: declineReason,
    });
  }

  private async attachments(
    id: string,
    actorId: string,
    at: string,
    eventId: string | null,
    files: readonly HubFeedbackCheckedUpload[],
  ) {
    const ids: string[] = [];
    for (const file of files) {
      const aid = randomUUID();
      await this.context.store.insert('hub_feedback_attachments', {
        ...file,
        id: aid,
        feedback_id: id,
        event_id: eventId,
        uploaded_by: actorId,
        created_at: at,
        removed_at: null,
        removed_by: null,
        removal_reason: null,
      });
      ids.push(aid);
    }
    return ids;
  }
}
