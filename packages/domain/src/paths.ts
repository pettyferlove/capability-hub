import { fail } from './errors.js';
/**
 * 归档内相对路径的唯一校验入口，越界即抛 422 `UNSAFE_PATH`（不截断、不纠正，交由上传方改名）。
 * 约束：NFC 规范化、UTF-8 字节数 ≤ 240、层级 ≤ 12、不含反斜线/冒号/控制字符/孤立代理项，
 * 任一段不得为空、`.`、`..`、以点或空格结尾，也不得是 Windows 保留设备名——
 * 这些路径要同时落到 Linux 与 macOS 文件系统，跨平台差异会导致解包越界或静默覆盖。
 *
 * @param path - 待校验的相对路径
 * @param root - 为 true 时允许用 `.` 表示根目录本身（skill 安装目标）
 * @returns 原样返回入参，便于链式调用
 */
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
/**
 * 来源读取目标的校验，比 {@link safePath} 更严：不接受通配符（`*?[]{}`），
 * 且 MCP 类型必须指向某个 `server.json`。通配符在这里没有意义，只会让「读了哪些文件」无法审计。
 *
 * @param path - 来源内的相对路径
 * @param kind - 资产类型；`skill` 允许根目录 `.`，`mcp` 必须是 `server.json`
 */
export function sourcePath(path: string, kind: string) {
  safePath(path, kind === 'skill');
  if (/[*?[\]{}]/.test(path)) fail(422, 'UNSAFE_PATH', '读取目标不支持通配符');
  if (kind === 'mcp' && !/(^|\/)server\.json$/.test(path))
    fail(422, 'UNSAFE_PATH', 'MCP 目标必须指向 server.json');
}
/**
 * 判断两路径是否会在大小写不敏感的文件系统上互相覆盖：NFC 归一化后转小写。
 * `toLocaleLowerCase('en-US')` 固定语言环境以免机器设置影响结果；`ß` 额外折叠成 `ss`，
 * 覆盖德国 locale 下的大小写映射差异。仅用于冲突检测，不能当存储键使用。
 */
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
