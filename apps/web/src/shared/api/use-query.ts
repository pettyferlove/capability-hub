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

/**
 * 由「请求描述 + 已取回的资源」推导渲染所需状态，不发起请求，因此可在测试里单独构造。
 * 只有当请求的 `path` 与 `refresh` 都与当前一致才算当前请求的结论：换 `path` 后旧结果与旧错误都不再透出，
 * 避免把上一个查询的错误显示在新页面上。
 * `isPreviousData` 仅在 `keepPreviousData` 且新结果未到时为真，此时 `data` 仍是上一份数据、
 * `refreshing` 也为真——集合可以这样过渡，实体详情不要依赖它，否则会短暂显示别的实体。
 */
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

/**
 * 极简 GET 查询：依赖 `path` 与 `refresh`，任一变化都重新请求并 abort 上一个，迟到的响应被丢弃，
 * 因此快速切页或连续刷新不会出现旧数据覆盖新数据。
 * `path` 为 `null` 表示条件未就绪（如未登录、未选中对象），此时清空数据且不发请求；
 * 递增 `refresh` 是唯一的显式重取手段，同一个 `path` 不会自行轮询。
 */
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
