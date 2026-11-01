const previewLimit = 256 * 1024;
const tooLarge = '文件超过 256 KiB，请下载完整文件查看';

/**
 * 预览超过 256 KiB 时抛出：调用方应引导用户改用下载链接，
 * 而不是把它当作加载失败展示。
 */
export class PreviewUnavailable extends Error {}

/** 预览超限后立即停止读取，完整内容通过下载链接交付。 */
export async function readPreviewText(response: Response): Promise<string> {
  if (Number(response.headers.get('content-length')) > previewLimit) {
    await response.body?.cancel().catch(() => {});
    throw new PreviewUnavailable(tooLarge);
  }
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > previewLimit) {
        await reader.cancel().catch(() => {});
        throw new PreviewUnavailable(tooLarge);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error('Binary');
    return text;
  } catch {
    throw new PreviewUnavailable('二进制文件，请下载查看');
  }
}
