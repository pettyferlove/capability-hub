// 接收与安装采用相同的脚本识别规则，不信任 ZIP 的执行权限标记。
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

export function packagingMetadata(path: string, bytes: Buffer) {
  return (
    path.startsWith('__MACOSX/') ||
    path.split('/').pop() === '.DS_Store' ||
    (path.split('/').pop()?.startsWith('._') && bytes.subarray(0, 4).toString('hex') === '00051607')
  );
}
