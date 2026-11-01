/**
 * Git 来源管理面板：登记仓库/分支与精确读取目标，触发同步并跟踪同步任务。
 * 依赖 `/api/sources`、`PATCH /api/sources/:id`（带 `revision` 做乐观并发）、
 * `/api/sources/:id/sync` 与 `/api/sources/:id/sync-jobs/:jobId` 轮询，
 * 以及 `/api/intakes/:id` 查看同步产出的待审核内容。
 */
import {
  formStackStyles,
  sectionHeadingStyles,
  subtleStyles,
  btnStyles,
  btnPrimaryStyles,
  sourceGridStyles,
  panelStyles,
  monoStyles,
  tagStyles,
  tagRedStyles,
  tagTealStyles,
  sourceActionsStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import {
  sourceCardStyles,
  sourceTopStyles,
  sourceIconStyles,
  sourceTargetsStyles,
  sourceStatusStyles,
  breakAllStyles,
  jobTargetStyles,
} from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { SourceEditor } from './SourceEditor.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type { IntakeResponse, SourceResponse } from '@capability-hub/contracts/http';
import type { SourceSyncJobResponse } from '@capability-hub/contracts/http';
import {
  ArrowRight,
  FolderGit2,
  GitBranch,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
} from '../../shared/icons/lucide.js';
import { useEffect, useState } from 'react';
import { api, mutate } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { Empty } from '../../shared/components/Empty.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { CardGridSkeleton, DetailSkeleton } from '../../shared/components/Skeleton.js';
import { useHub } from '../../shared/context/HubContext.js';
import { dateLabel, stateLabel } from '../../shared/format/labels.js';
import { IntakeDetail } from '../publishing/IntakeDetail.js';

/**
 * 同步任务处于 `queued`/`running` 时每 2 秒轮询一次，进入终态才停止并重载列表；
 * 卸载或切换任务时 abort 请求并清掉定时器，避免旧任务的响应覆盖新状态。
 * 暂停/恢复走 `PATCH` 并携带 `revision`，缓存过期会被服务端拒绝，需重载后重试。
 */
export default function SourcesPanel() {
  const { refresh, reload, me } = useHub();
  const { data, error, loading } = useQuery<SourceResponse[]>('/api/sources', refresh);
  const [edit, setEdit] = useState<SourceResponse | null>(),
    [feedback, setFeedback] = useState(''),
    [busy, setBusy] = useState(''),
    [job, setJob] = useState<SyncProgress>(),
    [intakeId, setIntakeId] = useState('');
  const intakeQuery = useQuery<IntakeResponse>(
    intakeId ? '/api/intakes/' + encodeURIComponent(intakeId) : null,
    refresh,
  );
  useEffect(() => {
    if (!job?.job_id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await api<SourceSyncJobResponse>(
          `/api/sources/${job.source_id}/sync-jobs/${job.job_id}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setJob((current) => (current?.job_id === job.job_id ? { ...current, ...result } : current));
        if (['queued', 'running'].includes(result.state))
          timer = setTimeout(() => {
            void poll();
          }, 2000);
        else reload();
      } catch (error) {
        if (!controller.signal.aborted) setFeedback(errorMessage(error));
      }
    };
    timer = setTimeout(() => {
      void poll();
    }, 2000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [job?.job_id, job?.source_id, reload]);

  async function action(s: SourceResponse, type: string) {
    setFeedback('');
    setBusy(s.id);
    try {
      if (type === 'sync') {
        const result = await mutate<{ job_id: string }>(`/api/sources/${s.id}/sync`, {});
        setJob({ ...result, source_id: s.id, state: 'queued' });
        setIntakeId('');
      } else
        await mutate(
          `/api/sources/${s.id}`,
          { state: s.state === 'paused' ? 'active' : 'paused' },
          'PATCH',
          s.revision,
        );
      reload();
    } catch (e) {
      setFeedback(errorMessage(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <div className={formStackStyles}>
      <div className={sectionHeadingStyles}>
        <div>
          <h2>Git 来源</h2>
          <p className={subtleStyles}>在平台登记精确读取目标，保存后生效，无需修改源仓库。</p>
        </div>
        <button className={cn(btnStyles, btnPrimaryStyles)} onClick={() => setEdit(null)}>
          <Plus size={16} />
          新增来源
        </button>
      </div>
      <Message>
        允许域名：{me?.features.git_hosts.join('、') || '尚未配置'}
        。仅收录登记目标，不自动发现整个仓库。当前使用明确批准受众。
      </Message>
      {feedback && <Message error>{feedback}</Message>}
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading && !data ? (
        <CardGridSkeleton label="正在加载 Git 来源…" count={2} variant="source" />
      ) : !data?.length ? (
        <Empty
          title="连接团队的内容正本"
          action={
            <button className={btnStyles} onClick={() => setEdit(null)}>
              <Plus size={16} />
              登记第一个仓库
            </button>
          }
        >
          指定仓库、分支和 Skill 目录或 server.json 路径，首次同步后仍需确认并提交审核。
        </Empty>
      ) : (
        <div className={sourceGridStyles}>
          {data.map((s) => (
            <section key={s.id} className={cn(panelStyles, sourceCardStyles)}>
              <div className={sourceTopStyles}>
                <span className={sourceIconStyles}>
                  <FolderGit2 size={24} />
                </span>
                <div>
                  <h3>{s.repository_identity}</h3>
                  <span className={cn(subtleStyles, monoStyles)}>
                    <GitBranch size={13} />
                    {s.branch}
                  </span>
                </div>
                <span
                  className={cn(
                    tagStyles,
                    s.state === 'auth_error'
                      ? tagRedStyles
                      : s.state === 'active'
                        ? tagTealStyles
                        : '',
                  )}
                >
                  {stateLabel(s.state)}
                </span>
              </div>
              <div className={sourceTargetsStyles}>
                {s.targets.map((t) => (
                  <div key={t.id}>
                    <span className={tagStyles}>{t.kind === 'skill' ? 'Skill' : 'MCP'}</span>
                    <div>
                      <strong>{t.slug}</strong>
                      <code>{t.path}</code>
                    </div>
                    <small>{t.enabled ? '已启用' : '已停用'}</small>
                  </div>
                ))}
              </div>
              <div className={sourceStatusStyles}>
                <span>
                  修订 {s.revision} · {s.targets.length} 个目标
                </span>
                <span>
                  {s.last_success_at ? '上次成功 ' + dateLabel(s.last_success_at) : '尚未成功同步'}
                </span>
              </div>
              {s.last_error_code && (
                <Message error>
                  {s.last_error_code === 'GIT_AUTH_ERROR'
                    ? '来源认证或主机身份校验失败，请核对凭据与服务器公钥后重试。'
                    : ((
                        {
                          CREDENTIAL_UNAVAILABLE:
                            '凭据已过期、撤销或所属账号停用，请在个人中心维护后重试。',
                          CREDENTIAL_MISMATCH:
                            '凭据的域名或认证方式与仓库不匹配，请编辑来源重新选择。',
                          CREDENTIAL_CHANGED: '同步期间凭据已轮换，请重新同步。',
                          CREDENTIAL_DECRYPTION: '无法解密凭据，请检查实例密钥或在个人中心轮换。',
                          SSH_CREDENTIAL_REQUIRED: '此来源需要选择个人 SSH 凭据。',
                        } as Record<string, string>
                      )[s.last_error_code] ?? s.last_error_code)}
                </Message>
              )}
              <div className={sourceActionsStyles}>
                <button className={btnStyles} disabled={busy === s.id} onClick={() => setEdit(s)}>
                  <Pencil size={14} />
                  编辑配置
                </button>
                <button
                  className={btnStyles}
                  disabled={busy === s.id || s.state === 'blocked'}
                  onClick={() => action(s, 'pause')}
                >
                  {s.state === 'paused' ? <Play size={14} /> : <Pause size={14} />}{' '}
                  {s.state === 'paused' ? '恢复' : '暂停'}
                </button>
                <button
                  className={cn(btnStyles, btnPrimaryStyles)}
                  disabled={busy === s.id || ['paused', 'blocked'].includes(s.state)}
                  onClick={() => action(s, 'sync')}
                >
                  <RefreshCw size={14} />
                  同步
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
      {job && (
        <section className={panelStyles}>
          <h3>
            同步批次 <span className={tagStyles}>{stateLabel(job.state)}</span>
          </h3>
          {job.last_error_code && (
            <Message error>{job.error_message ?? job.last_error_code}</Message>
          )}
          {job.result?.origin_commit && (
            <p className={cn(monoStyles, breakAllStyles)}>固定提交：{job.result.origin_commit}</p>
          )}
          {job.result?.targets?.map((t) => (
            <div className={jobTargetStyles} key={t.binding_id}>
              <span className={tagStyles}>{stateLabel(t.state)}</span>
              <span>{t.error_code ?? t.binding_id.slice(0, 8)}</span>
              <button className={textBtnStyles} onClick={() => setIntakeId(t.intake_id)}>
                查看接收结果
                <ArrowRight size={14} />
              </button>
            </div>
          ))}
        </section>
      )}
      {intakeId && (
        <section className={panelStyles}>
          {intakeQuery.error ? (
            <ErrorState message={intakeQuery.error} retry={reload} />
          ) : intakeQuery.data ? (
            <IntakeDetail intake={intakeQuery.data} />
          ) : (
            <DetailSkeleton />
          )}
        </section>
      )}
      <Overlay
        open={edit !== undefined}
        onClose={() => setEdit(undefined)}
        label={edit ? '编辑 Git 来源' : '新增 Git 来源'}
        variant="sheet"
      >
        {edit !== undefined && (
          <SourceEditor
            source={edit}
            onClose={() => setEdit(undefined)}
            onSaved={() => {
              setEdit(undefined);
              reload();
            }}
          />
        )}
      </Overlay>
    </div>
  );
}

type SyncProgress = {
  job_id: string;
  source_id: string;
  state: SourceSyncJobResponse['state'];
  result?: SourceSyncJobResponse['result'];
  last_error_code?: string;
  error_message?: string;
};
