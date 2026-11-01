import { resolveAuditActor, resolveAuditSubject } from './audit-snapshot.js';
import type { AuditLogQuery } from './queries.js';
import { auditCategories, auditDefinitions } from '@capability-hub/domain/audit';
import type { Principal } from '@capability-hub/domain/identity';
import type { AuditRecord } from '@capability-hub/domain/models';
import { has } from '@capability-hub/domain/rbac';
import type { ApplicationContext } from '../shared/application-context.js';
import type { AssetAccessService } from '../catalog/asset-access-service.js';
const reasonLabels: Record<string, string> = {
  invalid_credentials: '账号或密码错误，或账号已停用',
  'local filesystem owner recovery': '本机文件系统所有者恢复账号访问',
};
const changeLabels: Record<string, string> = {
  requires_api_key: '使用时需要 API Key',
  display_name: '显示名称',
  active: '启用状态',
  name: '名称',
  permissions: '角色权限',
  password: '密码',
  avatar_color: '头像配色',
  title: '职位',
  bio: '个人简介',
};
const permissionLabels: Record<string, string> = {
  'identity:manage': '管理账号与权限',
  'audit:read': '查看审计',
  'source:create': '创建来源',
  'source:manage': '管理来源',
  'source:share': '授权共享',
  'asset:create': '创建资源',
  'asset:maintain': '维护资源',
  'review:decide': '审核发布',
  'asset:lifecycle': '控制资源状态',
  'version:revoke': '撤销版本',
  'asset:migrate': '迁移来源',
};
function displayValue(value: unknown, field: string): string {
  if (field === 'password') return '不记录密码值';
  if (typeof value === 'boolean') return value ? '启用' : '停用';
  if (typeof value === 'string') return value.slice(0, 500) || '未设置';
  if (Array.isArray(value) && value.every((item) => typeof item === 'string'))
    return (
      value
        .slice(0, 50)
        .map((item: string) => (field === 'permissions' ? (permissionLabels[item] ?? item) : item))
        .join('、') || '无'
    );
  return '未记录';
}
/** 从不可变证据生成展示结果，不返回原始记录正文。 */
export class AuditService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly assets: AssetAccessService,
  ) {}
  private async describe(principal: Principal, event: AuditRecord) {
    const definition = auditDefinitions[event.action];
    const actor =
      event.action === 'identity.login_failed'
        ? { kind: 'anonymous' as const, name: '未认证的登录尝试' }
        : (event.actor ?? (await resolveAuditActor(this.context.store, event.actor_id)));
    const subject =
      event.subject ??
      (await resolveAuditSubject(this.context.store, event.action, event.entity_id));
    let href: string | null = null;
    if (subject?.asset_id) {
      const asset = await this.context.store.get('assets', subject.asset_id);
      const release = await this.context.store.get('releases', asset?.current_release_id);
      const version = await this.context.store.get('versions', release?.version_id);
      if (asset && version && (await this.assets.canRead(principal, asset, version)))
        href = '/asset/' + encodeURIComponent(asset.slug);
      if (subject.request_id) {
        const request = await this.context.store.get('requests', subject.request_id);
        if (
          request &&
          ((await this.assets.canReview(principal, request)) ||
            request.submitted_by === principal.id ||
            (asset && this.assets.canMaintain(principal, asset)))
        )
          href = `/review?state=${request.state}&request=${request.id}`;
      }
    } else if (subject && has(principal, 'identity:manage')) {
      if (['user', 'group', 'membership'].includes(subject.kind)) href = '/account?tab=identity';
      if (['role', 'grant'].includes(subject.kind)) href = '/account?tab=roles';
    }
    const changes: { label: string; before: string; after: string }[] = [];
    if (Array.isArray(event.metadata.changes))
      for (const change of (event.metadata.changes as unknown[]).slice(0, 20)) {
        if (
          !change ||
          typeof change !== 'object' ||
          !('field' in change) ||
          typeof change.field !== 'string' ||
          !Object.hasOwn(changeLabels, change.field)
        )
          continue;
        changes.push({
          label: changeLabels[change.field],
          before: displayValue('before' in change ? change.before : undefined, change.field),
          after:
            change.field === 'password'
              ? '已更新（值不记录）'
              : displayValue('after' in change ? change.after : undefined, change.field),
        });
      }
    const facts: { label: string; value: string }[] = [];
    for (const [key, label] of Object.entries({
      revision: '变更后修订号',
      blob_count: '备份内容块数',
      error_code: '错误代码',
    })) {
      const value = event.metadata[key];
      if (typeof value === 'string' || typeof value === 'number')
        facts.push({ label, value: String(value).slice(0, 200) });
    }
    if (typeof event.metadata.requested_by === 'string') {
      facts.push({
        label: '发起人',
        value: (await resolveAuditActor(this.context.store, event.metadata.requested_by)).name,
      });
    }
    if (subject?.request_id) {
      const request = await this.context.store.get('requests', subject.request_id);
      if (request)
        facts.push(
          {
            label: '目标分类',
            value: { general: '通用', scenario: '场景', uncategorized: '未分类' }[request.category],
          },
          {
            label: '申请分发范围',
            value: await this.assets.formatVisibility(request.distribution),
          },
        );
    }
    const result = definition?.failure ? 'failure' : event.result;
    return {
      id: event.id,
      occurred_at: event.occurred_at,
      action: event.action,
      action_label: definition?.label ?? '其他操作',
      category: definition?.category ?? 'other',
      result,
      recorded_result: event.result,
      actor: {
        ...actor,
        id: event.actor_id,
        name_source: event.actor ? 'event' : actor.kind === 'unknown' ? 'unavailable' : 'current',
        avatar_color:
          actor.kind === 'user'
            ? (await this.context.store.get('users', event.actor_id))?.avatar_color
            : undefined,
      },
      subject: {
        ...(subject ?? {
          kind: definition?.subject ?? 'unknown',
          name: '关联记录不可用',
          detail: '可在详情中通过原始 ID 排查',
        }),
        id: event.entity_id,
        name_source: event.subject ? 'event' : subject ? 'current' : 'unavailable',
        href,
      },
      reason: Object.hasOwn(reasonLabels, event.reason) ? reasonLabels[event.reason] : event.reason,
      changes,
      facts,
    };
  }
  /**
   * 要求 `audit:read` 权限，由 `identity.require` 在方法内强制（路由层另有同名校验）。
   * 只读取、不改写审计记录，也不开启 `store.tx`：逐条补全上下文时数据可能变化，
   * 结果不是一致快照。`q` 经 NFKC 归一化后按空白分词，全部词命中才保留。
   * 分页号会被夹到 `[1, ceil(total / page_size)]` 的有效区间，默认每页 20 条。
   * 单条记录的 `href` 由调用者的资源可见性决定，身份类记录需 `identity:manage` 才生成链接。
   */
  async list(principal: Principal, input: AuditLogQuery) {
    this.context.identity.require(principal, 'audit:read');
    const query = { q: '', category: 'all', result: 'all', page: 1, page_size: 20, ...input };
    const words = query.q.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
    const entries = (await this.context.store.all('audit'))
      .filter((event) => {
        const category = auditDefinitions[event.action]?.category ?? 'other';
        const result = auditDefinitions[event.action]?.failure ? 'failure' : event.result;
        return (
          (query.category === 'all' || category === query.category) &&
          (query.result === 'all' || result === query.result) &&
          (!query.from || Date.parse(event.occurred_at) >= Date.parse(query.from)) &&
          (!query.to || Date.parse(event.occurred_at) <= Date.parse(query.to))
        );
      })
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id));
    const rows = (
      await Promise.all(entries.map(async (event) => await this.describe(principal, event)))
    ).filter((event) => {
      const haystack = [
        event.id,
        event.action,
        event.action_label,
        event.actor.id,
        event.actor.name,
        event.actor.username,
        event.subject.id,
        event.subject.name,
        event.subject.detail,
        event.reason,
        auditCategories[event.category],
        ...event.changes.flatMap((change) => [change.label, change.before, change.after]),
        ...event.facts.flatMap((fact) => [fact.label, fact.value]),
      ]
        .join(' ')
        .normalize('NFKC')
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
    const page = Math.min(query.page, Math.max(1, Math.ceil(rows.length / query.page_size)));
    return {
      items: rows.slice((page - 1) * query.page_size, page * query.page_size),
      total: rows.length,
      page,
      page_size: query.page_size,
      summary: {
        failures: rows.filter((row) => row.result === 'failure').length,
        identity: rows.filter((row) => row.category === 'identity').length,
        publication: rows.filter((row) => row.category === 'publication').length,
        downloads: rows.filter((row) => row.action === 'content.download').length,
      },
    };
  }
}
