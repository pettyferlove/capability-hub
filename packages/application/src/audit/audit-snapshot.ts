import { auditDefinitions } from '@capability-hub/domain/audit';
import type { AuditActorSnapshot, AuditSubjectSnapshot } from '@capability-hub/domain/audit';
import type { RecordStore } from '../ports/index.js';
/** 审计快照只提取明确的展示字段，排除凭据与内部记录正文。 */
export async function resolveAuditActor(
  store: RecordStore,
  id: string,
): Promise<AuditActorSnapshot> {
  if (id === 'anonymous') return { kind: 'anonymous', name: '匿名访客' };
  if (id === 'system') return { kind: 'system', name: '系统任务' };
  if (id === 'local-recovery') return { kind: 'system', name: '本机恢复操作' };
  const user = await store.get('users', id);
  return user
    ? { kind: 'user', name: user.display_name, username: user.username }
    : { kind: 'unknown', name: '未识别的操作者' };
}
/**
 * 按动作定义解析审计对象，供 `RecordStore.audit` 在写入审计时一并落库主体快照。
 *
 * 因此它在审计写入路径内运行：只读存储、不得写审计（否则递归）也不得抛业务错误，
 * 找不到关联记录时返回 `null`，由调用方降级为「关联记录不可用」。
 */
export async function resolveAuditSubject(
  store: RecordStore,
  action: string,
  id: string,
): Promise<AuditSubjectSnapshot | null> {
  const kind = auditDefinitions[action]?.subject ?? 'unknown';
  const resource = async (
    assetId: string,
    versionId?: string,
  ): Promise<AuditSubjectSnapshot | null> => {
    const asset = await store.get('assets', assetId);
    if (!asset) return null;
    const version = versionId ? await store.get('versions', versionId) : null;
    return {
      kind,
      name: asset.slug,
      detail: `${asset.kind === 'skill' ? 'Skill' : 'MCP'}${version ? ' · v' + version.version_label : ''}`,
      asset_id: asset.id,
      ...(version ? { version_id: version.id } : {}),
    };
  };
  if (kind === 'asset') return await resource(id);
  if (kind === 'version') {
    const version = await store.get('versions', id);
    return version ? await resource(version.asset_id, version.id) : null;
  }
  if (kind === 'intake') {
    const intake = await store.get('intakes', id);
    const subject = intake && (await resource(intake.asset_id, intake.version_id ?? undefined));
    return subject
      ? {
          ...subject,
          detail: subject.version_id
            ? subject.detail
            : `${subject.detail} · v${intake.version_label}`,
        }
      : null;
  }
  if (kind === 'publication') {
    const request = await store.get('requests', id);
    const subject = request && (await resource(request.asset_id, request.version_id));
    return subject
      ? {
          ...subject,
          request_id: request.id,
          detail: subject.detail + (request.nomination ? ' · 通用提名' : ' · 发布申请'),
        }
      : null;
  }
  if (kind === 'user') {
    if (!id) return { kind, name: '未识别的账号', detail: '登录未完成' };
    const user = await store.get('users', id);
    return user ? { kind, name: user.display_name, detail: '@' + user.username } : null;
  }
  if (kind === 'group') {
    const row = await store.get('groups', id);
    return row ? { kind, name: row.name, detail: '团队' } : null;
  }
  if (kind === 'role') {
    const row = await store.get('roles', id);
    return row ? { kind, name: row.name, detail: '角色' } : null;
  }
  if (kind === 'grant' || kind === 'membership') {
    const grant = await store.get('role_bindings', id);
    if (grant) {
      const user = await store.get('users', grant.principal_id);
      const group = await store.get('groups', grant.principal_id);
      const role = await store.get('roles', grant.role_id);
      const scope =
        grant.scope_type === 'platform'
          ? '平台'
          : grant.scope_type === 'team'
            ? (await store.get('groups', grant.scope_id))?.name
            : grant.scope_type === 'asset'
              ? (await store.get('assets', grant.scope_id))?.slug
              : grant.scope_type === 'scenario'
                ? (await store.get('scenarios', grant.scope_id))?.name
                : '指定来源';
      return {
        kind: 'grant',
        name: user?.display_name ?? group?.name ?? '授权主体',
        detail: `${role?.name ?? '角色'} · ${scope ?? '指定范围'}`,
      };
    }
    const membership = await store.get('memberships', id);
    return membership
      ? {
          kind: 'membership',
          name: (await store.get('users', membership.user_id))?.display_name ?? '团队成员',
          detail: (await store.get('groups', membership.group_id))?.name ?? '团队',
        }
      : null;
  }
  if (kind === 'connection') {
    const grant = await store.get('oauth_grants', id);
    const client = grant ? null : await store.get('oauth_clients', id);
    return grant || client
      ? { kind, name: grant?.name ?? client!.name, detail: 'Agent 浏览器授权' }
      : null;
  }
  if (kind === 'token') {
    const row = await store.get('tokens', id);
    return row ? { kind, name: row.name, detail: 'Hub 访问令牌' } : null;
  }
  if (kind === 'session') {
    const row = await store.get('sessions', id);
    return row
      ? {
          kind,
          name: '网页登录会话',
          detail: (await store.get('users', row.user_id))?.display_name ?? '账号',
        }
      : null;
  }
  if (kind === 'cli') return { kind, name: 'CLI 登录授权', detail: '用户在网页批准终端登录' };
  if (kind === 'credential') {
    const row = await store.get('git_credentials', id);
    return row ? { kind, name: row.name, detail: row.host } : null;
  }
  if (kind === 'source') {
    const row = await store.get('sources', id);
    if (!row) return null;
    if (row.kind === 'upload')
      return {
        kind,
        name: '网页上传来源',
        detail: (await store.get('groups', row.owner_group_id))?.name ?? '维护团队',
      };
    const scp = /^[a-zA-Z0-9_.-]+@[^/:]+:/.test(row.canonical_url);
    const url = scp ? null : new URL(row.canonical_url);
    return {
      kind,
      name: url
        ? url.host + url.pathname
        : row.canonical_url.slice(row.canonical_url.indexOf('@') + 1),
      detail: '分支 ' + row.branch,
    };
  }
  if (kind === 'scenario') {
    const row = await store.get('scenarios', id);
    return row ? { kind, name: row.name, detail: '适用场景' } : null;
  }
  if (kind === 'instance') return { kind, name: 'Capability Hub 实例', detail: '平台数据' };
  return null;
}
