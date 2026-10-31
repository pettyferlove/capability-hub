/** 资源地址包含名称和已发布版本，供人阅读及客户端获取。 */
export function publicResourcePath(kind: 'skill' | 'mcp', slug: string, version: string): string {
  return `/${kind === 'skill' ? 'skills' : 'mcp-servers'}/${encodeURIComponent(slug)}/${encodeURIComponent(version)}`;
}
