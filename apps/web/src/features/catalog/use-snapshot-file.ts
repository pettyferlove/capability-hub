import { useEffect, useState } from 'react';
import { fileText, PreviewUnavailable } from '../../shared/api/client.js';

interface SnapshotFile {
  key: string;
  text: string;
  refresh: number;
}
interface SnapshotRequest {
  key: string;
  refresh: number;
  attempt: number;
  error?: string;
  unavailable?: boolean;
}

export function snapshotFileView(
  key: string,
  refresh: number,
  attempt: number,
  cache: SnapshotFile[],
  request?: SnapshotRequest,
) {
  const cached = key ? cache.find((entry) => entry.key === key) : undefined;
  const failure =
    key && request?.key === key && request.refresh === refresh && request.attempt === attempt
      ? request
      : undefined;
  const pending = !!key && cached?.refresh !== refresh && !failure?.error;
  return {
    text: cached?.text,
    loading: pending && !cached,
    refreshing: pending && !!cached,
    error: failure?.error ?? '',
    unavailable: !!failure?.unavailable,
  };
}

/** 抽屉内按固定版本和路径缓存，重新校验同一文件时保留正文。 */
export function useSnapshotFile(version: string, path: string | null, refresh: number) {
  const [cache, setCache] = useState<SnapshotFile[]>([]);
  const [request, setRequest] = useState<SnapshotRequest>();
  const [attempt, setAttempt] = useState(0);
  const key = path === null ? '' : `${version}:${path}`;
  const cached = cache.find((entry) => entry.key === key);
  useEffect(() => {
    if (!path || cached?.refresh === refresh) return;
    const controller = new AbortController();
    setRequest({ key, refresh, attempt });
    fileText(version, path, false, controller.signal)
      .then((text) => {
        if (controller.signal.aborted) return;
        setCache((entries) => [
          ...entries.filter((entry) => entry.key !== key).slice(-7),
          { key, refresh, text },
        ]);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRequest({
          key,
          refresh,
          attempt,
          error: error instanceof Error ? error.message : '文件读取失败',
          unavailable: error instanceof PreviewUnavailable,
        });
      });
    return () => controller.abort();
  }, [version, path, key, refresh, cached, attempt]);
  return {
    ...snapshotFileView(key, refresh, attempt, cache, request),
    retry: () => setAttempt((value) => value + 1),
  };
}
