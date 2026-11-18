import type { IdentitySnapshotResponse, RoleBindingResponse } from '@capability-hub/contracts/http';
import { useState, type ReactNode } from 'react';
import { InputField } from '../../shared/components/InputField.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { TablePagination } from '../../shared/components/TablePagination.js';
import { accountLoginLabel } from '../../shared/format/labels.js';
import { ChevronRight, Plus, UserRound, UsersRound } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import {
  btnPrimaryStyles,
  btnStyles,
  panelStyles,
  sectionHeadingStyles,
  subtleStyles,
  tagRedStyles,
  tagStyles,
  tagTealStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import {
  compareNames,
  matchesIdentity,
  scopeLabels,
  teamSource,
  type IdentityDirectoryModel,
  type IdentityEditor,
  type IdentityEntity,
  type IdentityView,
} from './identity-directory.js';
import {
  directoryColumnsStyles,
  directoryIdentityStyles,
  directoryOpenRowStyles,
  directoryRowIconStyles,
  grantColumnsStyles,
  grantRowStyles,
  tableScopeNameStyles,
  tableScopeStyles,
} from './styles.js';

const labels = {
  accounts: {
    title: '账号',
    description: '查找成员，管理团队归属和角色。LDAP 账号由成员首次登录时创建。',
    search: '搜索姓名、登录账号或团队',
    action: '创建本地账号',
    kind: 'user',
    empty: '还没有账号。',
  },
  teams: {
    title: '维护团队',
    description: '查看团队成员和授权。目录同步的团队在 LDAP / AD 中维护名称和成员。',
    search: '搜索团队名称',
    action: '新建团队',
    kind: 'group',
    empty: '还没有维护团队。',
  },
  grants: {
    title: '角色授权',
    description: '按账号、团队和作用范围核对已授予的角色。团队授权由有效成员继承。',
    search: '搜索账号、团队、角色或作用对象',
    action: '授予角色',
    kind: 'binding',
    empty: '还没有角色授权。',
  },
} as const;

/** 记录的启用状态不代表某条角色授权当前生效。 */
export function IdentityStatus({ active }: { active: boolean }) {
  return (
    <span className={cn(tagStyles, 'justify-self-start', active ? tagTealStyles : tagRedStyles)}>
      {active ? '启用' : '已停用'}
    </span>
  );
}

/** 历史作用对象无法解析时保留 ID，仍可识别并回收对应授权。 */
export function BindingScope({
  binding,
  directory,
}: {
  binding: RoleBindingResponse;
  directory: IdentityDirectoryModel;
}) {
  return (
    <span className={tableScopeStyles}>
      <span className={tagStyles}>{scopeLabels[binding.scope_type]}</span>
      {binding.scope_id && (
        <span className={tableScopeNameStyles}>{directory.scopeName(binding)}</span>
      )}
    </span>
  );
}

/** 筛选后分页；回收或删除末行后留在最后一个有效页。 */
export function IdentityResults<T extends { id: string }>({
  label,
  items,
  total,
  pageSize = 10,
  empty,
  heading,
  render,
}: {
  label: string;
  items: T[];
  total?: number;
  pageSize?: number;
  empty: string;
  heading?: ReactNode;
  render: (item: T) => ReactNode;
}) {
  const [requestedPage, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(requestedPage, pages);
  const available = total ?? items.length;
  const summary =
    available === items.length
      ? `共 ${available} 条`
      : `匹配 ${items.length} 条，共 ${available} 条`;
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-line">
      {heading}
      {items.length > 0 ? (
        <ul aria-label={label} className="m-0 list-none divide-y divide-line p-0">
          {items.slice((page - 1) * pageSize, page * pageSize).map((item) => (
            <li key={item.id} className="min-w-0">
              {render(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-8 text-center text-body text-muted-ink" role="status">
          {empty}
        </p>
      )}
      {pages > 1 ? (
        <TablePagination
          label={label}
          summary={`${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, items.length)} · ${summary}`}
          page={page}
          pageCount={pages}
          onPrevious={page > 1 ? () => setPage(page - 1) : undefined}
          onNext={page < pages ? () => setPage(page + 1) : undefined}
        />
      ) : total !== undefined && items.length > 0 ? (
        <p
          className="border-t border-line bg-page/50 px-4 py-2 text-caption text-muted-ink"
          role="status"
        >
          {summary}
        </p>
      ) : null}
    </div>
  );
}

/** 先在完整快照中匹配名称、账号和作用域，再渲染当前页。 */
export function IdentityDirectory({
  view,
  data,
  directory,
  initialRole,
  onOpen,
  onEdit,
  resourceNotice,
}: {
  view: Extract<IdentityView, 'accounts' | 'teams' | 'grants'>;
  data: IdentitySnapshotResponse;
  directory: IdentityDirectoryModel;
  initialRole?: string;
  onOpen: (entity: IdentityEntity) => void;
  onEdit: (editor: IdentityEditor) => void;
  resourceNotice?: ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState(
    initialRole && directory.roles.has(initialRole) ? initialRole : '',
  );
  const [scope, setScope] = useState('');
  const query = search.trim().toLowerCase();
  const filtered = !!(query || kind || status || role || scope);
  const pageKey = JSON.stringify([query, kind, status, role, scope]);
  const config = labels[view];
  const empty = filtered ? '没有匹配的记录，请调整搜索词或筛选条件。' : config.empty;
  const isGrants = view === 'grants';
  function clear() {
    setSearch('');
    setKind('');
    setStatus('');
    setRole('');
    setScope('');
  }
  const kinds =
    view === 'accounts'
      ? [
          ['local', '本地账号'],
          ['ldap', 'LDAP 账号'],
        ]
      : view === 'teams'
        ? [
            ['manual', '手动管理'],
            ['directory', '目录同步'],
          ]
        : [
            ['account', '账号'],
            ['team', '团队'],
          ];
  const kindLabel = isGrants ? '主体类型' : view === 'accounts' ? '账号来源' : '团队类型';
  return (
    <section className={panelStyles} aria-label={config.title}>
      <div className={sectionHeadingStyles}>
        <div>
          <h2>{config.title}</h2>
          <p className={subtleStyles}>{config.description}</p>
        </div>
        <button
          type="button"
          className={cn(btnStyles, btnPrimaryStyles, 'shrink-0')}
          onClick={() => onEdit({ kind: config.kind })}
        >
          <Plus size={16} aria-hidden="true" />
          {config.action}
        </button>
      </div>
      {resourceNotice}
      <div
        className="mb-4 flex min-w-0 flex-wrap items-center gap-2.5"
        role="group"
        aria-label={config.title + '筛选'}
      >
        <div className="w-full min-w-0 md:w-auto md:min-w-60 md:max-w-md md:flex-1">
          <InputField
            type="search"
            icon="search"
            aria-label={config.search}
            placeholder={config.search}
            className="bg-page"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SelectField
          aria-label={kindLabel}
          className="w-35 max-w-full"
          value={kind}
          onValueChange={setKind}
        >
          <option value="">
            {isGrants ? '全部主体' : view === 'accounts' ? '全部账号来源' : '全部团队类型'}
          </option>
          {kinds.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        {isGrants ? (
          <>
            <SelectField
              aria-label="筛选角色"
              className="w-35 max-w-full"
              value={role}
              onValueChange={setRole}
            >
              <option value="">全部角色</option>
              {data.roles.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              aria-label="筛选作用域"
              className="w-35 max-w-full"
              value={scope}
              onValueChange={setScope}
            >
              <option value="">全部作用域</option>
              {Object.entries(scopeLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </>
        ) : (
          <SelectField
            aria-label="筛选状态"
            className="w-31 max-w-full"
            value={status}
            onValueChange={setStatus}
          >
            <option value="">全部状态</option>
            <option value="active">启用</option>
            <option value="disabled">已停用</option>
          </SelectField>
        )}
        {filtered && (
          <button type="button" className={cn(textBtnStyles, 'min-h-10 px-2')} onClick={clear}>
            清除筛选
          </button>
        )}
      </div>
      {view === 'accounts' && (
        <IdentityResults
          key={pageKey}
          label="账号列表"
          items={data.users
            .filter(
              (user) =>
                (!kind || user.auth_provider === kind) &&
                (!status || user.active === (status === 'active')) &&
                (!query ||
                  matchesIdentity(query, user.display_name, user.username) ||
                  directory.membershipsByUser
                    .get(user.id)
                    ?.some((membership) =>
                      matchesIdentity(query, directory.teams.get(membership.group_id)?.name),
                    )),
            )
            .sort(
              (a, b) =>
                compareNames(a.display_name, b.display_name) ||
                compareNames(a.username, b.username),
            )}
          total={data.users.length}
          empty={empty}
          heading={
            <DirectoryHeading
              columns={directoryColumnsStyles}
              labels={['账号', '所属团队', '状态', '']}
            />
          }
          render={(user) => {
            const groups = new Set(
              directory.membershipsByUser.get(user.id)?.map((membership) => membership.group_id),
            );
            let primaryTeam: string | undefined;
            for (const id of groups) {
              const team = directory.teams.get(id);
              if (team && (primaryTeam === undefined || compareNames(team.name, primaryTeam) < 0)) {
                primaryTeam = team.name;
              }
            }
            return (
              <button
                type="button"
                className={cn(directoryOpenRowStyles, directoryColumnsStyles)}
                onClick={() => onOpen({ kind: 'account', id: user.id })}
              >
                <span className={directoryIdentityStyles}>
                  <span className={directoryRowIconStyles}>
                    <UserRound size={17} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <strong className="block font-semibold">{user.display_name}</strong>
                    <small className={subtleStyles}>{accountLoginLabel(user)}</small>
                  </span>
                </span>
                <span className={cn(subtleStyles, 'flex min-w-0 items-center gap-2')}>
                  <span className="min-w-0 truncate" title={primaryTeam}>
                    {primaryTeam ?? (groups.size ? '未知团队' : '未加入团队')}
                  </span>
                  {groups.size > 1 && (
                    <span
                      className="shrink-0 tabular-nums"
                      aria-label={`另有 ${groups.size - 1} 个团队`}
                    >
                      +{groups.size - 1}
                    </span>
                  )}
                </span>
                <IdentityStatus active={user.active} />
                <RowAction />
              </button>
            );
          }}
        />
      )}
      {view === 'teams' && (
        <IdentityResults
          key={pageKey}
          label="维护团队列表"
          items={data.groups
            .filter(
              (team) =>
                (!kind || !!team.ldap_entry_uuid === (kind === 'directory')) &&
                (!status || team.active === (status === 'active')) &&
                matchesIdentity(query, team.name),
            )
            .sort((a, b) => compareNames(a.name, b.name))}
          total={data.groups.length}
          empty={empty}
          heading={
            <DirectoryHeading
              columns={directoryColumnsStyles}
              labels={['维护团队', '成员', '状态', '']}
            />
          }
          render={(team) => {
            const members = new Set(
              directory.membershipsByTeam.get(team.id)?.map((membership) => membership.user_id),
            );
            return (
              <button
                type="button"
                className={cn(directoryOpenRowStyles, directoryColumnsStyles)}
                onClick={() => onOpen({ kind: 'team', id: team.id })}
              >
                <span className={directoryIdentityStyles}>
                  <span className={directoryRowIconStyles}>
                    <UsersRound size={17} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <strong className="block font-semibold">{team.name}</strong>
                    <small className={subtleStyles}>{teamSource(team)}</small>
                  </span>
                </span>
                <span className={subtleStyles}>{members.size} 位成员</span>
                <IdentityStatus active={team.active} />
                <RowAction />
              </button>
            );
          }}
        />
      )}
      {isGrants && (
        <IdentityResults
          key={pageKey}
          label="授权列表"
          items={data.bindings
            .filter(
              (binding) =>
                (!kind ||
                  (kind === 'account'
                    ? directory.users.has(binding.principal_id)
                    : directory.teams.has(binding.principal_id))) &&
                (!role || binding.role_id === role) &&
                (!scope || binding.scope_type === scope) &&
                (!query ||
                  matchesIdentity(
                    query,
                    directory.subject(binding.principal_id),
                    directory.roles.get(binding.role_id)?.name,
                    scopeLabels[binding.scope_type],
                    directory.scopeName(binding),
                    binding.scope_id,
                  )),
            )
            .sort(
              (a, b) =>
                compareNames(
                  directory.subject(a.principal_id),
                  directory.subject(b.principal_id),
                ) ||
                compareNames(
                  directory.roles.get(a.role_id)?.name ?? '',
                  directory.roles.get(b.role_id)?.name ?? '',
                ) ||
                compareNames(a.id, b.id),
            )}
          total={data.bindings.length}
          empty={empty}
          heading={
            <DirectoryHeading
              columns={grantColumnsStyles}
              labels={['授权给谁', '角色', '作用范围', '操作']}
            />
          }
          render={(binding) => {
            const account = directory.users.get(binding.principal_id);
            const team = directory.teams.get(binding.principal_id);
            const subject = account ?? team;
            return (
              <div className={cn(grantRowStyles, grantColumnsStyles)}>
                {subject ? (
                  <button
                    type="button"
                    className="min-w-0 justify-self-start text-left focus-visible:outline-offset-2 hover:text-brand"
                    onClick={() => onOpen({ kind: account ? 'account' : 'team', id: subject.id })}
                  >
                    <strong className="block font-semibold [overflow-wrap:anywhere]">
                      {account?.display_name ?? team?.name}
                    </strong>
                    <small className={subtleStyles}>
                      {account ? accountLoginLabel(account) : '团队'}
                      {!subject.active && ' · 已停用'}
                    </small>
                  </button>
                ) : (
                  <span className={tableScopeNameStyles}>
                    {directory.subject(binding.principal_id)}
                  </span>
                )}
                <span className="min-w-0 font-medium [overflow-wrap:anywhere]">
                  {directory.roles.get(binding.role_id)?.name ?? '未知角色'}
                </span>
                <BindingScope binding={binding} directory={directory} />
                <RevokeButton binding={binding} directory={directory} onEdit={onEdit} />
              </div>
            );
          }}
        />
      )}
    </section>
  );
}

function DirectoryHeading({ columns, labels }: { columns: string; labels: string[] }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'hidden gap-4 border-b border-line bg-page px-4 py-2 text-caption font-medium text-muted-ink md:grid',
        columns,
      )}
    >
      {labels.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

function RowAction() {
  return (
    <span className="col-start-3 row-start-1 flex items-center gap-1 justify-self-end text-brand md:col-start-4">
      <span className="hidden md:inline">管理</span>
      <ChevronRight size={16} aria-hidden="true" />
    </span>
  );
}

/** 将确认动作绑定到单条授权，而非当前筛选出来的整组角色。 */
export function RevokeButton({
  binding,
  directory,
  onEdit,
}: {
  binding: RoleBindingResponse;
  directory: IdentityDirectoryModel;
  onEdit: (editor: IdentityEditor) => void;
}) {
  return (
    <button
      type="button"
      className={cn(textBtnStyles, 'min-h-9 justify-self-end rounded-md px-2')}
      aria-label={`回收 ${directory.subject(binding.principal_id)} 的 ${directory.roles.get(binding.role_id)?.name ?? '角色授权'} · ${directory.scopeName(binding) ?? scopeLabels[binding.scope_type]}`}
      onClick={() => onEdit({ kind: 'revoke', binding })}
    >
      回收
    </button>
  );
}
