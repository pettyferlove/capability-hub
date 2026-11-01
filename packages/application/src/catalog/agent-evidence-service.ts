import type { Principal } from '@capability-hub/domain/identity';
import { fail, notFound } from '@capability-hub/domain/errors';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';
import type { AssetContentService } from './asset-content-service.js';
import type { AssetFeedbackService } from './asset-feedback-service.js';

/** Agent 与人工使用相同权限边界；工具只读取固定版本，不执行资源中的指令。 */
export class AgentEvidenceService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
    private readonly content: AssetContentService,
    private readonly feedback: AssetFeedbackService,
  ) {}

  async version(ownerId: string, id: string) {
    const principal = await this.context.identity.principal(ownerId);
    const version = await this.context.store.get('versions', id);
    if (!version) notFound();
    const asset = await this.access.getAsset(version.asset_id);
    if (asset.lifecycle === 'blocked' || version.availability === 'revoked')
      fail(409, 'CONTENT_UNAVAILABLE', '资源已封禁或撤销');
    if (!(await this.access.canRead(principal, asset, version)))
      await this.access.requireCandidateAccess(principal, version);
    return { principal, asset, version };
  }

  async feedbackTarget(ownerId: string, id: string) {
    const principal = await this.context.identity.principal(ownerId);
    const feedback = await this.feedback.get(principal, id);
    await this.version(ownerId, feedback.version_id);
    return feedback;
  }

  async overview(ownerId: string, id: string) {
    const { asset, version } = await this.version(ownerId, id);
    return {
      version_id: id,
      asset_id: asset.id,
      slug: asset.slug,
      kind: asset.kind,
      version_label: version.version_label,
      content_digest: version.content_digest,
      entry_file: asset.kind === 'skill' ? 'SKILL.md' : 'server.json',
      file_count: version.files.length,
      availability: version.availability,
    };
  }

  async publicationScenarios(ownerId: string, versionId: string) {
    await this.version(ownerId, versionId);
    return (await this.context.store.all('scenarios'))
      .filter((s) => s.active)
      .map(({ id, name }) => ({ id, name }));
  }

  async files(ownerId: string, id: string, offset: number, limit: number) {
    const { version } = await this.version(ownerId, id);
    return {
      files: version.files
        .slice(offset, offset + limit)
        .map(({ blob_ref: _blob, ...file }) => file),
      total: version.files.length,
      next_offset: offset + limit < version.files.length ? offset + limit : null,
    };
  }

  async read(ownerId: string, id: string, path: string, start: number, count: number) {
    const { principal, version, asset } = await this.version(ownerId, id);
    const file = version.files.find((item) => item.path === path);
    if (!file) notFound();
    if (file.size > 512000)
      return {
        path,
        unavailable: '文件超过文本读取上限，请依据清单标记未检查',
        total_lines: 0,
        start_line: start,
        end_line: start,
        text: '',
        truncated: true,
      };
    const result = await this.content.getFile(
      principal,
      id,
      path,
      !(await this.access.canRead(principal, asset, version)),
    );
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(result.bytes);
    } catch {
      return {
        path,
        unavailable: '非 UTF-8 文本',
        total_lines: 0,
        start_line: start,
        end_line: start,
        text: '',
        truncated: true,
      };
    }
    if (text.includes('\0'))
      return {
        path,
        unavailable: '二进制内容',
        total_lines: 0,
        start_line: start,
        end_line: start,
        text: '',
        truncated: true,
      };
    const lines = text.split('\n');
    const selected: string[] = [];
    let length = 0;
    for (let index = start - 1; index < Math.min(lines.length, start - 1 + count); index++) {
      const line = `${index + 1}: ${lines[index]}`;
      if (length + line.length > 24000) break;
      selected.push(line);
      length += line.length + 1;
    }
    return {
      path,
      digest: file.sha256,
      total_lines: lines.length,
      start_line: start,
      end_line: start + selected.length - 1,
      text: selected.join('\n'),
      truncated: start + selected.length - 1 < lines.length,
    };
  }

  async search(ownerId: string, id: string, query: string, offset: number) {
    const { version } = await this.version(ownerId, id);
    const matches: { path: string; line: number; text: string }[] = [];
    const skipped: string[] = [];
    // 分页扫描有限文件，避免一次工具调用隐式加载整个资源包。
    for (const file of version.files.slice(offset, offset + 10)) {
      const result = await this.read(ownerId, id, file.path, 1, 200);
      if (result.truncated || result.unavailable) skipped.push(file.path);
      for (const line of result.text.split('\n')) {
        if (line.toLowerCase().includes(query.toLowerCase()) && matches.length < 40)
          matches.push({
            path: file.path,
            line: Number(line.split(':', 1)[0]),
            text: line.slice(0, 500),
          });
      }
    }
    return {
      matches,
      partial_files: skipped,
      next_offset: offset + 10 < version.files.length ? offset + 10 : null,
    };
  }

  async scan(ownerId: string, id: string) {
    await this.version(ownerId, id);
    const scans = await this.context.store.where('scans', 'version_id', id);
    return {
      scans: scans.map(({ id: scanId, state, ruleset_version, findings }) => ({
        id: scanId,
        state,
        ruleset_version,
        findings,
      })),
    };
  }

  async mcpDeclarations(ownerId: string, id: string) {
    const { asset, version } = await this.version(ownerId, id);
    if (asset.kind !== 'mcp') fail(422, 'NOT_MCP', '此资源不是 MCP');
    return {
      installation_options: version.metadata.installation_options ?? [],
      declared_tools: version.metadata.declared_tools ?? [],
      verification: '仅静态声明；未连接远端、运行安装命令或调用资源工具',
      schema_id: version.metadata.schema_id ?? null,
    };
  }

  async compare(ownerId: string, id: string) {
    const { principal, asset, version } = await this.version(ownerId, id);
    const release = await this.context.store.get('releases', asset.current_release_id);
    if (!release || release.version_id === id) return { base_version_id: null, changes: [] };
    const base = await this.version(principal.id, release.version_id);
    const paths = new Set([
      ...base.version.files.map((f) => f.path),
      ...version.files.map((f) => f.path),
    ]);
    return {
      base_version_id: base.version.id,
      changes: [...paths].flatMap((path) => {
        const previous = base.version.files.find((f) => f.path === path);
        const candidate = version.files.find((f) => f.path === path);
        return previous?.sha256 === candidate?.sha256
          ? []
          : [{ path, change: !previous ? 'added' : !candidate ? 'removed' : 'modified' }];
      }),
    };
  }

  async applyFeedback(ownerId: string, id: string, revision: number, resolution: string) {
    const principal: Principal = await this.context.identity.principal(ownerId);
    return this.feedback.update(principal, id, {
      revision,
      status: 'in_progress',
      resolution,
      fixed_version_id: null,
    });
  }
}
