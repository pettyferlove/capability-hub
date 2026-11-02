import type { IntakeResponse, SourceResponse } from '@capability-hub/contracts/http';
import { useState } from 'react';
import { useQuery } from '../../shared/api/use-query.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { Empty } from '../../shared/components/Empty.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { DetailSkeleton, ListSkeleton } from '../../shared/components/Skeleton.js';
import { useHub } from '../../shared/context/HubContext.js';
import { FolderGit2, Globe, KeyRound, Plus } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { btnStyles, btnPrimaryStyles, countPillStyles } from '../../shared/styles/recipes.js';
import { IntakeDetail } from '../publishing/IntakeDetail.js';
import { publishIntakeBodyStyles } from '../publishing/styles.js';
import { SourceCard } from './SourceCard.js';
import { SourceEditor } from './SourceEditor.js';
import { sourceLinkStyles } from './styles.js';

type SourceSheet =
  { kind: 'editor'; source: SourceResponse | null } | { kind: 'intake'; id: string };

/** 来源按仓库展示，配置与接收详情在抽屉中打开，列表保留各仓库的同步进度。 */
export default function SourcesPanel() {
  const { refresh, reload, me } = useHub();
  const { data, error, loading } = useQuery<SourceResponse[]>('/api/sources', refresh);
  const [sheet, setSheet] = useState<SourceSheet>();
  const intake = useQuery<IntakeResponse>(
    sheet?.kind === 'intake' ? '/api/intakes/' + encodeURIComponent(sheet.id) : null,
    refresh,
  );
  const openEditor = (source: SourceResponse | null) => setSheet({ kind: 'editor', source });
  const close = () => setSheet(undefined);
  const editorTitle = sheet?.kind === 'editor' && sheet.source ? '编辑 Git 来源' : '新增 Git 来源';
  const hosts = me?.features.git_hosts ?? [];
  return (
    <section aria-labelledby="git-source-list" className="grid min-w-0 gap-4">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="grid min-w-0 gap-2">
          <div className="flex items-center gap-2">
            <h2 id="git-source-list" className="text-section font-semibold">
              仓库来源
            </h2>
            {data && <span className={countPillStyles}>{data.length}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-ink">
            <Globe size={14} aria-hidden="true" />
            <span>允许域名</span>
            {hosts.length ? (
              hosts.map((host) => (
                <code key={host} className="min-w-0 [overflow-wrap:anywhere]">
                  {host}
                </code>
              ))
            ) : (
              <span>尚未配置</span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a className={sourceLinkStyles} href="/account?tab=credentials">
            <KeyRound size={14} />
            Git 凭据
          </a>
          <button className={cn(btnStyles, btnPrimaryStyles)} onClick={() => openEditor(null)}>
            <Plus size={16} />
            新增来源
          </button>
        </div>
      </header>
      {error && <ErrorState message={error} retry={reload} />}
      {loading && !data ? (
        <ListSkeleton label="正在加载 Git 来源…" rows={2} />
      ) : data?.length ? (
        <div className="grid min-w-0 gap-4">
          {data.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              onEdit={() => openEditor(source)}
              onIntake={(id) => setSheet({ kind: 'intake', id })}
            />
          ))}
        </div>
      ) : (
        !error && (
          <Empty title="还没有 Git 来源" icon={<FolderGit2 size={26} />}>
            点击“新增来源”，指定仓库、分支和 Skill 目录或 MCP 描述文件的路径。
          </Empty>
        )
      )}
      <Overlay
        open={!!sheet}
        onClose={close}
        variant="sheet"
        label={sheet?.kind === 'intake' ? '接收详情' : editorTitle}
        size={sheet?.kind === 'intake' ? 'workspace' : 'default'}
        loadingKey={sheet?.kind === 'intake' ? sheet.id : editorTitle}
      >
        {sheet?.kind === 'editor' && (
          <SourceEditor
            source={sheet.source}
            onClose={close}
            onSaved={() => {
              close();
              reload();
            }}
          />
        )}
        {sheet?.kind === 'intake' && (
          <>
            <DialogTitle title="接收详情" onClose={close} />
            <div className={publishIntakeBodyStyles} data-intake-scroll>
              {intake.error ? (
                <ErrorState message={intake.error} retry={reload} />
              ) : intake.data ? (
                <IntakeDetail
                  key={intake.data.id}
                  intake={intake.data}
                  onSelect={(id) => (id ? setSheet({ kind: 'intake', id }) : close())}
                />
              ) : (
                <DetailSkeleton />
              )}
            </div>
          </>
        )}
      </Overlay>
    </section>
  );
}
