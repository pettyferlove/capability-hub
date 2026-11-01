import type { ContentFile, ContentInspection } from '@capability-hub/domain/content';

/**
 * 扫描输入二选一：已有的文件清单（来自 Git 快照）或待解包的原始字节（来自网页上传），
 * 两个分支互斥，同时给出属于调用方错误。
 */
export type ScanInput = { kind: 'skill' | 'mcp'; slug: string } & (
  { files: ContentFile[]; bytes?: never } | { bytes: Buffer; files?: never }
);
/**
 * 内容审查端口。上传内容不可信，实现方必须在隔离环境（独立进程、受限堆与工作目录）里
 * 解析，宿主进程不直接解包；单次 30 秒超时 504/`SCAN_TIMEOUT`、子进程异常
 * 503/`SCANNER_FAILED`/`SCANNER_UNAVAILABLE`，这些失败均标记可重试。
 * 返回重新打包后的 ZIP（而非原始字节），发布与下载以它为准。
 */
export type IntakeScanner = (
  input: ScanInput,
) => Promise<{ inspected: ContentInspection; zip: Buffer }>;
