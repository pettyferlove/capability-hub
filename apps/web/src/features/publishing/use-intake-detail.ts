import { intakeProgressResponseSchema } from '@capability-hub/contracts';
import type { IntakeResponse } from '@capability-hub/contracts/http';
import { useEffect, useState } from 'react';
import { api } from '../../shared/api/client.js';
import { errorMessage } from '../../shared/api/error-message.js';

/**
 * 详情连接状态：`connecting` 首次加载或仍处处理中、`live` 已收到进度事件、`reconnecting` 传输中断后
 * 浏览器自动重连、`closed` 已终态或出错不再更新。
 */
export type IntakeConnection = 'connecting' | 'live' | 'reconnecting' | 'closed';

/** 详情由 HTTP 读取，处理中的阶段由 SSE 更新；终态重新读取不可变检查证据。 */
export function useIntakeDetail(id: string, refresh: number) {
  const [result, setResult] = useState<{
    id: string;
    data?: IntakeResponse;
    error: string;
    connection: IntakeConnection;
  }>({ id: '', error: '', connection: 'closed' });
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let stream: EventSource | undefined;
    const path = '/api/intakes/' + encodeURIComponent(id);
    const updateError = (error: unknown) => {
      if (!controller.signal.aborted)
        setResult({ id, error: errorMessage(error), connection: 'closed' });
    };
    setResult({ id, error: '', connection: 'connecting' });
    const load = async () => {
      const data = await api<IntakeResponse>(path, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const processing = ['received', 'fetching', 'scanning'].includes(data.state);
      setResult({ id, data, error: '', connection: processing ? 'connecting' : 'closed' });
      if (!processing) return;
      stream = new EventSource(path + '/events');
      stream.addEventListener('progress', (event: MessageEvent<string>) => {
        if (controller.signal.aborted) return;
        try {
          const raw: unknown = JSON.parse(event.data);
          const progress = intakeProgressResponseSchema.parse(raw);
          if (progress.id !== id) throw new Error('处理进度与当前记录不匹配');
          const terminal = ['ready', 'failed', 'cancelled'].includes(progress.state);
          setResult((current) => ({
            ...current,
            data: current.data ? { ...current.data, ...progress } : undefined,
            connection: terminal ? 'closed' : 'live',
          }));
          if (terminal) {
            stream?.close();
            void api<IntakeResponse>(path, { signal: controller.signal })
              .then((detail) => {
                if (!controller.signal.aborted)
                  setResult({ id, data: detail, error: '', connection: 'closed' });
              })
              .catch(updateError);
          }
        } catch {
          stream?.close();
          updateError(new Error('处理进度读取失败，请刷新重试'));
        }
      });
      stream.addEventListener('stream-error', (event: MessageEvent<string>) => {
        if (controller.signal.aborted) return;
        stream?.close();
        let message = '实时进度暂时不可用，请刷新重试';
        try {
          const raw: unknown = JSON.parse(event.data);
          if (raw && typeof raw === 'object' && 'code' in raw && raw.code === 'ACCESS_REVOKED')
            message = '会话或访问权限已变化，请刷新页面';
        } catch {
          // 非预期流错误只显示固定提示，不把传输内容暴露给用户。
        }
        updateError(new Error(message));
      });
      stream.onerror = () => {
        if (controller.signal.aborted) return;
        if (stream?.readyState === EventSource.CLOSED)
          updateError(new Error('实时进度连接已关闭，请刷新重试'));
        else setResult((current) => ({ ...current, connection: 'reconnecting' }));
      };
    };
    void load().catch(updateError);
    return () => {
      controller.abort();
      stream?.close();
    };
  }, [id, refresh]);
  const current = id === result.id;
  return {
    data: current ? result.data : undefined,
    error: current ? result.error : '',
    loading: !!id && (!current || (!result.data && !result.error)),
    connection: current ? result.connection : ('connecting' as const),
  };
}
