import { fail } from './errors.js';
export function safePath(path: string, root = false): string {
  if (root && path === '.') return path;
  if (
    !path ||
    path !== path.normalize('NFC') ||
    Buffer.byteLength(path) > 240 ||
    path.split('/').length > 12 ||
    /[\\:\p{Cc}]/u.test(path) ||
    /[\ud800-\udfff]/u.test(path)
  )
    fail(422, 'UNSAFE_PATH', '路径必须为 NFC 相对路径，不含反斜线或控制字符');
  const parts = path.split('/');
  if (
    parts.some(
      (p) =>
        !p ||
        p === '.' ||
        p === '..' ||
        /[. ]$/.test(p) ||
        /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p),
    )
  )
    fail(422, 'UNSAFE_PATH', '路径包含非法名称或越界片段');
  return path;
}
export function sourcePath(path: string, kind: string) {
  safePath(path, kind === 'skill');
  if (/[*?[\]{}]/.test(path)) fail(422, 'UNSAFE_PATH', '读取目标不支持通配符');
  if (kind === 'mcp' && !/(^|\/)server\.json$/.test(path))
    fail(422, 'UNSAFE_PATH', 'MCP 目标必须指向 server.json');
}
export function collisionKey(path: string) {
  return path.normalize('NFC').toLocaleLowerCase('en-US').replace(/ß/g, 'ss');
}

/** 安装来源凭据属于安装器，上传内容不能占用该根文件名或其子路径。 */
export function artifactPath(path: string): string {
  safePath(path);
  const first = collisionKey(path.split('/')[0]);
  if (first === '.capability-hub-source') fail(422, 'RESERVED_PATH', '内容路径占用了安装来源记录');
  return path;
}
