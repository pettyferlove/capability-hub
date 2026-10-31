import { useEffect, useState } from 'react';
import { api } from './client.js';
interface Resource<T> {
  path: string;
  data: T;
}
interface QueryRequest {
  path: string;
  refresh: number;
  status: 'pending' | 'success' | 'error';
  error?: string;
}
interface QueryOptions {
  /** 集合筛选可保留更新前的结果；实体详情不得复用其他实体的数据。 */
  keepPreviousData?: boolean;
}

export function queryView<T>(
  path: string | null,
  refresh: number,
  resource: Resource<T> | undefined,
  request: QueryRequest | undefined,
  { keepPreviousData = false }: QueryOptions = {},
) {
  const matches = !!path && request?.path === path && request?.refresh === refresh;
  const pending = !!path && (!matches || request?.status === 'pending');
  const current = !!path && resource?.path === path;
  const isPreviousData = !!path && !!resource && !current && keepPreviousData && pending;
  const hasData = current || isPreviousData;
  return {
    data: hasData ? resource?.data : undefined,
    error: matches ? (request?.error ?? '') : '',
    loading: pending,
    refreshing: hasData && pending,
    isPreviousData,
  };
}

/** 集合页面显式选择保留前页结果，旧请求不能覆盖当前查询。 */
export function useQuery<T>(path: string | null, refresh = 0, options: QueryOptions = {}) {
  const [resource, setResource] = useState<Resource<T>>();
  const [request, setRequest] = useState<QueryRequest>();
  useEffect(() => {
    if (!path) {
      setResource(undefined);
      setRequest(undefined);
      return;
    }
    const controller = new AbortController();
    setRequest({ path, refresh, status: 'pending' });
    api<T>(path, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setResource({ path, data });
        setRequest({ path, refresh, status: 'success' });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRequest({
          path,
          refresh,
          status: 'error',
          error: error instanceof Error ? error.message : '请求失败，请稍后重试',
        });
      });
    return () => controller.abort();
  }, [path, refresh]);
  return queryView(path, refresh, resource, request, options);
}
