import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { HubFeedbackAttachmentResponse } from '@capability-hub/contracts/http';
import { createApp } from '@capability-hub/server';
import type { Agent, Test } from 'supertest';
import { createTestHub } from '../support/application.js';
import { httpClient, signIn } from '../support/http.js';

const self = '/api/hub-feedback';
const queue = '/api/admin/hub-feedback';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHf0AAAAASUVORK5CYII=',
  'base64',
);
const screenshot = { name: 'capture.png', kind: 'screenshot', bytes: png };
const metadata = {
  kind: 'bug',
  surface: 'web',
  area: 'review',
  title: 'Review drawer hangs',
  description: 'The review drawer keeps loading after submit.',
  steps: '',
  expected: '',
  blocking: false,
};

type Upload = { name: string; kind: string; bytes: Buffer };

function multipart(request: Test, fields: Record<string, unknown>, files: readonly Upload[] = []) {
  request.field(
    'metadata',
    JSON.stringify({
      ...fields,
      ...(files.length > 0 && {
        files: files.map(({ name, kind }, part) => ({ part, name, kind })),
      }),
    }),
  );
  for (const { name, bytes } of files) {
    request.attach('files', bytes, { filename: name, contentType: 'application/octet-stream' });
  }
  return request;
}

function create(
  client: Agent,
  fields: Record<string, unknown> = {},
  files: readonly Upload[] = [],
  key: string = randomUUID(),
) {
  return multipart(
    client.post(self).set('Idempotency-Key', key),
    { ...metadata, ...fields },
    files,
  );
}

function revise(request: Test, etag: string, key: string = randomUUID()) {
  return request.set('If-Match', etag).set('Idempotency-Key', key);
}

async function expectError(request: Test, status: number, code: string) {
  const response = await request.expect(status);
  assert.equal(response.body.error.code, code);
  return response;
}

test('平台反馈自助读取只限本人，内部备注和附件仅处理人员可见', async (context) => {
  const fixture = await createTestHub(context);
  const [submitter, handler, other] = await Promise.all([
    signIn(fixture, 'reader'),
    signIn(fixture),
    signIn(fixture, 'reviewer'),
  ]);
  const feedback = await create(submitter, {}, [screenshot]).expect(201);
  const { id, number } = feedback.body;
  const selfDetail = `${self}/${id}`;
  const adminDetail = `${queue}/${id}`;
  const publicFile = `/attachments/${feedback.body.attachments[0].id}`;
  const note = 'Only visible to feedback handlers';
  const noted = await multipart(
    revise(handler.post(`${adminDetail}/comments`), feedback.headers.etag),
    { body: note, visibility: 'internal' },
    [{ name: 'internal.log', kind: 'text', bytes: Buffer.from('Internal reproduction notes') }],
  ).expect(200);
  const notedFiles: HubFeedbackAttachmentResponse[] = noted.body.attachments;
  const internal = notedFiles.find(({ name }) => name === 'internal.log');
  assert(internal);
  const internalFile = `/attachments/${internal.id}`;
  assert.equal(noted.body.events[0].body, note);
  const processed = await handler.get(`${queue}/${number}`).expect(200);
  assert.equal(processed.body.id, id);
  assert(processed.body.submission);
  await handler.get(`${adminDetail}${internalFile}`).expect(200);

  const detail = await submitter.get(`${self}/${number}`).expect(200);
  assert.equal(detail.body.id, id);
  assert.deepEqual(detail.body.events, []);
  assert.equal(detail.body.attachments.length, 1);
  assert.equal(detail.body.attachments[0].name, 'capture.png');
  assert.equal('submission' in detail.body, false);
  for (const client of [handler, other]) {
    for (const path of [selfDetail, `${self}/${number}`, `${selfDetail}${publicFile}`]) {
      await expectError(client.get(path), 404, 'NOT_FOUND');
    }
  }
  await expectError(submitter.get(`${selfDetail}${internalFile}`), 404, 'NOT_FOUND');
  await expectError(other.get(adminDetail), 403, 'FORBIDDEN');

  const handlerOwn = await create(handler, {
    title: 'A handler can also submit feedback',
  }).expect(201);
  await expectError(handler.get(`${self}/${handlerOwn.body.id}${publicFile}`), 404, 'NOT_FOUND');
  await expectError(handler.get(`${queue}/${handlerOwn.body.id}${publicFile}`), 404, 'NOT_FOUND');
  const handlerList = await handler.get(self).expect(200);
  assert.deepEqual(
    handlerList.body.items.map((item: { id: string }) => item.id),
    [handlerOwn.body.id],
  );
  const token = await fixture.hub.tokens.issue(fixture.admin, { name: 'Feedback scope test' });
  const bearer = httpClient(fixture).set('Authorization', `Bearer ${token.token}`);
  const bearerList = await bearer.get(self).expect(200);
  assert.deepEqual(
    bearerList.body.items.map((item: { id: string }) => item.id),
    [handlerOwn.body.id],
  );
  await expectError(bearer.get(adminDetail), 403, 'TOKEN_SCOPE');
});

test('补充按负责人恢复状态，已关闭反馈的未回复留言不使其重开', async (context) => {
  const fixture = await createTestHub(context);
  const [submitter, handler] = await Promise.all([signIn(fixture, 'reader'), signIn(fixture)]);
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const created = await create(submitter).expect(201);
  const selfDetail = `${self}/${created.body.id}`;
  const adminDetail = `${queue}/${created.body.id}`;
  const change = (etag: string, body: Record<string, unknown>) =>
    revise(handler.patch(adminDetail), etag).send(body);
  const reply = (etag: string, body: string) =>
    multipart(revise(submitter.post(`${selfDetail}/comments`), etag), { body });

  await expectError(
    change(created.headers.etag, { status: 'needs_info' }),
    422,
    'HUB_FEEDBACK_MESSAGE_REQUIRED',
  );
  const message = 'Which browser is affected?';
  context.mock.timers.tick(1);
  const needsInfo = await change(created.headers.etag, {
    status: 'needs_info',
    message,
  }).expect(200);
  assert.equal(needsInfo.body.status, 'needs_info');
  const thread = await submitter.get(selfDetail).expect(200);
  assert.equal(thread.body.events[0].body, message);
  assert.equal(thread.body.events[0].actor_name, '维护者');

  context.mock.timers.tick(1);
  const pending = await reply(needsInfo.headers.etag, 'It happens on Firefox.').expect(200);
  assert.equal(pending.body.status, 'pending');
  context.mock.timers.tick(1);
  const assigned = await change(pending.headers.etag, {
    status: 'needs_info',
    assignee_id: fixture.admin.id,
    message: 'Which Firefox version?',
  }).expect(200);
  assert.equal(assigned.body.assignee_id, fixture.admin.id);
  context.mock.timers.tick(1);
  const working = await reply(assigned.headers.etag, 'Firefox 140').expect(200);
  assert.equal(working.body.status, 'in_progress');

  context.mock.timers.tick(1);
  const closed = await revise(submitter.post(`${selfDetail}/close`), working.headers.etag).expect(
    200,
  );
  assert.equal(closed.body.status, 'resolved');
  const beforeReply = await handler.get(`${queue}/summary`).expect(200);
  assert.equal(beforeReply.body.awaiting_reply, 0);
  await expectError(
    change(closed.headers.etag, { status: 'pending' }),
    422,
    'HUB_FEEDBACK_INVALID_TRANSITION',
  );

  context.mock.timers.tick(1);
  const followUp = await reply(closed.headers.etag, 'The issue returned after reload.').expect(200);
  assert.equal(followUp.body.status, 'resolved');
  assert.equal(followUp.body.closed_at, closed.body.closed_at);
  const summary = await handler.get(`${queue}/summary`).expect(200);
  assert.equal(summary.body.awaiting_reply, 1);
  const defaultQueue = await handler.get(queue).expect(200);
  assert.equal(defaultQueue.body.total, 0);
  const awaiting = await handler.get(queue).query({ status: 'resolved', awaiting: 1 }).expect(200);
  assert.equal(awaiting.body.items[0].id, created.body.id);
  context.mock.timers.tick(1);
  const answered = await multipart(
    revise(handler.post(`${adminDetail}/comments`), followUp.headers.etag),
    { visibility: 'public', body: 'We can reproduce this on reload.' },
  ).expect(200);
  assert.equal(answered.body.status, 'resolved');
  const afterReply = await handler.get(`${queue}/summary`).expect(200);
  assert.equal(afterReply.body.awaiting_reply, 0);
  const reopened = await change(answered.headers.etag, { status: 'in_progress' }).expect(200);
  assert.equal(reopened.body.status, 'in_progress');
  assert.equal(reopened.body.closed_at, null);
});

test('重复反馈校验目标，且不会向提交者暴露他人反馈的编号或 ID', async (context) => {
  const fixture = await createTestHub(context);
  const [submitter, handler] = await Promise.all([signIn(fixture, 'reader'), signIn(fixture)]);
  const target = await create(handler, { title: 'Private duplicate target' }).expect(201);
  const duplicate = await create(submitter).expect(201);
  const adminDetail = `${queue}/${duplicate.body.id}`;
  const decline = (number: number) =>
    revise(handler.patch(adminDetail), duplicate.headers.etag).send({
      status: 'declined',
      decline_reason: 'duplicate',
      duplicate_of: number,
      message: 'This issue is already being tracked.',
    });
  await expectError(decline(duplicate.body.number), 422, 'HUB_FEEDBACK_INVALID_DUPLICATE');
  const declined = await decline(target.body.number).expect(200);
  assert.equal(declined.body.status, 'declined');
  const own = await submitter.get(`${self}/${duplicate.body.id}`).expect(200);
  assert.equal(own.body.status, 'declined');
  assert.equal(own.body.decline_reason, 'duplicate');
  assert(own.body.duplicate_of == null);
  assert(own.body.duplicate_of_id == null);
  assert(!own.text.includes(target.body.id));
  assert(!own.text.includes(target.body.title));
});

test('已有反馈写入要求当前修订，已读不写出新的修订', async (context) => {
  const fixture = await createTestHub(context);
  const [submitter, handler] = await Promise.all([signIn(fixture, 'reader'), signIn(fixture)]);
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const created = await create(submitter, {}, [screenshot]).expect(201);
  const selfDetail = `${self}/${created.body.id}`;
  const adminDetail = `${queue}/${created.body.id}`;
  const attachmentPath = `/attachments/${created.body.attachments[0].id}`;
  context.mock.timers.tick(1);
  const changed = await revise(handler.patch(adminDetail), created.headers.etag)
    .send({ status: 'needs_info', message: 'More details are needed' })
    .expect(200);
  assert.notEqual(changed.headers.etag, created.headers.etag);
  const writes = [
    () => handler.patch(adminDetail).send({ status: 'resolved', message: 'Fixed' }),
    () => submitter.post(`${selfDetail}/close`),
    () => submitter.post(`${selfDetail}/read`),
    () => multipart(submitter.post(`${selfDetail}/comments`), { body: 'An update' }),
    () =>
      multipart(handler.post(`${adminDetail}/comments`), {
        body: 'An answer',
        visibility: 'public',
      }),
    () => handler.post(`${adminDetail}/redactions`).send({ target: 'description' }),
    () => handler.delete(`${adminDetail}${attachmentPath}`),
  ];
  for (const write of writes) {
    await expectError(write().set('Idempotency-Key', randomUUID()), 428, 'IF_MATCH_REQUIRED');
    await expectError(revise(write(), created.headers.etag), 412, 'REVISION_CONFLICT');
    await expectError(write().set('If-Match', changed.headers.etag), 400, 'IDEMPOTENCY_REQUIRED');
  }
  const current = await submitter.get(selfDetail).expect(200);
  assert.equal(current.headers.etag, changed.headers.etag);
  const unread = await submitter.get(`${self}/summary`).expect(200);
  assert.deepEqual(unread.body, { unread: 1, open: 1 });
  const read = await revise(submitter.post(`${selfDetail}/read`), current.headers.etag).expect(200);
  assert.equal(read.body.revision, current.body.revision);
  const seen = await submitter.get(`${self}/summary`).expect(200);
  assert.deepEqual(seen.body, { unread: 0, open: 1 });
});

test('提交幂等按元数据和附件内容判定，重放即使达到每小时限额仍成功', async (context) => {
  const fixture = await createTestHub(context);
  const submitter = await signIn(fixture, 'reader');
  await expectError(multipart(submitter.post(self), metadata), 400, 'IDEMPOTENCY_REQUIRED');
  const key = randomUUID();
  const send = () => create(submitter, {}, [screenshot], key);
  const created = await send().expect(201);
  await expectError(
    create(submitter, { title: 'Different title' }, [screenshot], key),
    409,
    'IDEMPOTENCY_CONFLICT',
  );
  const otherPng = Buffer.from(png);
  otherPng.writeUInt32BE(2, 16);
  await expectError(
    create(submitter, {}, [{ ...screenshot, bytes: otherPng }], key),
    409,
    'IDEMPOTENCY_CONFLICT',
  );
  const initialReplay = await send().expect(201);
  assert.equal(initialReplay.body.id, created.body.id);
  for (let index = 1; index < 10; index++) {
    await create(submitter, { title: `Feedback ${index}` }).expect(201);
  }
  const overLimit = await expectError(create(submitter), 429, 'HUB_FEEDBACK_RATE_LIMIT');
  assert.equal(overLimit.body.error.retryable, true);
  const replay = await send().expect(201);
  assert.equal(replay.body.id, created.body.id);
  assert.equal(replay.body.number, created.body.number);
  assert.equal(replay.body.attachments[0].id, created.body.attachments[0].id);
  const list = await submitter.get(self).expect(200);
  assert.equal(list.body.total, 10);
});

test('图片头、单次附件数量和文件内凭据经服务端校验，失败不创建反馈', async (context) => {
  const fixture = await createTestHub(context);
  const submitter = await signIn(fixture, 'reader');
  const tooWide = Buffer.from(png);
  tooWide.writeUInt32BE(8193, 16);
  const tooManyPixels = Buffer.from(png);
  tooManyPixels.writeUInt32BE(7000, 16);
  tooManyPixels.writeUInt32BE(7000, 20);
  const invalidImages = [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    tooWide,
    tooManyPixels,
  ];
  for (const bytes of invalidImages) {
    await expectError(
      create(submitter, {}, [{ ...screenshot, bytes }]),
      422,
      'HUB_FEEDBACK_ATTACHMENT_TYPE',
    );
  }
  await expectError(
    create(
      submitter,
      {},
      Array.from({ length: 6 }, () => screenshot),
    ),
    413,
    'UPLOAD_LIMIT',
  );
  const secret = 'ghp_' + 'a'.repeat(36);
  const invalidText: [() => Test, number][] = [
    [() => create(submitter, { description: `Credentials: ${secret}` }), 1],
    [
      () =>
        create(submitter, {}, [
          { name: 'output.log', kind: 'text', bytes: Buffer.from(`Output\nToken: ${secret}`) },
        ]),
      2,
    ],
  ];
  for (const [request, line] of invalidText) {
    const rejected = await expectError(request(), 422, 'HUB_FEEDBACK_SECRET_DETECTED');
    assert.deepEqual(rejected.body.error.details.lines, [line]);
    assert(!rejected.text.includes(secret));
  }
  const list = await submitter.get(self).expect(200);
  assert.equal(list.body.total, 0);
});

test('附件以校验后的类型下载，提交者只能在未结束反馈中移除本人附件', async (context) => {
  const fixture = await createTestHub(context);
  const [submitter, handler] = await Promise.all([signIn(fixture, 'reader'), signIn(fixture)]);
  const contents = 'Reproduction log';
  const log = { name: 'console.txt', kind: 'text', bytes: Buffer.from(contents) };
  const created = await create(submitter, {}, [screenshot, log]).expect(201);
  const { id } = created.body;
  const selfDetail = `${self}/${id}`;
  const adminDetail = `${queue}/${id}`;
  const attachments: HubFeedbackAttachmentResponse[] = created.body.attachments;
  const image = attachments.find(({ name }) => name === screenshot.name);
  const text = attachments.find(({ name }) => name === log.name);
  assert(image);
  assert(text);
  assert.equal(image.can_remove, true);
  const imagePath = `${selfDetail}/attachments/${image.id}`;
  const textPath = `${selfDetail}/attachments/${text.id}`;
  const imageResponse = await submitter.get(imagePath).expect(200);
  const textResponse = await submitter.get(textPath).expect(200);
  for (const response of [imageResponse, textResponse]) {
    const headers = response.headers;
    assert.equal(headers['cross-origin-resource-policy'], 'same-origin');
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.match(headers['cache-control'], /\bno-store\b/);
    const csp = headers['content-security-policy'];
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /img-src 'self'/);
    assert.match(csp, /(?:^|;)\s*sandbox\s*(?:;|$)/);
  }
  assert.equal(imageResponse.headers['content-type'], 'image/png');
  assert.match(imageResponse.headers['content-disposition'], /^inline;.*capture\.png/);
  assert.deepEqual(imageResponse.body, png);
  assert.match(textResponse.headers['content-type'], /^text\/plain\b/);
  assert.match(textResponse.headers['content-disposition'], /^attachment;.*console\.txt/);
  assert.equal(textResponse.text, contents);

  const handlerComment = await multipart(
    revise(handler.post(`${adminDetail}/comments`), created.headers.etag),
    { body: 'Here is a second screenshot.', visibility: 'public' },
    [{ ...screenshot, name: 'handler.png' }],
  ).expect(200);
  const handlerFiles: HubFeedbackAttachmentResponse[] = handlerComment.body.attachments;
  const handlerFile = handlerFiles.find(({ name }) => name === 'handler.png');
  assert(handlerFile);
  const handlerFilePath = `${selfDetail}/attachments/${handlerFile.id}`;
  await submitter.get(handlerFilePath).expect(200);
  await expectError(
    revise(submitter.delete(handlerFilePath), handlerComment.headers.etag),
    404,
    'NOT_FOUND',
  );
  await submitter.get(handlerFilePath).expect(200);

  await expectError(
    submitter.delete(imagePath).set('Idempotency-Key', randomUUID()),
    428,
    'IF_MATCH_REQUIRED',
  );
  await expectError(
    revise(submitter.delete(imagePath), created.headers.etag),
    412,
    'REVISION_CONFLICT',
  );
  const key = randomUUID();
  const remove = () => revise(submitter.delete(imagePath), handlerComment.headers.etag, key);
  const removed = await remove().expect(200);
  const removedFiles: HubFeedbackAttachmentResponse[] = removed.body.attachments;
  assert(removedFiles.find(({ id }) => id === image.id)?.removed_at);
  const replay = await remove().expect(200);
  assert.equal(replay.body.revision, removed.body.revision);
  await expectError(submitter.get(imagePath), 404, 'NOT_FOUND');
  await submitter.get(handlerFilePath).expect(200);

  const closed = await revise(submitter.post(`${selfDetail}/close`), removed.headers.etag).expect(
    200,
  );
  await expectError(revise(submitter.delete(textPath), closed.headers.etag), 403, 'FORBIDDEN');
  await submitter.get(textPath).expect(200);
});

test('附件累计超过二十个时拒绝留言，移除后可重新上传', async (context) => {
  const fixture = await createTestHub(context);
  const submitter = await signIn(fixture, 'reader');
  const files = Array.from({ length: 5 }, (_, index) => ({
    ...screenshot,
    name: `capture-${index}.png`,
  }));
  const first = await create(submitter, {}, files).expect(201);
  const detail = `${self}/${first.body.id}`;
  const post = (etag: string, uploads: Upload[]) =>
    multipart(
      revise(submitter.post(`${detail}/comments`), etag),
      { body: 'More context' },
      uploads,
    );
  let etag: string = first.headers.etag;
  for (let index = 0; index < 3; index++) {
    const appended = await post(etag, files).expect(200);
    etag = appended.headers.etag;
  }
  await expectError(post(etag, [screenshot]), 413, 'HUB_FEEDBACK_ATTACHMENT_LIMIT');
  const remove = submitter.delete(`${detail}/attachments/${first.body.attachments[0].id}`);
  const removed = await revise(remove, etag).expect(200);
  const appended = await post(removed.headers.etag, [screenshot]).expect(200);
  const currentFiles: HubFeedbackAttachmentResponse[] = appended.body.attachments;
  assert(currentFiles.some(({ name }) => name === screenshot.name));
});

test('隐去正文后，先前提交与留言的幂等重放不恢复已隐去的内容', async (context) => {
  const fixture = await createTestHub(context);
  const [submitter, handler] = await Promise.all([signIn(fixture, 'reader'), signIn(fixture)]);
  const createKey = randomUUID();
  const commentKey = randomUUID();
  const description = 'Private description to redact';
  const body = 'Private comment to redact';
  const submit = () => create(submitter, { description }, [], createKey);
  const submitted = await submit().expect(201);
  const { id } = submitted.body;
  const comment = () =>
    multipart(
      revise(submitter.post(`${self}/${id}/comments`), submitted.headers.etag, commentKey),
      { body },
    );
  const commented = await comment().expect(200);
  const eventId = commented.body.events[0].id;
  const redactions = `${queue}/${id}/redactions`;
  const hiddenDescription = await revise(handler.post(redactions), commented.headers.etag)
    .send({ target: 'description' })
    .expect(200);
  await revise(handler.post(redactions), hiddenDescription.headers.etag)
    .send({ target: 'event', event_id: eventId })
    .expect(200);
  for (const result of [
    await submitter.get(`${self}/${id}`).expect(200),
    await submit().expect(201),
    await comment().expect(200),
  ]) {
    assert.equal(result.body.id, id);
    assert(!result.text.includes(description));
    assert(!result.text.includes(body));
  }
});

test('平台反馈权限只接受平台绑定，撤权对已登录会话的下一次请求生效', async (context) => {
  const fixture = await createTestHub(context);
  const { hub, admin } = fixture;
  const role = await hub.administration.createRole(admin, {
    name: 'Feedback handler',
    permissions: ['feedback:manage'],
  });
  const grant = { principal_id: fixture.reviewer.id, role_id: role.id };
  await hub.administration.grantRole(admin, {
    ...grant,
    scope_type: 'team',
    scope_id: fixture.teamId,
  });
  const handler = await signIn(fixture, 'reviewer');
  const before = await handler.get('/api/me').expect(200);
  assert.equal(before.body.capabilities.can_manage_feedback, false);
  await expectError(handler.get(queue), 403, 'FORBIDDEN');
  const platform = await hub.administration.grantRole(admin, { ...grant, scope_type: 'platform' });
  await handler.get(queue).expect(200);
  const during = await handler.get('/api/me').expect(200);
  assert.equal(during.body.capabilities.can_manage_feedback, true);
  await hub.administration.removeGrant(admin, 'role_bindings', platform.id);
  await expectError(handler.get(queue), 403, 'FORBIDDEN');
  const after = await handler.get('/api/me').expect(200);
  assert.equal(after.body.capabilities.can_manage_feedback, false);
});

test('启动时为已有内置管理员角色补权并保留既有角色与授权', async (context) => {
  const fixture = await createTestHub(context);
  const role = await fixture.store.find('roles', 'key', 'admin');
  assert(role?.builtin);
  const legacyRole = {
    ...role,
    permissions: role.permissions.filter((permission) => permission !== 'feedback:manage'),
  };
  await fixture.store.put('roles', legacyRole);
  const oldSession = await signIn(fixture);
  await expectError(oldSession.get(queue), 403, 'FORBIDDEN');
  await fixture.close();

  const reopened = await createApp(fixture.config);
  try {
    const handler = await signIn({ ...fixture, ...reopened });
    await handler.get(queue).expect(200);
    const me = await handler.get('/api/me').expect(200);
    assert.equal(me.body.capabilities.can_manage_feedback, true);
    const updatedRole = await reopened.store.find('roles', 'key', 'admin');
    assert.equal(updatedRole?.id, role.id);
    assert.deepEqual(
      updatedRole?.permissions.toSorted(),
      [...legacyRole.permissions, 'feedback:manage'].toSorted(),
    );
  } finally {
    await reopened.close();
  }
});
