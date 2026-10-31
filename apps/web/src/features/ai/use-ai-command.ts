import { useRef } from 'react';
import { api } from '../../shared/api/client.js';

export function useAiCommand() {
  const retry = useRef<{ signature: string; key: string } | null>(null);
  return async <T = unknown>(path: string, body: unknown, revision?: number): Promise<T> => {
    const serialized = JSON.stringify(body);
    const signature = JSON.stringify([path, serialized, revision]);
    if (retry.current?.signature !== signature)
      retry.current = { signature, key: crypto.randomUUID() };
    const command = retry.current;
    const headers = new Headers({ 'Idempotency-Key': command.key });
    if (revision !== undefined) headers.set('If-Match', `"${revision}"`);
    const result = await api<T>(path, { method: 'POST', body: serialized, headers });
    // 响应丢失时保留原请求的键；修改输入或确认收到成功响应后才开启新命令。
    if (retry.current === command) retry.current = null;
    return result;
  };
}
