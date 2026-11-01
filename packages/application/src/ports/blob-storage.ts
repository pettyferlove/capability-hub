/** 内容地址为 SHA-256 十六进制摘要，各适配器读取时均校验实际字节。 */
export interface BlobStorage {
  readonly kind: 'filesystem' | 'minio';
  /**
   * 按内容寻址写入并返回摘要：相同字节重复写入必须幂等（内容不可覆盖），
   * 写入完成后要能立即 `read` 回来。
   */
  put(bytes: Buffer): Promise<string>;
  /** 摘要缺失或内容损坏必须抛错（503 `BLOB_MISSING`/`BLOB_CORRUPT`），不能返回空内容。 */
  read(hash: string): Promise<Buffer>;
  /** 只判断是否存在，不做完整性校验，不能替代 `read`。 */
  exists(hash: string): Promise<boolean>;
  health(): Promise<void>;
  close(): Promise<void>;
}

/** 删除能力仅供停机维护工具调用。 */
export interface BlobMaintenance {
  /** 遍历顺序取决于适配器（文件系统即 `readdir` 顺序），且可能跳过非摘要命名的残留文件。 */
  list(): AsyncIterable<{ hash: string; modifiedAt: number }>;
  /** 不做幂等保证：对象不存在时适配器可能直接抛错，调用方需自行容忍。 */
  remove(hash: string): Promise<void>;
}
