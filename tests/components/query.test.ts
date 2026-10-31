import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useQuery } from '../../apps/web/src/shared/api/use-query.js';
import { readPreviewText, PreviewUnavailable } from '../../apps/web/src/shared/api/preview.js';
import { deferred } from '../support/store.js';

afterEach(cleanup);

test('切换查询会取消旧请求，后到的旧结果不能覆盖当前资源', async (context) => {
  const requests: {
    response: ReturnType<typeof deferred<Response>>;
    signal?: AbortSignal | null;
  }[] = [];
  context.mock.method(globalThis, 'fetch', (_path: string, options?: RequestInit) => {
    const response = deferred<Response>();
    requests.push({ response, signal: options?.signal });
    return response.promise;
  });
  const hook = renderHook(({ path }) => useQuery<{ name: string }>(path), {
    initialProps: { path: '/api/assets/first' },
  });
  assert.equal(requests.length, 1);
  hook.rerender({ path: '/api/assets/second' });
  assert.equal(requests[0].signal?.aborted, true);
  await act(async () => {
    requests[1].response.resolve(Response.json({ name: '第二项' }));
  });
  await waitFor(() => assert.equal(hook.result.current.data?.name, '第二项'));
  await act(async () => {
    requests[0].response.resolve(Response.json({ name: '迟到的第一项' }));
  });
  assert.equal(hook.result.current.data?.name, '第二项');
  hook.unmount();
  assert.equal(requests[1].signal?.aborted, true);
});

test('集合更新时可保留前页并标记不可操作，请求失败或关闭查询后清除前页', async (context) => {
  const pending: ReturnType<typeof deferred<Response>>[] = [];
  context.mock.method(globalThis, 'fetch', () => {
    const request = deferred<Response>();
    pending.push(request);
    return request.promise;
  });
  const hook = renderHook(
    ({ path }) => useQuery<{ items: string[] }>(path, 0, { keepPreviousData: true }),
    { initialProps: { path: '/api/assets?page=1' as string | null } },
  );
  await act(async () => {
    pending[0].resolve(Response.json({ items: ['第一项'] }));
  });
  hook.rerender({ path: '/api/assets?page=2' });
  assert.deepEqual(hook.result.current.data?.items, ['第一项']);
  assert.equal(hook.result.current.isPreviousData, true);
  await act(async () => {
    pending[1].resolve(
      Response.json({ error: { code: 'TEST_FAILURE', message: '读取失败' } }, { status: 503 }),
    );
  });
  assert.equal(hook.result.current.data, undefined);
  assert.equal(hook.result.current.error, '读取失败');
  hook.rerender({ path: null });
  assert.equal(hook.result.current.data, undefined);
  assert.equal(hook.result.current.loading, false);
});

test('文件预览按真实流体积取消过大响应，保留 UTF-8 文本并拒绝二进制', async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(256 * 1024 + 1));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(() => readPreviewText(new Response(stream)), PreviewUnavailable);
  assert.equal(cancelled, true);
  assert.equal(await readPreviewText(new Response('中文内容')), '中文内容');
  await assert.rejects(
    () => readPreviewText(new Response(new Uint8Array([0xff, 0x00]))),
    PreviewUnavailable,
  );
});
