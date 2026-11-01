import { useRef } from 'react';
import { api } from '../../shared/api/client.js';

/**
 * 返回提交 AI 命令的 POST 封装：`path`、序列化后的 `body` 与 `revision` 三者都相同的重试复用同一个
 * `Idempotency-Key`，只有请求成功返回或输入变化后才换新键，避免响应丢失导致重复落库；传入
 * `revision` 时附带 `If-Match` 头做乐观锁，版本落后由服务端以 409 拒绝。失败会原样抛出，
 * 调用方必须自行展示错误。
 */
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
