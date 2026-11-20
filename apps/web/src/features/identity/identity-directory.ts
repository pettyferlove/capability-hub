import type {
  GroupResponse,
  IdentitySnapshotResponse,
  ManagedScenarioResponse,
  MembershipResponse,
  PublicUserResponse,
  RoleBindingResponse,
  RoleResponse,
  RoleScopeOptionsResponse,
} from '@capability-hub/contracts/http';
import { accountLoginLabel } from '../../shared/format/labels.js';

/** 两类详情可通过成员关系相互打开，授权主体不等同于作用域。 */
export type IdentityEntity = { kind: 'account' | 'team'; id: string };

/** 栏目内部标识不依赖账号页的历史 tab 参数。 */
export type IdentityView = 'accounts' | 'teams' | 'grants' | 'roles' | 'scenarios';

/** 作用域取值沿用授权接口，不从界面文案推导。 */
export type IdentityScope = RoleBindingResponse['scope_type'];

/** 确认修改前保留打开表单时的修订，用于拒绝过期写入。 */
export type IdentityEditor =
  | { kind: 'user' | 'group' | 'role' | 'scenario' }
  | { kind: 'reset' | 'toggle-user'; user: PublicUserResponse }
  | { kind: 'rename-team' | 'toggle-team'; team: GroupResponse }
  | { kind: 'edit-role'; role: RoleResponse }
  | { kind: 'edit-scenario' | 'delete-scenario'; scenario: ManagedScenarioResponse }
  | { kind: 'membership'; entity: IdentityEntity }
  | {
      kind: 'remove-membership';
      membership: MembershipResponse;
      user: PublicUserResponse;
      team: GroupResponse;
    }
  | { kind: 'binding'; entity?: IdentityEntity; teamScopeId?: string }
  | { kind: 'revoke'; binding: RoleBindingResponse };

/** 标签标识作用域类型；非平台作用域还须显示具体对象。 */
export const scopeLabels: Record<IdentityScope, string> = {
  platform: '平台',
  team: '团队',
  source: '来源',
  asset: '资产',
  scenario: '场景',
};

/** 界面解释角色可包含的能力；实际权限仍由作用域和服务端判定。 */
export const permissionLabels: Record<string, string> = {
  'ai:execute': '运行 Agent 任务',
  'ai:inspect': '查看 Agent 运行诊断',
  'identity:manage': '管理账号、团队和授权',
  'audit:read': '查看运营数据和审计记录',
  'feedback:manage': '处理平台反馈',
  'source:create': '创建 Git 来源',
  'source:manage': '管理 Git 来源',
  'source:share': '管理来源共享',
  'asset:create': '创建资产',
  'asset:maintain': '维护资产和提交发布',
  'review:decide': '决定发布审核',
  'asset:lifecycle': '管理资产状态',
  'version:revoke': '撤销发布版本',
  'asset:migrate': '迁移资产归属',
};

/** 同一个登录名可能同时存在于本地和 LDAP，授权时必须展示来源。 */
export const accountName = (user: PublicUserResponse) =>
  `${user.display_name} · ${accountLoginLabel(user)}`;

/** 目录维护来源取自标识，不按团队名称推测。 */
export const teamSource = (team: GroupResponse) => (team.ldap_entry_uuid ? '目录同步' : '手动管理');

/** 数字序号按数值排序，不把成员 10 排在成员 2 之前。 */
export const compareNames = new Intl.Collator('zh-CN', { numeric: true }).compare;

/** 按字段搜索，避免匹配跨两个无关字段拼接出来的文本。 */
export function matchesIdentity(query: string, ...fields: (string | undefined)[]) {
  return fields.some((field) => field?.toLowerCase().includes(query));
}

function indexById<T extends { id: string }>(records: readonly T[] = []) {
  return new Map(records.map((record) => [record.id, record]));
}

function groupBy<T>(records: T[], key: (record: T) => string) {
  const result = new Map<string, T[]>();
  for (const record of records) {
    const id = key(record);
    const group = result.get(id);
    if (group) group.push(record);
    else result.set(id, [record]);
  }
  return result;
}

/** 以同一份快照提供正反向查询，不推算服务端的最终访问决策。 */
export interface IdentityDirectoryModel {
  users: ReadonlyMap<string, PublicUserResponse>;
  teams: ReadonlyMap<string, GroupResponse>;
  roles: ReadonlyMap<string, RoleResponse>;
  membershipsByUser: ReadonlyMap<string, MembershipResponse[]>;
  membershipsByTeam: ReadonlyMap<string, MembershipResponse[]>;
  bindingsByPrincipal: ReadonlyMap<string, RoleBindingResponse[]>;
  bindingsByTeamScope: ReadonlyMap<string, RoleBindingResponse[]>;
  subject: (id: string) => string;
  scopeName: (binding: RoleBindingResponse) => string | undefined;
}

/** 命名索引同时用于列表、详情和确认对话框，避免相同授权显示不同对象。 */
export function identityDirectory(
  data: IdentitySnapshotResponse,
  scenarios?: ManagedScenarioResponse[],
  resources?: RoleScopeOptionsResponse,
): IdentityDirectoryModel {
  const users = indexById(data.users);
  const teams = indexById(data.groups);
  const roles = indexById(data.roles);
  const sources = indexById(resources?.sources);
  const assets = indexById(resources?.assets);
  const scenarioNames = indexById(scenarios);
  const membershipsByUser = groupBy(data.memberships, (item) => item.user_id);
  const membershipsByTeam = groupBy(data.memberships, (item) => item.group_id);
  const bindingsByPrincipal = groupBy(data.bindings, (item) => item.principal_id);
  const bindingsByTeamScope = groupBy(
    data.bindings.filter(
      (item) => item.scope_type === 'team' && item.principal_id !== item.scope_id,
    ),
    (item) => item.scope_id,
  );

  function subject(id: string) {
    const user = users.get(id);
    if (user) return accountName(user);
    const team = teams.get(id);
    return team ? `${team.name}（团队）` : `未知主体 · ${id}`;
  }

  function scopeName({ scope_type: type, scope_id: id }: RoleBindingResponse) {
    switch (type) {
      case 'platform':
        return undefined;
      case 'team':
        return teams.get(id)?.name ?? id;
      case 'source':
        return sources.get(id)?.label ?? id;
      case 'asset':
        return assets.get(id)?.label ?? id;
      case 'scenario': {
        const scenario = scenarioNames.get(id);
        return scenario ? scenario.name + (scenario.active ? '' : '（已停用）') : id;
      }
    }
  }

  return {
    users,
    teams,
    roles,
    membershipsByUser,
    membershipsByTeam,
    bindingsByPrincipal,
    bindingsByTeamScope,
    subject,
    scopeName,
  };
}
