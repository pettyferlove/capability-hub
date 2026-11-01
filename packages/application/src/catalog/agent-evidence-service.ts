import type { Principal } from '@capability-hub/domain/identity';
import type { StoredFile } from '@capability-hub/domain/models';
import { fail, notFound } from '@capability-hub/domain/errors';
import { safePath } from '@capability-hub/domain/paths';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from './asset-access-service.js';
import type { AssetFeedbackService } from './asset-feedback-service.js';

/**
 * Agent 与人工使用相同权限边界；工具只读取固定版本，不执行资源中的指令。
 *
 * 所有方法都以 `ownerId` 换取主体、以版本 id（不接受 slug）定位内容，并复用同一套
 * 读权限判定；工具凭据因此只能拿到该主体本身可见的版本。返回内容里的指令文本
 * 只作为待检查的材料，不得据此触发动作。
 */
export class AgentEvidenceService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
    private readonly feedback: AssetFeedbackService,
  ) {}

  /**
   * 唯一的内容门禁，其余方法都经它取主体与版本。
   *
   * 版本不存在抛 404；资源封禁或版本撤销抛 409/`CONTENT_UNAVAILABLE`（区别于 404，
   * 表示“曾存在但当前不可用”）；既没有读权限也不是该版本候选的审查者时抛
   * 403/`FORBIDDEN`。仅复查授权时不记管理读取；取证按工具调用记审计。`ownerId` 在每次调用时
   * 重新解析为主体，因此主体权限变化即时生效，不会沿用旧结果。
   */
  async version(ownerId: string, id: string, audit: Record<string, unknown> | false = {}) {
    const principal = await this.context.identity.principal(ownerId);
    const version = await this.context.store.get('versions', id);
    if (!version) notFound();
    const asset = await this.access.getAsset(version.asset_id);
    if (asset.lifecycle === 'blocked' || version.availability === 'revoked')
      fail(409, 'CONTENT_UNAVAILABLE', '资源已封禁或撤销');
    const management = !(await this.access.canRead(principal, asset, version));
    if (management) await this.access.requireCandidateAccess(principal, version, audit);
    return { principal, asset, version, management };
  }

  /**
   * 反馈读取本身已按主体判定可见，这里再用反馈引用的版本走一次
   * {@link AgentEvidenceService.version} 门禁：资源被封禁或版本被撤销后，
   * 该反馈即便还存在也不能继续被读取。错误与门禁一致（404/409/403）。
   */
  async feedbackTarget(ownerId: string, id: string, audit = true) {
    const principal = await this.context.identity.principal(ownerId);
    const feedback = await this.feedback.get(principal, id);
    await this.version(ownerId, feedback.version_id, audit ? { tool: 'read_feedback' } : false);
    return feedback;
  }

  /**
   * 版本概览，入口文件名按 kind 固定为 `SKILL.md` 或 `server.json`，不读取文件内容，
   * 因此拿不到内容时这里的 `file_count` 仍可用于判断包规模。
   */
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

  /**
   * 可发布的场景清单，仅返回启用场景的 id 与 name，不含任何资源相关内容；
   * 仍要传版本 id 以复用门禁，从而不向无权主体暴露场景表。
   */
  async publicationScenarios(ownerId: string, versionId: string) {
    await this.version(ownerId, versionId);
    return (await this.context.store.all('scenarios'))
      .filter((s) => s.active)
      .map(({ id, name }) => ({ id, name }));
  }

  /**
   * 清单分页：按 `offset`/`limit` 切片并剥离每个条目的 `blob_ref`，避免把对象存储
   * 定位交给调用方。`next_offset` 为 null 表示已到末尾；`total` 始终是完整文件数。
   */
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

  /**
   * 按行区间读取单文件文本：行号 1 起，单次最多 24000 字符，超出预算或后面仍有行时
   * `truncated` 为 true，`end_line` 是实际返回的最后一行。清单里没有的路径抛 404。
   *
   * 不可读的情形不抛错，而是返回空 `text` 与 `unavailable`：文件大于 512000 字节、
   * 非 UTF-8、含 NUL 字节，或起始行单行就超过字符预算；调用方必须按“未检查”处理，
   * 不能当成空文件。
   * 无可读权限时改走管理态（候选审查）路径重新取字节的授权。
   */
  async read(ownerId: string, id: string, path: string, start: number, count: number) {
    const { version, management } = await this.version(ownerId, id, false);
    const file = version.files.find((item) => item.path === path);
    if (!file) notFound();
    if (management)
      await this.context.store.audit(ownerId, 'content.management_read', id, '', {
        tool: 'read_file',
        path: file.path,
        start_line: start,
        lines: count,
      });
    return this.readLines(file, start, count);
  }

  private async readLines(file: StoredFile, start: number, count: number) {
    const path = safePath(file.path);
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
    const bytes = await this.context.blobs.read(file.blob_ref);
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
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
    if (!selected.length && start <= lines.length)
      return {
        path,
        unavailable: `第 ${start} 行超过单次读取上限，请从下一行继续，并将该行标记未检查`,
        total_lines: lines.length,
        start_line: start,
        end_line: start,
        text: '',
        truncated: true,
      };
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

  /**
   * 全版本子串搜索，大小写不敏感、非正则，每行结果截断到 500 字符。
   *
   * 一次只扫 10 个文件、最多 40 条命中，避免单次工具调用把整个资源包读进上下文；
   * 因预算被截断、不可读（见 {@link AgentEvidenceService.read}）或命中超出上限的文件记入
   * `partial_files`，所以结果是有意不完整的，需配合 `next_offset` 继续扫描。
   * 只匹配行正文，不匹配 `read` 附加的行号前缀。
   */
  async search(ownerId: string, id: string, query: string, offset: number) {
    const pageSize = 10;
    const pageAudit = { tool: 'search_files', offset, limit: pageSize };
    const { version, management } = await this.version(ownerId, id, pageAudit);
    let audited = management;
    const needle = query.toLowerCase();
    const matches: { path: string; line: number; text: string }[] = [];
    const skipped: string[] = [];
    // 一页共用一条审计，逐文件复查权限以响应扫描期间的撤权。
    for (const file of version.files.slice(offset, offset + pageSize)) {
      const access = await this.version(ownerId, id, audited ? false : pageAudit);
      audited ||= access.management;
      const result = await this.readLines(file, 1, 200);
      let partial = !!(result.truncated || result.unavailable);
      for (const line of result.text.split('\n')) {
        const separator = line.indexOf(': ');
        const body = line.slice(separator + 2).toLowerCase();
        if (separator < 0 || !body.includes(needle)) continue;
        if (matches.length < 40)
          matches.push({
            path: file.path,
            line: Number(line.slice(0, separator)),
            text: line.slice(0, 500),
          });
        else partial = true;
      }
      if (partial) skipped.push(file.path);
    }
    return {
      matches,
      partial_files: skipped,
      next_offset: offset + pageSize < version.files.length ? offset + pageSize : null,
    };
  }

  /**
   * 版本的安全扫描结论，只回 `state`、`ruleset_version` 与 `findings`，
   * 扫描记录的其余字段不对外；没有扫描记录时返回空数组，不视为通过。
   */
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

  /**
   * MCP 声明披露，非 `mcp` 资源抛 422/`NOT_MCP`。
   *
   * 只回清单里的静态声明（安装选项、声明的工具、`schema_id`），`verification`
   * 明确说明未连接远端、未执行安装命令、未调用工具——这些声明本身未经核实。
   */
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

  /**
   * 与该资源当前发布版本按路径比对 `sha256`，只报 added/removed/modified。
   *
   * 当前发布缺失或正是待比较版本时返回 `base_version_id: null` 与空 `changes`，
   * 调用方需区分“无基线”和“无差异”。基线版本本身也要过门禁，无权读取时抛 404。
   */
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

  /**
   * 受理反馈：把状态推到 `in_progress` 并记下处理说明，`fixed_version_id` 显式置空，
   * 因为修复版本由后续流转补齐。要求反馈所属资源的维护权限（否则 403），
   * `revision` 是乐观并发令牌，不一致时抛 409/`REVISION_CONFLICT`；成功后递增
   * revision 并写审计，全部发生在 {@link AssetFeedbackService.update} 的事务内。
   */
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
