import { randomUUID } from 'node:crypto';
import { release } from 'node:os';
import { join, resolve } from 'node:path';
import {
  hubFeedbackAreas,
  hubFeedbackCommentRequestSchema,
  hubFeedbackCreateRequestSchema,
  hubFeedbackDiagnosticsSchema,
  hubFeedbackKinds,
  hubFeedbackLimits,
  hubFeedbackRefSchema,
  hubFeedbackStatuses,
  hubFeedbackSurfaces,
  hubFeedbackTimelineQuerySchema,
} from '@capability-hub/contracts';
import { canonical, sha256 } from '@capability-hub/domain/canonical';
import { z } from 'zod';
import packageJson from '../package.json' with { type: 'json' };
import { HubApiClient, HubApiError, terminalText } from './api-client.js';
import type { CliOptions } from './cli-commands.js';
import { CliCancelled, isCliCi, type CliUi } from './cli-ui.js';
import { hubUrl, loadCredentials, resolveConsumerCredentials } from './credentials.js';
import { readLastFailure } from './diagnostics.js';
import {
  defaultConfigDirectory,
  feedbackAttachments,
  feedbackBody,
  scanFeedbackText,
  type FeedbackFile,
} from './feedback-files.js';
import {
  feedbackListSchema,
  feedbackPageSchema,
  feedbackReceiptSchema,
  feedbackSummarySchema,
} from './response-schemas.js';

export interface FeedbackOptions {
  title?: string;
  description?: string;
  descriptionFile?: string;
  kind?: string;
  surface?: string;
  area?: string;
  blocking?: boolean;
  attach?: string[];
  lastError?: boolean;
  diagnostics?: boolean;
  yes?: boolean;
  status?: 'open' | 'closed' | 'all';
  message?: string;
  messageFile?: string;
  after?: string;
  requestId?: string;
}

type FeedbackPage = z.output<typeof feedbackPageSchema>;
type FeedbackResult = z.output<typeof feedbackReceiptSchema>;

const collection = '/api/hub-feedback';
const oldHub = '此 Hub 版本尚不支持 CLI 反馈，请在网页反馈或联系管理员';

function outputJson(value: unknown) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function metadataJson(metadata: unknown) {
  const json = JSON.stringify(metadata);
  if (Buffer.byteLength(json) > hubFeedbackLimits.metadataBytes)
    throw new Error('反馈资料超过大小限制');
  return json;
}

function multipart(metadata: string, files: readonly FeedbackFile[]) {
  const form = new FormData();
  form.append('metadata', metadata);
  for (const { bytes, media_type, name } of files)
    form.append('files', new Blob([bytes], { type: media_type }), name);
  return form;
}

function describeFiles(files: readonly FeedbackFile[]) {
  return files.map(({ name, kind, media_type, size }) => ({ name, kind, media_type, size }));
}

function metadataFiles(files: readonly FeedbackFile[]) {
  return files.map(({ kind, name }, part) => ({ part, kind, name }));
}

function revisionWrite(revision: number, idempotencyKey: string = randomUUID()) {
  return { method: 'POST', idempotencyKey, ifMatch: `"${revision}"` };
}

async function feedbackRequest<T>(
  api: HubApiClient,
  record: boolean,
  action: () => Promise<T>,
  retryKey?: string,
) {
  try {
    return await action();
  } catch (error) {
    if (retryKey && (!(error instanceof HubApiError) || error.status >= 500))
      process.stderr.write(
        `未能确认写入结果；24 小时内可用相同参数及 --request-id ${retryKey} 重试。\n`,
      );
    if (!(error instanceof HubApiError)) throw error;
    let unsupported = error.status === 403 && error.code === 'TOKEN_SCOPE';
    if (error.status === 404) {
      unsupported = !record;
      if (record) {
        try {
          await api.json(`${collection}/summary`, feedbackSummarySchema);
        } catch (probe) {
          unsupported =
            probe instanceof HubApiError &&
            (probe.status === 404 || (probe.status === 403 && probe.code === 'TOKEN_SCOPE'));
        }
      }
    }
    if (!unsupported) throw error;
    throw new HubApiError(error.status, error.code, oldHub, {
      cause: error,
      requestId: error.requestId,
      origin: error.origin,
    });
  }
}

function feedbackRef(ref: string | undefined) {
  const result = hubFeedbackRefSchema.safeParse(ref);
  if (!result.success) throw new Error('反馈引用必须为正整数编号或 ID');
  return result.data;
}

async function feedbackCredentials(directory: string, flags: CliOptions) {
  const environmentToken = process.env.CAPABILITY_HUB_TOKEN;
  try {
    const credentials = await resolveConsumerCredentials({
      url: flags.url,
      environmentToken,
      load: () => loadCredentials(join(directory, 'auth.json')),
    });
    flags.url = credentials.url;
    return {
      ...credentials,
      credentialType: environmentToken === undefined ? 'login' : 'env',
    } as const;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.cause as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
    )
      throw new Error(`${error.message} 也可以登录网页提交反馈。`, { cause: error });
    throw error;
  }
}

function validate<T>(schema: z.ZodType<T>, value: unknown) {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path.join('.');
  throw new Error(field ? `反馈字段无效：${field}` : '反馈资料无效');
}

function validateText(value: string, maximum: number) {
  const length = value.trim().length;
  if (!length || length > maximum || value.includes('\0'))
    return `请输入 1 到 ${maximum} 字的文本，不能含 NUL`;
  return undefined;
}

function writeConsent(flags: CliOptions, ui: CliUi) {
  if (!ui.interactive && !flags.yes && !flags.dryRun)
    throw new Error('需要用户确认后加 --yes；可先用 dry-run 预览新反馈。');
}

async function confirmWrite(flags: CliOptions, ui: CliUi, message: string) {
  if (!flags.yes && !(await ui.confirm(message))) throw new CliCancelled();
}

async function wizard(flags: CliOptions, ui: CliUi) {
  if (!ui.interactive) throw new Error('反馈向导需要交互终端；请使用 feedback new --help。');
  const choices = (labels: Record<string, string>) =>
    Object.entries(labels).map(([value, label]) => ({ value, label }));
  flags.kind = await ui.choose('--kind', '反馈类型', choices(hubFeedbackKinds));
  flags.surface = await ui.choose('--surface', '问题出现的位置', choices(hubFeedbackSurfaces));
  const area = await ui.choose('--area', '所属模块', [
    { value: 'none', label: '不指定' },
    ...choices(hubFeedbackAreas),
  ]);
  flags.area = area === 'none' ? undefined : area;
  flags.title = await ui.input(undefined, '--title', '反馈标题', (value) =>
    validateText(value, 120),
  );
  flags.description = await ui.textarea('问题描述', (value) => validateText(value, 5000));
  const paths: string[] = [];
  while (paths.length < hubFeedbackLimits.uploadFiles) {
    const path = await ui.input(undefined, '--attach', '附件路径（留空完成）', () => undefined);
    if (!path) break;
    paths.push(path);
  }
  flags.attach = paths;
}

async function createFeedback(flags: CliOptions, ui: CliUi, directory: string, guided: boolean) {
  writeConsent(flags, ui);
  const credentials = flags.dryRun ? undefined : await feedbackCredentials(directory, flags);
  const origin = credentials?.url ?? (flags.url === undefined ? undefined : hubUrl(flags.url));
  const credentialType =
    credentials?.credentialType ??
    (origin && process.env.CAPABILITY_HUB_TOKEN !== undefined ? 'env' : undefined);
  const token = credentials?.token;
  const title = await ui.input(flags.title, '--title', '反馈标题', (value) =>
    validateText(value, 120),
  );
  scanFeedbackText(title, '标题', token);
  const description = await bodyInput(
    '--description',
    flags.description,
    flags.descriptionFile,
    directory,
    token,
    ui,
  );
  const files = await feedbackAttachments(flags.attach ?? [], directory, token);
  const lastFailure =
    (guided || flags.lastError) && flags.diagnostics !== false
      ? await readLastFailure(directory)
      : undefined;
  if (!lastFailure && flags.lastError && flags.diagnostics !== false)
    ui.message('没有最近失败记录，将不附带该项。');
  const client = {
    kind: 'cli',
    cli_version: packageJson.version,
    node_version: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    os_release: release().slice(0, 160),
    interactive: ui.interactive,
    ci: isCliCi(),
    yes: Boolean(flags.yes),
    ...(credentialType && { credential_type: credentialType }),
    ...(origin && { hub_origin: origin }),
  };
  let diagnostics =
    flags.diagnostics === false
      ? null
      : validate(hubFeedbackDiagnosticsSchema, {
          client: { ...client, ...(lastFailure && { last_failure: lastFailure }) },
        });
  const preview = JSON.stringify(diagnostics, null, 2);
  scanFeedbackText(preview, '诊断信息', token);
  if (guided && diagnostics) {
    ui.note('诊断预览', preview);
    const include = await ui.choose('诊断信息', '本次提交附带哪些诊断信息？', [
      { value: 'all', label: lastFailure ? '环境与版本信息、最近失败' : '环境与版本信息' },
      ...(lastFailure ? [{ value: 'client', label: '仅环境与版本信息' }] : []),
      { value: 'none', label: '不附带诊断信息' },
    ]);
    if (include === 'none') diagnostics = null;
    else if (include === 'client') diagnostics = validate(hubFeedbackDiagnosticsSchema, { client });
  }
  const metadata = validate(hubFeedbackCreateRequestSchema, {
    title,
    description,
    kind: flags.kind ?? 'bug',
    surface: flags.surface ?? 'cli',
    area: flags.area ?? null,
    blocking: Boolean(flags.blocking),
    diagnostics,
    files: metadataFiles(files),
  });
  const encoded = metadataJson(metadata);
  if (credentials === undefined) {
    if (diagnostics) {
      if (!origin) ui.message('预览未指定 Hub 地址；提交时将使用实际 Hub 地址。');
      if (!credentialType) ui.message('预览不读取登录凭据；提交时将记录实际凭据类型。');
      if (!flags.yes) ui.message('使用 --yes 提交时，确认诊断项将记为 yes: true。');
    }
    outputJson({ metadata, attachments: describeFiles(files) });
    return;
  }
  if (ui.interactive) {
    ui.note(
      '提交预览',
      [
        title,
        ...files.map(({ name, media_type, size }) => `${name} · ${media_type} · ${size} B`),
        diagnostics ? `诊断信息：\n${JSON.stringify(diagnostics, null, 2)}` : '不附带诊断信息',
      ].join('\n'),
    );
  }
  await confirmWrite(flags, ui, '提交此反馈？');
  const api = new HubApiClient(credentials.url, token);
  const detail = await feedbackRequest(api, false, () =>
    api.json(`${collection}?view=receipt`, feedbackReceiptSchema, multipart(encoded, files), {
      method: 'POST',
      idempotencyKey: sha256(
        `${api.url}\n${collection}\n${canonical(metadata)}\n${files.map((file) => file.digest).join('')}`,
      ),
    }),
  );
  printResult(detail, api, flags, '已提交反馈');
}

async function bodyInput(
  flag: string,
  value: string | undefined,
  path: string | undefined,
  directory: string,
  token: string | undefined,
  ui: CliUi,
) {
  let body = await feedbackBody(flag, value, path, directory, token);
  if (body === undefined) {
    if (!ui.interactive) throw new Error(`请提供 ${flag} 或 ${flag}-file`);
    body = await ui.textarea(flag === '--message' ? '留言内容' : '问题描述', (text) =>
      validateText(text, 5000),
    );
  }
  const error = validateText(body, 5000);
  if (error) throw new Error(`${flag}：${error}`);
  if (path === undefined) scanFeedbackText(body, flag === '--message' ? '留言' : '描述', token);
  return body;
}

function printResult(
  { id, number, status, attachments }: FeedbackResult,
  api: HubApiClient,
  flags: CliOptions,
  label: string,
) {
  const detailUrl = new URL(`/account?tab=feedback&feedback=${id}`, api.url).href;
  if (flags.json) outputJson({ id, number, status, attachments, detail_url: detailUrl });
  else
    process.stdout.write(`${label} #${number}（${hubFeedbackStatuses[status]}）\n${detailUrl}\n`);
}

function feedbackHeading(item: {
  number: number;
  title: string;
  status: FeedbackResult['status'];
}) {
  return `#${item.number}（${hubFeedbackStatuses[item.status]}） ${terminalText(item.title)}`;
}

function printDetail(detail: FeedbackPage, json = false) {
  if (json) return outputJson(detail);
  const safeLines = (text: string) =>
    text
      .split(/\r\n?|\n/)
      .map(terminalText)
      .join('\n');
  const tags: string[] = [hubFeedbackKinds[detail.kind], hubFeedbackSurfaces[detail.surface]];
  if (detail.area) tags.push(hubFeedbackAreas[detail.area]);
  const rows = [
    feedbackHeading(detail),
    `${detail.created_at} · ${tags.join(' · ')}${detail.blocking ? ' · 阻塞使用' : ''}`,
    '',
    detail.description_redacted_at ? '描述已隐去' : safeLines(detail.description),
  ];
  if (detail.steps) rows.push('', '复现步骤', safeLines(detail.steps));
  if (detail.expected) rows.push('', '预期结果', safeLines(detail.expected));
  if (detail.events.length) {
    rows.push('', '公开时间线');
    for (const event of detail.events) {
      const actor = terminalText(
        event.actor_name ?? (event.actor_role === 'submitter' ? '提交者' : '平台支持'),
      );
      const body = event.redacted_at ? '内容已隐去' : safeLines(event.body);
      const status = event.status_to ? hubFeedbackStatuses[event.status_to] : '';
      rows.push(`#${event.sequence}  ${event.created_at}  ${actor}${status ? ` · ${status}` : ''}`);
      if (body) rows.push(body);
    }
  }
  const attachments = detail.attachments.filter((file) => !file.removed_at);
  if (attachments.length) {
    rows.push('', '附件');
    for (const file of attachments)
      rows.push(`${terminalText(file.name)} · ${file.media_type} · ${file.size} B`);
  }
  if (detail.next_after !== null)
    rows.push(
      '',
      `下一页：capability-hub feedback show ${detail.number} --after ${detail.next_after}`,
    );
  process.stdout.write(rows.join('\n') + '\n');
}

export async function runFeedback(
  command: string,
  args: readonly string[],
  flags: CliOptions,
  ui: CliUi,
) {
  const directory = flags.configDir ? resolve(flags.configDir) : defaultConfigDirectory();
  if (command === 'feedback') await wizard(flags, ui);
  if (command === 'feedback' || command === 'feedback new') {
    await createFeedback(flags, ui, directory, command === 'feedback');
    return;
  }
  if (command === 'feedback reply' || command === 'feedback close') writeConsent(flags, ui);
  if (flags.requestId !== undefined && !z.uuid().safeParse(flags.requestId).success)
    throw new Error('--request-id 必须是 UUID');
  const ref = command === 'feedback list' ? undefined : feedbackRef(args[0]);
  const credentials = await feedbackCredentials(directory, flags);
  const api = new HubApiClient(credentials.url, credentials.token);
  if (ref === undefined) {
    const query = new URLSearchParams({ status: flags.status ?? 'open' });
    const list = await feedbackRequest(api, false, () =>
      api.json(`${collection}?${query}`, feedbackListSchema),
    );
    if (flags.json) outputJson(list);
    else if (!list.items.length) process.stdout.write('没有符合条件的反馈。\n');
    else {
      for (const item of list.items)
        process.stdout.write(`${feedbackHeading(item)}${item.unread ? ' · 未读' : ''}\n`);
      if (list.total > list.items.length)
        process.stdout.write(`显示 ${list.items.length} / ${list.total} 条。\n`);
    }
    return;
  }
  if (command === 'feedback show') {
    const query = validate(hubFeedbackTimelineQuerySchema, {
      view: 'timeline',
      after: flags.after,
    });
    const detail = await feedbackRequest(api, true, () =>
      api.json(`${collection}/${ref}?view=timeline&after=${query.after}`, feedbackPageSchema),
    );
    if (detail.next_after === undefined) {
      if (query.after !== 0)
        throw new Error('此 Hub 不支持反馈分页，请省略 --after 查看完整时间线');
      detail.next_after = null;
    }
    if (detail.unread && detail.next_after === null && (!query.after || detail.events.length)) {
      const receipt = await feedbackRequest(api, true, () =>
        api.json(
          `${collection}/${detail.id}/read?view=receipt`,
          feedbackReceiptSchema,
          undefined,
          revisionWrite(detail.revision),
        ),
      );
      detail.unread = receipt.unread;
    }
    printDetail(detail, flags.json);
    return;
  }
  const detail = await feedbackRequest(api, true, () =>
    api.json(`${collection}/${ref}?view=receipt`, feedbackReceiptSchema),
  );
  const path = `${collection}/${detail.id}`;
  const write = revisionWrite(detail.revision, flags.requestId);
  if (command === 'feedback close') {
    await confirmWrite(flags, ui, `关闭反馈 #${detail.number}？`);
    const result = await feedbackRequest(
      api,
      true,
      () => api.json(`${path}/close?view=receipt`, feedbackReceiptSchema, undefined, write),
      write.idempotencyKey,
    );
    printResult(result, api, flags, '已关闭反馈');
  } else if (command === 'feedback reply') {
    const body = await bodyInput(
      '--message',
      flags.message,
      flags.messageFile,
      directory,
      credentials.token,
      ui,
    );
    const files = await feedbackAttachments(flags.attach ?? [], directory, credentials.token);
    const metadata = validate(hubFeedbackCommentRequestSchema, {
      body,
      files: metadataFiles(files),
    });
    const encoded = metadataJson(metadata);
    if (ui.interactive)
      ui.note(
        `反馈 #${detail.number}`,
        [
          metadata.body,
          ...files.map(({ name, media_type, size }) => `${name} · ${media_type} · ${size} B`),
        ].join('\n'),
      );
    await confirmWrite(flags, ui, `向反馈 #${detail.number} 发送留言？`);
    const result = await feedbackRequest(
      api,
      true,
      () =>
        api.json(
          `${path}/comments?view=receipt`,
          feedbackReceiptSchema,
          multipart(encoded, files),
          write,
        ),
      write.idempotencyKey,
    );
    printResult(result, api, flags, '已发送留言');
  }
}
