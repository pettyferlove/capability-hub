import { sha256 } from '@capability-hub/domain/canonical';
import { fail, HubError } from '@capability-hub/domain/errors';
import type { BlobStorage } from '@capability-hub/application/ports';
import { Client, type ClientOptions } from 'minio';
import * as http from 'node:http';
import * as https from 'node:https';
const maxBytes = 128 * 1024 * 1024;
const missing = (error: unknown) =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  ['NoSuchKey', 'NoSuchObject', 'NotFound'].includes(String(error.code));

function storageError(error: unknown): Error {
  if (error instanceof HubError) return error;
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const retryable = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENOTFOUND',
    'EPIPE',
    'ECONNABORTED',
    'RequestTimeout',
    'SlowDown',
    'ServiceUnavailable',
    'InternalError',
  ].includes(code);
  const failure = new HubError(
    503,
    'OBJECT_STORAGE_UNAVAILABLE',
    '对象存储暂不可用，请稍后重试',
    {},
    retryable,
  );
  failure.cause = error;
  return failure;
}

/** 私有 S3 存储桶，内容交付统一经过应用授权。 */
export class MinioBlobStore implements BlobStorage {
  readonly kind = 'minio';
  private readonly client: Client;
  private readonly agent: http.Agent;
  private closed = false;
  constructor(
    options: ClientOptions,
    readonly bucket: string,
    readonly prefix = 'blobs/',
  ) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid MinIO bucket');
    if (prefix && !/^[a-zA-Z0-9/_-]+\/$/.test(prefix)) throw new Error('Invalid MinIO prefix');
    const transport = options.useSSL === false ? http : https;
    this.agent = new transport.Agent({
      keepAlive: true,
      maxSockets: 16,
      maxFreeSockets: 4,
      // 空闲连接提前回收，活动请求另行设置超时。
      timeout: 5000,
    });
    this.client = new Client({
      ...options,
      transportAgent: this.agent,
      // 单个内容块使用条件 PUT，避免分片上传引入额外存储权限。
      partSize: maxBytes,
      transport: {
        request: ((
          requestOptions: http.RequestOptions,
          callback?: (response: http.IncomingMessage) => void,
        ) => {
          const request = transport.request(requestOptions, callback);
          request.setTimeout(15000, () =>
            request.destroy(
              Object.assign(new Error('Object storage request timed out'), { code: 'ETIMEDOUT' }),
            ),
          );
          return request;
        }) as typeof http.request,
      },
    });
  }
  private assertOpen(): void {
    if (this.closed) throw new Error('Object storage is closed');
  }
  private key(hash: string): string {
    this.assertOpen();
    if (!/^[a-f0-9]{64}$/.test(hash)) fail(500, 'BLOB_REFERENCE', '无效存储引用');
    return this.prefix + hash;
  }
  async put(bytes: Buffer): Promise<string> {
    if (bytes.length > maxBytes) fail(413, 'BLOB_LIMIT', '内容超过存储大小限制');
    const hash = sha256(bytes);
    try {
      await this.client.putObject(this.bucket, this.key(hash), bytes, bytes.length, {
        'Content-Type': 'application/octet-stream',
        'X-Amz-Meta-Sha256': hash,
        'If-None-Match': '*',
      });
    } catch (error) {
      if (!(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'PreconditionFailed'
      ))
        throw storageError(error);
    }
    // 已存在的内容损坏时报告错误，不自动覆盖修复。
    await this.read(hash);
    return hash;
  }
  async read(hash: string): Promise<Buffer> {
    const key = this.key(hash);
    let stream;
    try {
      stream = await this.client.getObject(this.bucket, key);
    } catch (error) {
      if (missing(error)) fail(503, 'BLOB_MISSING', '内容暂不可用，请联系管理员');
      throw storageError(error);
    }
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for await (const chunk of stream) {
        const value: unknown = chunk;
        if (!(value instanceof Uint8Array)) fail(503, 'BLOB_CORRUPT', '对象存储返回了无效内容');
        const bytes = Buffer.from(value);
        size += bytes.length;
        if (size > maxBytes) {
          stream.destroy();
          fail(503, 'BLOB_CORRUPT', '内容完整性校验失败');
        }
        chunks.push(bytes);
      }
    } catch (error) {
      throw storageError(error);
    } finally {
      stream.destroy();
    }
    const bytes = Buffer.concat(chunks);
    if (sha256(bytes) !== hash) fail(503, 'BLOB_CORRUPT', '内容完整性校验失败');
    return bytes;
  }
  async exists(hash: string): Promise<boolean> {
    try {
      await this.read(hash);
      return true;
    } catch (error) {
      if (error instanceof HubError && ['BLOB_MISSING', 'BLOB_CORRUPT'].includes(error.code))
        return false;
      throw error;
    }
  }
  async health(): Promise<void> {
    this.assertOpen();
    try {
      if (!(await this.client.bucketExists(this.bucket)))
        throw new HubError(503, 'OBJECT_STORAGE_UNAVAILABLE', '对象存储桶不存在');
    } catch (error) {
      throw storageError(error);
    }
    await this.read(await this.put(Buffer.from('capability-hub-readiness')));
  }
  close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      this.agent.destroy();
    }
    return Promise.resolve();
  }
  async *list() {
    this.assertOpen();
    const stream = this.client.listObjectsV2(this.bucket, this.prefix, true);
    try {
      for await (const item of stream) {
        const value: unknown = item;
        if (
          !value ||
          typeof value !== 'object' ||
          !('name' in value) ||
          typeof value.name !== 'string' ||
          !('lastModified' in value) ||
          !(value.lastModified instanceof Date)
        )
          throw new Error('Invalid object storage listing');
        const hash = value.name.slice(this.prefix.length);
        if (/^[a-f0-9]{64}$/.test(hash)) yield { hash, modifiedAt: value.lastModified.getTime() };
      }
    } finally {
      stream.destroy();
    }
  }
  async remove(hash: string): Promise<void> {
    const key = this.key(hash);
    try {
      await this.client.removeObject(this.bucket, key);
    } catch (error) {
      throw storageError(error);
    }
  }
}
