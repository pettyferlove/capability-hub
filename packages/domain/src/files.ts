/**
 * 接收与安装采用相同的脚本识别规则，不信任 ZIP 的执行权限标记。
 * 判定依据是扩展名或前 300 字节内的 shebang：两道规则互补，没有扩展名的脚本靠 shebang 兜底，
 * 跨平台打包（丢掉执行位）也能被识别，所以安装端一律以此结论决定是否补可执行位。
 *
 * @param path - 归档内相对路径，扩展名匹配不区分大小写
 * @param bytes - 文件内容，仅前 300 字节参与 shebang 判定
 */
export function executableText(path: string, bytes: Buffer) {
  return (
    /\.(py|sh|bash|zsh|fish|js|ts|mjs|cjs|ps1|rb|r|pl|php|lua|kts|groovy|bat|cmd|vbs)$/i.test(
      path,
    ) || /^#![^\r\n]{1,256}(?:\r?\n|$)/.test(bytes.subarray(0, 300).toString('utf8'))
  );
}
/** 内容分类只服务预览和提示，不以语言、扩展名或二进制格式限制分发。 */
export function contentText(bytes: Buffer): string | null {
  if (archiveResource(bytes)) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.includes('\0') ? null : text;
  } catch {
    return null;
  }
}

/**
 * 按魔数识别归档格式（ZIP、gzip、7z、RAR、xz、bzip2、POSIX tar），只读文件头，不解包。
 * 目的不是限制分发，而是让预览与扫描跳过压缩流：对二进制压缩数据做文本判定会得到噪声。
 */
export function archiveResource(bytes: Buffer) {
  const hex = bytes.subarray(0, 6).toString('hex');
  return (
    ['504b0304', '504b0506', '504b0708'].some((prefix) => hex.startsWith(prefix)) ||
    hex.startsWith('1f8b08') ||
    hex === '377abcaf271c' ||
    hex.startsWith('52617221') ||
    hex === 'fd377a585a00' ||
    hex.startsWith('425a68') ||
    (bytes.length >= 512 && bytes.subarray(257, 262).toString() === 'ustar')
  );
}

/**
 * 识别打包器附带、不属于交付内容的文件（`__MACOSX/` 目录、`.DS_Store`、AppleDouble `._*`），
 * 调用方据此把它们排除在清单和摘要之外：同一个 skill 从 macOS 打包或从 Linux 打包应得到相同的 digest，
 * 否则内容未变也会被判定为新版本。`._*` 需要同时匹配 AppleDouble 魔数才排除，避免误伤同名真实文件。
 *
 * @param path - 归档内相对路径
 * @param bytes - 文件内容，仅前 4 字节用于 AppleDouble 判定
 */
export function packagingMetadata(path: string, bytes: Buffer) {
  return (
    path.startsWith('__MACOSX/') ||
    path.split('/').pop() === '.DS_Store' ||
    (path.split('/').pop()?.startsWith('._') && bytes.subarray(0, 4).toString('hex') === '00051607')
  );
}
