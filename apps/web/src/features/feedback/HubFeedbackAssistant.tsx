import { hubFeedbackCreateRequestSchema, hubFeedbackStatuses } from '@capability-hub/contracts';
import type {
  HubFeedbackDetailResponse,
  HubFeedbackListResponse,
} from '@capability-hub/contracts/http';
import { browserUuid } from '@capability-hub/logging/browser';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Button, Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { api } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { useQuery } from '../../shared/api/use-query.js';
import { CopyButton } from '../../shared/components/CopyButton.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { QueryRegion } from '../../shared/components/QueryRegion.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel } from '../../shared/format/labels.js';
import {
  notifyHubFeedbackChanged,
  openHubFeedback,
  type HubFeedbackSeed,
} from '../../shared/hub-feedback-events.js';
import { ArrowRight, Check, Minus, Pencil, X } from '../../shared/icons/lucide.js';
import { shouldHandleLink } from '../../shared/navigation/history-navigation.js';
import { loginHref, type HubRoute } from '../../shared/navigation/history-route.js';
import { cn } from '../../shared/styles/cn.js';
import {
  btnDangerStyles,
  btnPrimaryStyles,
  btnStyles,
  iconBtnStyles,
  subtleStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import { HubFeedbackComposer } from './HubFeedbackComposer.js';
import {
  sampleDiagnostics,
  selectedDiagnostics,
  type DiagnosticGroup,
  type DiagnosticRows,
  type DiagnosticSnapshot,
} from './diagnostics.js';
import {
  defaultArea,
  defaultSurface,
  emptyDraft,
  hasFeedbackDraft,
  readFeedbackDraft,
  saveFeedbackDraft,
  type DraftOrigin,
  type FeedbackDraft,
} from './draft.js';
import {
  hubFeedbackForm,
  myHubFeedbackHref,
  type HubFeedbackLocalFile,
} from './hub-feedback-api.js';
import {
  feedbackCapsuleStyles,
  feedbackHeaderStyles,
  feedbackScrollStyles,
  feedbackTabStyles,
} from './styles.js';

interface AssistantProps {
  open: boolean;
  route: HubRoute;
  seed?: HubFeedbackSeed;
  unread: number;
  onClose: () => void;
}

interface RetrySubmission {
  key: string;
  metadata: string;
  files: HubFeedbackLocalFile[];
}

interface ComposerContext {
  origin: DraftOrigin;
  sample: DiagnosticSnapshot;
}

async function sameFiles(previous: HubFeedbackLocalFile[], next: HubFeedbackLocalFile[]) {
  if (previous.length !== next.length) return false;
  for (const [index, entry] of next.entries()) {
    const other = previous[index];
    if (entry.kind !== other.kind || entry.name !== other.name) return false;
    if (entry.file === other.file) continue;
    if (entry.file.size !== other.file.size || entry.file.type !== other.file.type) return false;
    const [oldBuffer, newBuffer] = await Promise.all([
      other.file.arrayBuffer(),
      entry.file.arrayBuffer(),
    ]);
    const oldBytes = new Uint8Array(oldBuffer);
    const newBytes = new Uint8Array(newBuffer);
    if (oldBytes.some((byte, offset) => byte !== newBytes[offset])) return false;
  }
  return true;
}

function AssistantHeader({
  onClose,
  onMinimize,
  disabled,
}: {
  onClose: () => void;
  onMinimize?: () => void;
  disabled?: boolean;
}) {
  return (
    <header className={feedbackHeaderStyles}>
      <h2 className="text-section font-semibold">反馈问题</h2>
      <div className="flex items-center gap-1">
        {onMinimize && (
          <Button
            aria-label="收起"
            className={iconBtnStyles}
            isDisabled={disabled}
            onPress={onMinimize}
          >
            <Minus size={19} aria-hidden="true" />
          </Button>
        )}
        <Button aria-label="关闭" className={iconBtnStyles} isDisabled={disabled} onPress={onClose}>
          <X size={19} aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}

function GuestFeedback({
  route,
  seed,
  onClose,
}: Pick<AssistantProps, 'route' | 'seed' | 'onClose'>) {
  const [diagnostic] = useState(() => {
    const sample = sampleDiagnostics(route, seed ?? {});
    const request = sample.requests[0];
    return JSON.stringify(
      {
        at: request?.at ?? new Date().toISOString(),
        hub_version: sample.page.hub_version,
        web_build: sample.page.web_build,
        code: request?.code,
        request_id: request?.request_id,
      },
      null,
      2,
    );
  });
  return (
    <>
      <AssistantHeader onClose={onClose} />
      <div className={cn(feedbackScrollStyles, 'grid content-start gap-3 border-t border-line')}>
        <h3 className="text-section font-semibold">需要登录</h3>
        <p className={subtleStyles}>
          登录后可提交反馈和查看回复。如果无法登录，可以复制诊断信息，通过组织已有渠道联系管理员。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={loginHref(window.location.pathname + window.location.search)}
            className={cn(btnStyles, btnPrimaryStyles)}
            onClick={(event) => {
              if (shouldHandleLink(event, '', false)) onClose();
            }}
          >
            去登录 <ArrowRight size={15} aria-hidden="true" />
          </a>
          <CopyButton text={diagnostic} label="复制诊断信息" />
        </div>
      </div>
    </>
  );
}

function RecentFeedback({ onNavigate, refresh }: { onNavigate: () => void; refresh: number }) {
  const [attempt, setAttempt] = useState(0);
  const list = useQuery<HubFeedbackListResponse>(
    '/api/hub-feedback?status=all&limit=5',
    refresh + attempt,
  );
  const closeOnNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (shouldHandleLink(event, '', false)) onNavigate();
  };
  return (
    <div className={feedbackScrollStyles}>
      <QueryRegion label="最近的反馈" loading={list.loading}>
        {list.error && (
          <ErrorState
            {...list.errorProps}
            message={list.error}
            retry={() => setAttempt((value) => value + 1)}
          />
        )}
        {list.data?.items.length ? (
          <ul className="divide-y divide-line rounded-[14px] border border-line bg-paper">
            {list.data.items.map((item) => (
              <li key={item.id}>
                <a
                  className="flex items-center justify-between gap-4 rounded-[10px] px-4 py-3 text-body hover:bg-brand-soft"
                  href={myHubFeedbackHref(item.id)}
                  onClick={closeOnNavigation}
                >
                  <span className="min-w-0 wrap-anywhere">
                    <span className="block font-medium">
                      #{item.number} {item.title}
                    </span>
                    <span className={subtleStyles}>
                      {hubFeedbackStatuses[item.status]} / {dateLabel(item.last_activity_at)}
                    </span>
                    {item.unread && <span className="sr-only">未读</span>}
                  </span>
                  {item.unread ? (
                    <span className="size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
                  ) : (
                    <ArrowRight className="shrink-0 text-muted-ink" size={15} aria-hidden="true" />
                  )}
                </a>
              </li>
            ))}
          </ul>
        ) : list.data && !list.error ? (
          <p className={subtleStyles}>还没有提交过反馈。</p>
        ) : null}
      </QueryRegion>
      <a
        className={cn(textBtnStyles, 'mt-4')}
        href={myHubFeedbackHref()}
        onClick={closeOnNavigation}
      >
        查看我的全部反馈 <ArrowRight size={15} aria-hidden="true" />
      </a>
    </div>
  );
}

function AccountAssistant({
  userId,
  refresh,
  open,
  route,
  seed,
  unread,
  onClose,
}: AssistantProps & { userId: string; refresh: number }) {
  const [draft, setDraft] = useState(() => readFeedbackDraft(userId));
  const [filesLost, setFilesLost] = useState(draft.hadFiles);
  const [files, setFiles] = useState<HubFeedbackLocalFile[]>([]);
  const [rows, setRows] = useState<DiagnosticRows>({});
  const [context, setContext] = useState<ComposerContext>();
  const [tab, setTab] = useState<'new' | 'recent'>('new');
  const [minimized, setMinimized] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [receipt, setReceipt] = useState<HubFeedbackDetailResponse>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const updateProcessing = useCallback((value: boolean) => {
    processingRef.current = value;
    setProcessing(value);
  }, []);
  const previous = useRef<{ open: boolean; seed?: HubFeedbackSeed }>({ open: false });
  const pending = useRef<AbortController | null>(null);
  const retry = useRef<RetrySubmission | null>(null);
  const meaningful = hasFeedbackDraft(draft) || Boolean(rows.requests || rows.errors);
  const locked = busy || processing;
  const diagnosticPayload = useMemo(
    () => (context ? selectedDiagnostics(context.sample, draft.choices, rows) : null),
    [context, draft.choices, rows],
  );

  useLayoutEffect(() => {
    const entering = open && !previous.current.open;
    const seeded = open && seed && seed !== previous.current.seed;
    previous.current = { open, seed: open ? seed : previous.current.seed };
    if (entering || seeded) {
      setTab('new');
      setMinimized(false);
    }
    if (seeded || (entering && (!meaningful || !context))) {
      setContext({
        origin: { page: route.page, asset: route.asset },
        sample: sampleDiagnostics(route, seed),
      });
      setRows({});
      if (seeded) {
        setReceipt(undefined);
        setDraft((value) => {
          const choices = { ...value.choices };
          delete choices.requests;
          delete choices.errors;
          return { ...value, choices };
        });
      }
    }
  }, [open, route, seed, context, meaningful]);
  useLayoutEffect(() => saveFeedbackDraft(userId, draft, rows), [userId, draft, rows]);
  useEffect(() => () => pending.current?.abort(), []);

  function updateDraft(update: Partial<FeedbackDraft>) {
    setError('');
    setDraft((value) => ({ ...value, ...update }));
  }

  function setGroup(group: DiagnosticGroup, selected: boolean) {
    setError('');
    setDraft((value) => {
      const choices = { ...value.choices };
      if (group === 'page' || group === 'device' ? selected : group === 'asset' && !selected) {
        delete choices[group];
      } else {
        choices[group] = selected;
      }
      return { ...value, choices };
    });
    if (group === 'requests' || group === 'errors') {
      setRows((value) => {
        const next = { ...value };
        delete next[group];
        return next;
      });
    }
  }

  function setRow(group: 'requests' | 'errors', index: number, selected: boolean) {
    setError('');
    setRows((value) => ({ ...value, [group]: { ...value[group], [index]: selected } }));
  }

  function minimize() {
    if (pending.current || busy || processingRef.current) return;
    setConfirm(false);
    setReceipt(undefined);
    setMinimized(meaningful);
    onClose();
  }

  function discard() {
    setDraft(emptyDraft());
    setRows({});
    setFiles([]);
    setFilesLost(false);
    setError('');
    setReceipt(undefined);
    setConfirm(false);
    setMinimized(false);
    retry.current = null;
    onClose();
  }

  function close() {
    if (pending.current || busy || processingRef.current) return;
    if (meaningful) setConfirm(true);
    else discard();
  }

  async function submit() {
    if (pending.current || busy || processingRef.current || !context) return;
    const result = hubFeedbackCreateRequestSchema.safeParse({
      kind: draft.kind,
      surface: draft.surface ?? defaultSurface(context.origin),
      area: draft.area ?? defaultArea(context.origin),
      title: draft.title,
      description: draft.description,
      steps: draft.steps,
      expected: draft.expected,
      blocking: draft.blocking,
      diagnostics: diagnosticPayload,
    });
    if (!result.success) {
      setError(
        result.error.issues.some((issue) => issue.path[0] === 'diagnostics' || !issue.path.length)
          ? '诊断信息超过提交限制。请取消勾选部分诊断后重试。'
          : '请填写标题和描述，再提交反馈。',
      );
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setError('');
    setBusy(true);
    try {
      const metadata = JSON.stringify(result.data);
      const previous = retry.current;
      const key =
        previous?.metadata === metadata && (await sameFiles(previous.files, files))
          ? previous.key
          : browserUuid();
      if (controller.signal.aborted) return;
      retry.current = { key, metadata, files };
      const detail = await api<HubFeedbackDetailResponse>('/api/hub-feedback', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: hubFeedbackForm(result.data, files),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      retry.current = null;
      setDraft(emptyDraft());
      setRows({});
      setFiles([]);
      setFilesLost(false);
      setReceipt(detail);
      notifyHubFeedbackChanged({ kind: 'submitted' });
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorMessage(failure));
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      <Overlay open={open} onClose={minimize} label="反馈问题" variant="sheet" feedbackChrome>
        <AssistantHeader onMinimize={minimize} onClose={close} disabled={locked} />
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => setTab(key === 'recent' ? 'recent' : 'new')}
          isDisabled={locked}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TabList
            aria-label="反馈助手"
            className="flex shrink-0 gap-5 border-b border-line bg-paper px-6 max-[600px]:px-[17px]"
          >
            <Tab id="new" className={feedbackTabStyles}>
              新反馈
            </Tab>
            <Tab id="recent" className={feedbackTabStyles}>
              我的反馈{unread > 0 ? ` · ${unread}` : ''}
            </Tab>
          </TabList>
          <TabPanel id="new" className="flex min-h-0 flex-1 flex-col">
            {receipt ? (
              <div className={cn(feedbackScrollStyles, 'grid content-start gap-4')}>
                <p role="status" className="flex items-center gap-2 text-section font-semibold">
                  <Check className="text-brand" size={20} aria-hidden="true" /> 已提交 #
                  {receipt.number}
                </p>
                <p className={subtleStyles}>平台处理人员的回复会显示在「我的反馈」。</p>
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    className={cn(btnStyles, btnPrimaryStyles)}
                    href={myHubFeedbackHref(receipt.id)}
                    onClick={(event) => {
                      if (shouldHandleLink(event, '', false)) minimize();
                    }}
                  >
                    查看详情 <ArrowRight size={15} aria-hidden="true" />
                  </a>
                  <Button
                    className={btnStyles}
                    onPress={() => {
                      setContext({
                        origin: { page: route.page, asset: route.asset },
                        sample: sampleDiagnostics(route),
                      });
                      setReceipt(undefined);
                    }}
                  >
                    继续反馈
                  </Button>
                </div>
              </div>
            ) : (
              context && (
                <HubFeedbackComposer
                  draft={draft}
                  origin={context.origin}
                  route={route}
                  sample={context.sample}
                  rows={rows}
                  payload={diagnosticPayload}
                  files={files}
                  filesLost={filesLost}
                  enabled={open && tab === 'new' && !confirm}
                  busy={busy}
                  processing={processing}
                  error={error}
                  onDraftChange={updateDraft}
                  onChoice={setGroup}
                  onRowChoice={setRow}
                  onFilesChange={(next) => {
                    setFiles(next);
                    updateDraft({ hadFiles: next.length > 0 || filesLost });
                  }}
                  onProcessingChange={updateProcessing}
                  onResourceLink={minimize}
                  onSubmit={() => {
                    void submit();
                  }}
                />
              )
            )}
          </TabPanel>
          <TabPanel id="recent" className="flex min-h-0 flex-1 flex-col">
            {open && tab === 'recent' && <RecentFeedback refresh={refresh} onNavigate={minimize} />}
          </TabPanel>
        </Tabs>
      </Overlay>
      {open && confirm && (
        <Overlay
          open
          label="放弃这份草稿？"
          variant="palette"
          onClose={() => setConfirm(false)}
          feedbackChrome
        >
          <div className="grid gap-3 p-5">
            <h2 className="text-section font-semibold">放弃这份草稿？</h2>
            <p className={subtleStyles}>
              未提交的内容和附件将被清除。你也可以收起面板，稍后继续编辑。
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button className={btnStyles} onPress={() => setConfirm(false)}>
                继续编辑
              </Button>
              <Button className={cn(btnStyles, btnDangerStyles)} onPress={discard}>
                放弃草稿
              </Button>
            </div>
          </div>
        </Overlay>
      )}
      {!open && minimized && meaningful && (
        <Button
          data-feedback-chrome=""
          data-feedback-draft=""
          className={feedbackCapsuleStyles}
          onPress={() => openHubFeedback()}
        >
          <Pencil size={15} aria-hidden="true" /> 草稿 · 继续反馈
        </Button>
      )}
    </>
  );
}

export default function HubFeedbackAssistant(props: AssistantProps) {
  const { me, refresh } = useHub();
  if (me) {
    return <AccountAssistant key={me.id} userId={me.id} refresh={refresh} {...props} />;
  }
  return (
    <Overlay
      open={props.open}
      onClose={props.onClose}
      label="反馈问题"
      variant="sheet"
      feedbackChrome
    >
      {props.open && (
        <GuestFeedback route={props.route} seed={props.seed} onClose={props.onClose} />
      )}
    </Overlay>
  );
}
