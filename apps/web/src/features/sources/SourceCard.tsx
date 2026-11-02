import type { SourceResponse, SourceSyncJobResponse } from '@capability-hub/contracts/http';
import { useEffect, useState } from 'react';
import { api, mutate } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';
import { Message } from '../../shared/components/Message.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel, stateLabel } from '../../shared/format/labels.js';
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Clock3,
  FileJson,
  Folder,
  FolderGit2,
  GitBranch,
  KeyRound,
  LoaderCircle,
  Pause,
  Pencil,
  Play,
  RefreshCw,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import {
  btnStyles,
  btnPrimaryStyles,
  tagStyles,
  tagRedStyles,
  tagTealStyles,
} from '../../shared/styles/recipes.js';
import { SourceSyncBatch } from './SourceSyncBatch.js';
import {
  sourceCardBodyStyles,
  sourceCardHeaderStyles,
  sourceCardStyles,
  sourceIssueStyles,
  sourceLinkStyles,
  sourceMetaStyles,
  sourceSectionTitleStyles,
  sourceTargetRowStyles,
} from './styles.js';

const sourceErrors: Record<string, string> = {
  CREDENTIAL_UNAVAILABLE: '检查绑定凭据是否到期、已撤销，或所属账号已停用。更新凭据后重新同步。',
  CREDENTIAL_MISMATCH: '在“编辑配置”中选择与仓库域名及连接协议匹配的凭据。',
  CREDENTIAL_DECRYPTION: '无法读取绑定的凭据。请轮换凭据，或联系管理员检查实例密钥。',
  SSH_CREDENTIAL_REQUIRED: '在“编辑配置”中为这个 SSH 来源选择带主机公钥的 SSH 凭据。',
  CREDENTIAL_CHANGED: '同步期间凭据已轮换。可用当前凭据重新同步。',
  GIT_FETCH_FAILED: '未能拉取仓库。请核对仓库地址、分支和网络连接。',
  GIT_DNS_FAILED: 'Hub 无法解析仓库域名，请检查服务端 DNS 后重试。',
  GIT_ADDRESS_DENIED: '仓库解析到受限地址，请让管理员核对 Git 主机和私网允许列表。',
  GIT_TIMEOUT: 'Git 拉取超时，请检查网络后重新同步。',
};

function issueMessage(source: SourceResponse, code: string, detail?: string) {
  if (code !== 'GIT_AUTH_ERROR') return sourceErrors[code] ?? detail ?? `同步未完成（${code}）。`;
  if (!source.canonical_url.startsWith('https://'))
    return 'SSH 认证失败。请核对私钥、口令和仓库服务器的主机公钥，再重新同步。';
  return source.credential_ref
    ? 'HTTPS 认证失败。请核对令牌的仓库读取权限和认证方式（Basic 或 Bearer），更新凭据后重新同步。'
    : '此 HTTPS 来源未绑定凭据。如果仓库需要登录，请在“编辑配置”中选择只读凭据。';
}

/** 每个来源独立跟踪手动同步的批次，轮询失败时可继续读取原批次。 */
export function SourceCard({
  source,
  onEdit,
  onIntake,
}: {
  source: SourceResponse;
  onEdit: () => void;
  onIntake: (id: string) => void;
}) {
  const { reload } = useHub();
  const [busy, setBusy] = useState<'sync' | 'pause'>();
  const [feedback, setFeedback] = useState('');
  const [allTargets, setAllTargets] = useState(false);
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState<SourceSyncJobResponse>();
  const [pollError, setPollError] = useState('');
  const [pollRevision, setPollRevision] = useState(0);
  const sourceId = source.id;
  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const result = await api<SourceSyncJobResponse>(
          `/api/sources/${sourceId}/sync-jobs/${jobId}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setJob(result);
        if (result.state === 'queued' || result.state === 'running')
          timer = setTimeout(() => void poll(), 2000);
        else reload();
      } catch (error) {
        if (!controller.signal.aborted) setPollError(errorMessage(error));
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, sourceId, pollRevision, reload]);

  async function act(action: 'sync' | 'pause') {
    setBusy(action);
    setFeedback('');
    try {
      if (action === 'sync') {
        const result = await mutate<{ job_id: string }>(`/api/sources/${source.id}/sync`, {});
        setJob(undefined);
        setJobId(result.job_id);
        setPollError('');
        setPollRevision((n) => n + 1);
      } else {
        await mutate(
          `/api/sources/${source.id}`,
          {
            state: source.state === 'paused' ? 'active' : 'paused',
          },
          'PATCH',
          source.revision,
        );
      }
      reload();
    } catch (error) {
      setFeedback(errorMessage(error));
    } finally {
      setBusy(undefined);
    }
  }
  const identity = source.repository_identity;
  const split = identity.lastIndexOf('/');
  const namespace = identity.slice(0, Math.max(0, split));
  const name = identity.slice(split + 1);
  const targets = allTargets ? source.targets : source.targets.slice(0, 3);
  const hasEnabledTarget = source.targets.some((target) => target.enabled);
  const syncing = !!jobId && (!job || job.state === 'queued' || job.state === 'running');
  const blocked = source.state === 'blocked';
  const paused = source.state === 'paused';
  const issue =
    !blocked &&
    !paused &&
    (source.last_error_code || (source.state === 'auth_error' && 'GIT_AUTH_ERROR'));
  const issueDetail =
    job?.state !== 'succeeded' && job?.last_error_code === issue ? job?.error_message : undefined;
  return (
    <article
      className={sourceCardStyles}
      aria-labelledby={`repo-${source.id}`}
      aria-describedby={namespace ? `namespace-${source.id}` : undefined}
    >
      <header className={sourceCardHeaderStyles}>
        <div className="flex w-full min-w-0 items-start gap-3 md:w-auto md:flex-1">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            <FolderGit2 size={21} aria-hidden="true" />
          </span>
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h3
                id={`repo-${source.id}`}
                title={identity}
                className="min-w-0 text-section font-semibold leading-snug [overflow-wrap:anywhere]"
              >
                {name}
              </h3>
              <span
                className={cn(
                  tagStyles,
                  'shrink-0 rounded-full px-2',
                  source.state === 'auth_error' || blocked
                    ? tagRedStyles
                    : !paused && tagTealStyles,
                )}
              >
                <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                {source.state === 'active' ? '已启用' : stateLabel(source.state)}
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-ink">
              {namespace && (
                <span
                  className="min-w-0 [overflow-wrap:anywhere]"
                  id={`namespace-${source.id}`}
                  title={identity}
                >
                  {namespace}
                </span>
              )}
              <span className="inline-flex min-w-0 items-center gap-1 font-mono">
                <GitBranch size={13} className="shrink-0" />
                <span className="[overflow-wrap:anywhere]">{source.branch}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnStyles} disabled={!!busy} onClick={onEdit}>
            <Pencil size={14} />
            编辑配置
          </button>
          <button
            type="button"
            className={btnStyles}
            disabled={!!busy || blocked}
            onClick={() => void act('pause')}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            {paused ? '恢复' : '暂停'}
          </button>
          <button
            type="button"
            className={cn(btnStyles, btnPrimaryStyles)}
            disabled={!!busy || syncing || blocked || paused || !hasEnabledTarget}
            aria-describedby={hasEnabledTarget ? undefined : `inactive-targets-${source.id}`}
            onClick={() => void act('sync')}
          >
            {!pollError && (syncing || busy === 'sync') ? (
              <LoaderCircle size={14} className="motion-safe:animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {pollError
              ? '进度待确认'
              : syncing || busy === 'sync'
                ? '同步中'
                : issue
                  ? '重新同步'
                  : '同步'}
          </button>
        </div>
      </header>
      {feedback && (
        <div className="px-4 pb-4 sm:px-5">
          <Message error>{feedback}</Message>
        </div>
      )}
      {issue && (
        <div role="note" aria-label="同步提示" className={sourceIssueStyles}>
          <AlertCircle size={16} className="mt-px shrink-0 text-danger" aria-hidden="true" />
          <p className="min-w-0 [overflow-wrap:anywhere]">
            {issueMessage(source, issue, issueDetail)}
          </p>
          {(source.state === 'auth_error' || issue.startsWith('CREDENTIAL_')) && (
            <a href="/account?tab=credentials" className={sourceLinkStyles}>
              <KeyRound size={14} />
              管理凭据
              <ArrowRight size={13} />
            </a>
          )}
        </div>
      )}
      <div className={sourceCardBodyStyles}>
        <section className="min-w-0">
          <h4 className={sourceSectionTitleStyles}>
            读取目标 <span className="font-mono text-muted-ink">{source.targets.length}</span>
          </h4>
          <ul id={`targets-${source.id}`} className="m-0 list-none divide-y divide-line p-0">
            {targets.map(({ id, kind, slug, path, enabled, last_intake_id }) => (
              <li key={id} className={sourceTargetRowStyles}>
                <span className="flex items-center gap-1.5 text-caption font-medium text-muted-ink">
                  {kind === 'skill' ? <Folder size={15} /> : <FileJson size={15} />}
                  {kind === 'skill' ? 'Skill' : 'MCP'}
                </span>
                <div className="min-w-0">
                  <strong className="block text-body font-semibold [overflow-wrap:anywhere]">
                    {slug}
                  </strong>
                  <code className="block text-caption text-muted-ink [overflow-wrap:anywhere]">
                    {path}
                  </code>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-caption">
                  <span className="whitespace-nowrap text-muted-ink">
                    {enabled ? '已启用' : '已停用'}
                  </span>
                  {last_intake_id && (
                    <button
                      type="button"
                      aria-label={`查看 ${slug} 的上次接收`}
                      className={sourceLinkStyles}
                      onClick={() => onIntake(last_intake_id)}
                    >
                      上次接收
                      <ArrowRight size={13} />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {source.targets.length > 3 && (
            <button
              type="button"
              className={sourceLinkStyles}
              aria-controls={`targets-${source.id}`}
              aria-expanded={allTargets}
              onClick={() => setAllTargets((expanded) => !expanded)}
            >
              <ChevronDown size={13} className={allTargets ? 'rotate-180' : undefined} />
              {allTargets ? '收起目标' : `查看全部 ${source.targets.length} 个目标`}
            </button>
          )}
          {!hasEnabledTarget && (
            <p id={`inactive-targets-${source.id}`} className="mt-1 text-caption text-muted-ink">
              同步需要至少一个启用的读取目标。可在“编辑配置”中启用。
            </p>
          )}
        </section>
        <section className="min-w-0 border-t border-line pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-5">
          <h4 className={sourceSectionTitleStyles}>
            <Clock3 size={14} />
            同步记录
          </h4>
          <dl className={sourceMetaStyles}>
            <dt>上次成功</dt>
            <dd>{source.last_success_at ? dateLabel(source.last_success_at) : '尚未成功同步'}</dd>
            <dt>配置修订</dt>
            <dd className="font-mono">{source.revision}</dd>
            {source.last_observed_commit && (
              <>
                <dt>最近读取</dt>
                <dd>
                  <code title={source.last_observed_commit}>
                    {source.last_observed_commit.slice(0, 12)}
                  </code>
                </dd>
              </>
            )}
          </dl>
          {(blocked || paused) && (
            <p className="mt-2 text-caption text-muted-ink">
              {paused ? '恢复后将继续自动同步。' : '来源已阻断，无法发起同步。'}
            </p>
          )}
        </section>
      </div>
      {jobId && (
        <SourceSyncBatch
          source={source}
          job={job}
          pollError={pollError}
          shownError={issue || undefined}
          onRetry={() => {
            setPollError('');
            setPollRevision((n) => n + 1);
          }}
          onIntake={onIntake}
        />
      )}
    </article>
  );
}
