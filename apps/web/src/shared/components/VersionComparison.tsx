import type { ManagementAssetResponse } from '@capability-hub/contracts/http';
import { ArrowRight } from '../icons/lucide.js';
import { Glyph } from './Glyph.js';

type Snapshot = NonNullable<ManagementAssetResponse['current_version']>;

export function VersionComparison({
  kind,
  previous,
  candidate,
  previousLabel = '当前发布',
  candidateLabel = '本次快照',
}: {
  kind: ManagementAssetResponse['kind'];
  previous: Snapshot | null;
  candidate: Snapshot;
  previousLabel?: string;
  candidateLabel?: string;
}) {
  const same = previous?.content_digest === candidate.content_digest;
  return (
    <section
      aria-label="内容版本对比"
      className="mt-4 rounded-xl border border-[color:var(--line)] bg-page p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <strong>{!previous ? '首次发布' : same ? '内容未变化' : '内容更新'}</strong>
        <span className="text-muted-ink">{kind === 'skill' ? 'Skill' : 'MCP'} · 同一资产</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <SnapshotView snapshot={previous} kind={kind} label={previousLabel} />
        <ArrowRight size={18} className="text-muted-ink" />
        <SnapshotView
          snapshot={candidate}
          kind={kind}
          label={candidateLabel}
          diffWith={previous?.content_digest}
        />
      </div>
      <p className="text-muted-ink mt-4 mb-0 text-caption leading-relaxed">
        {!previous
          ? '尚无发布基线；审核通过后才会出现在目录中。'
          : same
            ? '内容摘要一致，请继续核对分类、分发受众与使用要求。'
            : '描边标出点阵变化，仅用于识别内容；具体改动以文件差异为准。'}
      </p>
    </section>
  );
}

function SnapshotView({
  snapshot,
  kind,
  label,
  diffWith,
}: {
  snapshot: Snapshot | null;
  kind: ManagementAssetResponse['kind'];
  label: string;
  diffWith?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2 text-center">
      <span className="text-muted-ink text-caption">{label}</span>
      {snapshot ? (
        <>
          <Glyph seed={snapshot.content_digest} kind={kind} size={64} diffWith={diffWith} />
          <strong className="font-mono break-all" title={snapshot.version_label}>
            {snapshot.version_label}
          </strong>
          <code className="text-muted-ink text-caption" title={snapshot.content_digest}>
            {snapshot.content_digest.replace(/^sha256:/, '').slice(0, 8)}
          </code>
        </>
      ) : (
        <span className="flex h-16 items-center text-muted-ink">尚未发布</span>
      )}
    </div>
  );
}
