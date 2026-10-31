import type { AuthStatusResponse, MeResponse } from '@capability-hub/contracts/http';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, mutate, setCsrf } from '../shared/api/client.js';

/** 会话变更使所有旧身份请求失效；迟到响应不能恢复已退出的身份。 */
export function useSession(refresh: number) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [initialized, setInitialized] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sessionGeneration = useRef(0);
  const authenticationRequest = useRef<AbortController | null>(null);
  const clearSession = useCallback(() => {
    sessionGeneration.current++;
    authenticationRequest.current?.abort();
    setMe(null);
    setCsrf('');
    setLoading(false);
  }, []);
  const load = useCallback(async () => {
    authenticationRequest.current?.abort();
    const controller = new AbortController();
    authenticationRequest.current = controller;
    const generation = ++sessionGeneration.current;
    setLoading(true);
    setError('');
    try {
      const status = await api<AuthStatusResponse>('/api/auth/status', {
        signal: controller.signal,
      });
      if (controller.signal.aborted || generation !== sessionGeneration.current) return;
      setInitialized(status.initialized);
      setSetupRequired(status.setup_token_required);
      if (status.initialized) {
        try {
          const user = await api<MeResponse>('/api/me', { signal: controller.signal });
          if (controller.signal.aborted || generation !== sessionGeneration.current) return;
          setMe(user);
          setCsrf(user.csrf_token);
        } catch (e) {
          if (controller.signal.aborted || generation !== sessionGeneration.current) return;
          if (!(e instanceof ApiError) || e.status !== 401) throw e;
          setMe(null);
          setCsrf('');
        }
      } else {
        setMe(null);
        setCsrf('');
      }
    } catch (e) {
      if (!controller.signal.aborted && generation === sessionGeneration.current)
        setError(e instanceof Error ? e.message : '暂时无法连接服务');
    } finally {
      if (!controller.signal.aborted && generation === sessionGeneration.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    window.addEventListener('hub:unauthenticated', clearSession);
    return () => {
      authenticationRequest.current?.abort();
      window.removeEventListener('hub:unauthenticated', clearSession);
    };
  }, [load, clearSession]);
  useEffect(() => {
    if (refresh === 0 || !me?.id) return;
    const controller = new AbortController();
    const generation = sessionGeneration.current;
    void api<MeResponse>('/api/me', { signal: controller.signal })
      .then((user) => {
        if (controller.signal.aborted || generation !== sessionGeneration.current) return;
        setMe(user);
        setCsrf(user.csrf_token);
      })
      .catch((error: unknown) => {
        if (
          !controller.signal.aborted &&
          generation === sessionGeneration.current &&
          error instanceof ApiError &&
          error.status === 401
        )
          clearSession();
      });
    return () => controller.abort();
  }, [refresh, me?.id, clearSession]);
  const logout = useCallback(async () => {
    await mutate('/auth/logout', {});
    clearSession();
  }, [clearSession]);
  return { me, initialized, setupRequired, loading, error, load, logout };
}
