/** 内容地址为 SHA-256 十六进制摘要，各适配器读取时均校验实际字节。 */
export interface BlobStorage {
  readonly kind: 'filesystem' | 'minio';
  put(bytes: Buffer): Promise<string>;
  read(hash: string): Promise<Buffer>;
  exists(hash: string): Promise<boolean>;
  health(): Promise<void>;
  close(): Promise<void>;
}

/** 删除能力仅供停机维护工具调用。 */
export interface BlobMaintenance {
  list(): AsyncIterable<{ hash: string; modifiedAt: number }>;
  remove(hash: string): Promise<void>;
}
