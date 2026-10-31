import type { ContentFile } from '@capability-hub/domain/content';
import { utf8Compare } from '@capability-hub/domain/canonical';
import { HubError, fail } from '@capability-hub/domain/errors';
import { executableText } from '@capability-hub/domain/files';
import { collisionKey, safePath } from '@capability-hub/domain/paths';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { crc32 } from 'node:zlib';
const MiB = 1024 * 1024;
export async function unzip(bytes: Buffer): Promise<ContentFile[]> {
  if (!bytes.length || bytes.length > 20 * MiB)
    fail(413, 'UPLOAD_SIZE', '上传文件必须为非空且不超过 20 MiB');
  return new Promise((resolve, reject) =>
    yauzl.fromBuffer(
      bytes,
      { lazyEntries: true, decodeStrings: true, validateEntrySizes: true, strictFileNames: true },
      (err, zip) => {
        if (err || !zip) {
          reject(new HubError(422, 'ZIP_INVALID', 'ZIP 归档格式无效'));
          return;
        }
        const files: ContentFile[] = [];
        const names = new Set<string>();
        let total = 0;
        let entries = 0;
        let settled = false;
        const bad = (e: unknown) => {
          if (settled) return;
          settled = true;
          zip.close();
          reject(e instanceof HubError ? e : new HubError(422, 'ZIP_INVALID', 'ZIP 归档格式无效'));
        };
        zip.on('error', bad);
        zip.on('end', () => {
          if (!settled) {
            settled = true;
            resolve(files);
          }
        });
        zip.on('entry', (entry: yauzl.Entry) => {
          try {
            if (++entries > 6500) fail(413, 'PACKAGE_LIMIT', 'ZIP 条目数量超过限制');
            if (!('fileNameRaw' in entry) || !(entry.fileNameRaw instanceof Uint8Array))
              fail(422, 'ZIP_PATH_ENCODING', 'ZIP 路径缺少原始字节');
            const rawName = Buffer.from(entry.fileNameRaw);
            const unicodeName = entry.extraFields.find(
              (field: { id: number; data: Buffer }) =>
                field.id === 0x7075 &&
                field.data.length >= 6 &&
                field.data[0] === 1 &&
                field.data.readUInt32LE(1) === crc32(rawName),
            );
            const encodedName =
              unicodeName?.data.subarray(5) ??
              (entry.generalPurposeBitFlag & 0x800 ? rawName : null);
            if (encodedName) {
              let decoded: string;
              try {
                decoded = new TextDecoder('utf-8', { fatal: true }).decode(encodedName);
              } catch {
                fail(422, 'ZIP_PATH_ENCODING', 'ZIP 文件路径必须采用有效 UTF-8 编码');
              }
              if (decoded !== entry.fileName)
                fail(422, 'ZIP_PATH_ENCODING', 'ZIP 文件路径包含 BOM 或解码不一致');
            } else if (/[^\x20-\x7e]/.test(entry.fileName))
              fail(422, 'ZIP_PATH_ENCODING', '非 ASCII 的 ZIP 路径必须明确使用 UTF-8 编码');
            const dir = entry.fileName.endsWith('/');
            const path = safePath(dir ? entry.fileName.slice(0, -1) : entry.fileName);
            const key = collisionKey(path);
            if (names.has(key)) fail(422, 'PATH_COLLISION', 'ZIP 中存在重复或大小写冲突路径');
            names.add(key);
            const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
            const type = mode & 0xf000;
            if (entry.generalPurposeBitFlag & 1 || ![0, 0x8000, 0x4000].includes(type))
              fail(422, 'ZIP_ENTRY_TYPE', '拒绝加密、链接或特殊 ZIP 条目');
            if (
              (type === 0x4000 && !dir) ||
              (type === 0x8000 && dir) ||
              (dir && entry.uncompressedSize !== 0)
            )
              fail(422, 'ZIP_ENTRY_TYPE', 'ZIP 文件与目录类型不一致，或目录包含数据');
            if (dir) {
              zip.readEntry();
              return;
            }
            if (
              files.length >= 500 ||
              entry.uncompressedSize > 10 * MiB ||
              total + entry.uncompressedSize > 100 * MiB
            )
              fail(413, 'PACKAGE_LIMIT', '包体积、文件数或单文件超过限制');
            zip.openReadStream(entry, (error, stream) => {
              if (error || !stream) {
                bad(error ?? new HubError(422, 'ZIP_INVALID', '无法读取 ZIP 条目'));
                return;
              }
              const chunks: Buffer[] = [];
              let size = 0;
              stream.on('data', (chunk: Buffer) => {
                size += chunk.length;
                total += chunk.length;
                if (size > 10 * MiB || total > 100 * MiB) {
                  stream.destroy();
                  bad(new HubError(413, 'PACKAGE_LIMIT', '包体积超过限制'));
                } else chunks.push(chunk);
              });
              stream.on('error', bad);
              stream.on('end', () => {
                if (settled) return;
                const raw = Buffer.concat(chunks);
                if (raw.length !== entry.uncompressedSize) {
                  bad(new HubError(422, 'ZIP_INVALID', 'ZIP 条目大小与声明不符'));
                  return;
                }
                // 大小一致仍可能被篡改，CRC 校验实际解压字节。
                if (crc32(raw) !== entry.crc32 >>> 0) {
                  bad(new HubError(422, 'ZIP_CRC', 'ZIP 内容校验失败'));
                  return;
                }
                files.push({ path, bytes: raw, executable: executableText(path, raw) });
                zip.readEntry();
              });
            });
          } catch (e) {
            bad(e);
          }
        });
        zip.readEntry();
      },
    ),
  );
}
export function normalizeSkill(files: ContentFile[]) {
  if (!files.some((f) => f.path === 'SKILL.md')) {
    const roots = files.filter((f) => /^[^/]+\/SKILL\.md$/.test(f.path));
    if (roots.length !== 1) fail(422, 'SKILL_ROOT', 'ZIP 必须恰好包含一个 Skill 根目录');
    const prefix = roots[0].path.slice(0, -8);
    if (files.some((f) => !f.path.startsWith(prefix)))
      fail(422, 'SKILL_ROOT', 'ZIP 只能包含一个 Skill 包');
    files = files.map((f) => ({ ...f, path: f.path.slice(prefix.length) }));
  }
  if (files.filter((f) => f.path === 'SKILL.md').length !== 1)
    fail(422, 'SKILL_ROOT', '不接受嵌套 Skill');
  return files;
}
export async function archive(files: ContentFile[]) {
  const zip = new yazl.ZipFile();
  for (const f of [...files].sort((a, b) => utf8Compare(a.path, b.path)))
    zip.addBuffer(f.bytes, f.path, {
      mtime: new Date('2000-01-01T00:00:00Z'),
      mode: f.executable ? 0o100755 : 0o100644,
    });
  const chunks: Buffer[] = [];
  const result = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
  zip.end();
  return result;
}
