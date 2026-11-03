import type { ManagementAssetResponse } from '@capability-hub/contracts/http';
import { ArrowRight } from '../icons/lucide.js';
import { cn } from '../styles/cn.js';
import { Glyph } from './Glyph.js';
import { VersionLabel } from './VersionLabel.js';

type Snapshot = NonNullable<ManagementAssetResponse['current_version']>;

/**
 * 审核用的版本对比：两版点阵同源于 `content_digest`，因此「内容未变化」（摘要相同）时不会出现描边，
 * 有差异也只有点阵描边——它只提示「变了」，具体改动仍以文件差异为准。
 * `previous` 为空表示首次发布，此时左侧显示「尚未发布」而不是隐藏整栏，以保持左右可对齐阅读。
 */
export function VersionComparison({
  kind,
  previous,
  candidate,
  previousLabel = '当前发布',
  candidateLabel = '本次快照',
  compact = false,
}: {
  /** 资产类型，决定点阵配色（skill/mcp）与文案；必须与候选版本本身的类型一致。 */
  kind: ManagementAssetResponse['kind'];
  /** 当前已发布快照；`null` 表示尚无基线。 */
  previous: Snapshot | null;
  /** 待审核的候选快照，必有值。 */
  candidate: Snapshot;
  /** 左栏标签，缺省「当前发布」；不同审核场景（如对比上一候选）可改写。 */
  previousLabel?: string;
  /** 右栏标签，缺省「本次快照」。 */
  candidateLabel?: string;
  compact?: boolean;
}) {
  const same = previous?.content_digest === candidate.content_digest;
  return (
    <section
      aria-label="内容版本对比"
      className={cn(
        'rounded-xl border border-[color:var(--line)] bg-page',
        compact ? 'mt-3 px-3 py-2' : 'mt-4 p-4',
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-2',
          compact ? 'mb-1' : 'mb-4',
        )}
      >
        <strong>{!previous ? '首次发布' : same ? '内容未变化' : '内容更新'}</strong>
        <span className="text-muted-ink">{kind === 'skill' ? 'Skill' : 'MCP'} · 同一资产</span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <SnapshotView snapshot={previous} kind={kind} label={previousLabel} compact={compact} />
        <ArrowRight size={18} className="text-muted-ink" />
        <SnapshotView
          snapshot={candidate}
          kind={kind}
          label={candidateLabel}
          diffWith={previous?.content_digest}
          compact={compact}
        />
      </div>
      <p
        className={cn(
          'mb-0 text-caption leading-relaxed text-muted-ink',
          compact ? 'mt-1' : 'mt-4',
        )}
      >
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
  compact,
}: {
  snapshot: Snapshot | null;
  kind: ManagementAssetResponse['kind'];
  label: string;
  diffWith?: string;
  compact: boolean;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center',
        compact
          ? 'justify-center gap-2.5 max-sm:flex-col max-sm:self-start max-sm:gap-1'
          : 'flex-col gap-2 text-center',
      )}
    >
      <span className="shrink-0 text-muted-ink text-caption">{label}</span>
      {snapshot ? (
        <div className={compact ? 'flex min-w-0 items-center gap-2' : 'contents'}>
          <Glyph
            seed={snapshot.content_digest}
            kind={kind}
            size={compact ? 32 : 64}
            diffWith={diffWith}
          />
          <div className={compact ? 'flex min-w-0 flex-wrap items-baseline gap-x-2' : 'contents'}>
            <strong className="font-mono break-all">
              <VersionLabel value={snapshot.version_label} />
            </strong>
            <code className="text-muted-ink text-caption" title={snapshot.content_digest}>
              {snapshot.content_digest.replace(/^sha256:/, '').slice(0, 8)}
            </code>
          </div>
        </div>
      ) : (
        <span className={cn('flex items-center text-muted-ink', !compact && 'h-16')}>尚未发布</span>
      )}
    </div>
  );
}
