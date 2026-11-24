import type { VersionSnapshotResponse } from '@capability-hub/contracts/http';
import { useLayoutEffect, useRef, useState } from 'react';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { CodeSkeleton } from '../../shared/components/Skeleton.js';
import { SnapshotSource } from '../../shared/components/SnapshotSource.js';
import { textBtnStyles } from '../../shared/styles/recipes.js';
import { useSnapshotFile } from '../catalog/use-snapshot-file.js';
import { EvaluationPanel } from '../evaluation/EvaluationPanel.js';

/** 接收记录的证据经管理接口读取，未发布版本也使用其自身的快照。 */
export function IntakeEvaluation({
  version,
  refresh,
}: {
  version: VersionSnapshotResponse;
  refresh: number;
}) {
  const [evidence, setEvidence] = useState<{ path: string; line?: number; visit: number }>();
  const preview = useSnapshotFile(version.id, evidence?.path ?? null, refresh, true);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    if (!evidence) return;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: 'nearest' });
  }, [evidence]);
  return (
    <>
      <EvaluationPanel
        kind="intake"
        versionId={version.id}
        refresh={refresh}
        onEvidence={(path, line) => {
          if (version.manifest.files.some((file) => file.path === path))
            setEvidence((previous) => ({ path, line, visit: (previous?.visit ?? 0) + 1 }));
        }}
      />
      {evidence && (
        <section
          aria-label={'文件内容 ' + evidence.path}
          className="min-w-0 rounded-lg border border-line bg-paper"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
            <h4 ref={heading} tabIndex={-1} className="min-w-0 break-all font-mono text-label">
              {evidence.path}
            </h4>
            <a
              className={textBtnStyles}
              href={`/api/management/versions/${version.id}/files?path=${encodeURIComponent(evidence.path)}`}
            >
              下载原文件
            </a>
          </div>
          {preview.loading ? (
            <CodeSkeleton />
          ) : preview.error ? (
            <ErrorState
              message={preview.error}
              {...preview.errorProps}
              retry={preview.unavailable ? undefined : preview.retry}
            />
          ) : (
            <SnapshotSource
              key={evidence.visit}
              text={preview.text ?? ''}
              line={evidence.line}
              focusOnOpen
              className="max-h-96 overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-caption leading-relaxed"
            />
          )}
        </section>
      )}
    </>
  );
}
