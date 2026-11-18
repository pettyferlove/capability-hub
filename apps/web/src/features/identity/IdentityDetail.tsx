import type {
  GroupResponse,
  PublicUserResponse,
  RoleBindingResponse,
} from '@capability-hub/contracts/http';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { InputField } from '../../shared/components/InputField.js';
import { accountLoginLabel } from '../../shared/format/labels.js';
import { ArrowLeft, ChevronRight, Plus } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import {
  btnStyles,
  dangerTextStyles,
  formStackStyles,
  sheetScrollStyles,
  subtleStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import {
  BindingScope,
  IdentityResults,
  IdentityStatus,
  RevokeButton,
} from './IdentityDirectory.js';
import {
  accountName,
  compareNames,
  matchesIdentity,
  teamSource,
  type IdentityDirectoryModel,
  type IdentityEditor,
  type IdentityEntity,
} from './identity-directory.js';
import { detailRowStyles } from './styles.js';

interface DetailActions {
  directory: IdentityDirectoryModel;
  onOpen: (entity: IdentityEntity) => void;
  onEdit: (editor: IdentityEditor) => void;
}

type IdentityDetailProps = DetailActions & {
  onClose: () => void;
  onBack?: () => void;
  feedback?: ReactNode;
  resourceNotice?: ReactNode;
} & ({ user: PublicUserResponse; team?: never } | { team: GroupResponse; user?: never });

/** 将直接和继承授权分开，继承授权只能回到授予角色的团队调整。 */
export function IdentityDetail({
  user,
  team,
  feedback,
  resourceNotice,
  onClose,
  onBack,
  ...actions
}: IdentityDetailProps) {
  const header = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => header.current?.focus(), []);
  return (
    <>
      <div ref={header} tabIndex={-1} className="outline-none">
        <DialogTitle title={user ? user.display_name : team.name} onClose={onClose} />
      </div>
      <div className={cn(sheetScrollStyles, formStackStyles, 'gap-6')}>
        {onBack && (
          <button type="button" className={cn(textBtnStyles, 'self-start')} onClick={onBack}>
            <ArrowLeft size={16} aria-hidden="true" /> 返回上一级
          </button>
        )}
        {feedback}
        <div className="flex min-w-0 flex-wrap items-center gap-2.5 rounded-xl border border-line bg-page px-4 py-3">
          <span className="min-w-0 text-body [overflow-wrap:anywhere]">
            {user ? accountLoginLabel(user) : teamSource(team)}
          </span>
          <IdentityStatus active={user ? user.active : team.active} />
        </div>
        {resourceNotice}
        {user ? (
          <AccountDetail user={user} {...actions} />
        ) : (
          <TeamDetail team={team} {...actions} />
        )}
      </div>
    </>
  );
}

function AccountDetail({
  user,
  directory,
  onOpen,
  onEdit,
}: DetailActions & { user: PublicUserResponse }) {
  const entity = { kind: 'account', id: user.id } as const;
  const memberships = [...(directory.membershipsByUser.get(user.id) ?? [])].sort((a, b) =>
    compareNames(
      directory.teams.get(a.group_id)?.name ?? '',
      directory.teams.get(b.group_id)?.name ?? '',
    ),
  );
  const inherited = user.active
    ? [...new Set(memberships.map(({ group_id }) => group_id))]
        .filter((id) => directory.teams.get(id)?.active)
        .flatMap((id) => directory.bindingsByPrincipal.get(id) ?? [])
    : [];
  return (
    <>
      <DetailSection
        title="所属团队"
        action={
          user.active && (
            <AddAction onClick={() => onEdit({ kind: 'membership', entity })}>加入团队</AddAction>
          )
        }
      >
        <IdentityResults
          label="所属团队"
          items={memberships}
          pageSize={5}
          empty="尚未加入维护团队。"
          render={(membership) => {
            const team = directory.teams.get(membership.group_id);
            if (!team) return <p className={detailRowStyles}>未知团队 · {membership.group_id}</p>;
            return (
              <div className={detailRowStyles}>
                <DetailLink
                  title={team.name}
                  caption={teamSource(team) + (team.active ? '' : ' · 已停用')}
                  onClick={() => onOpen({ kind: 'team', id: team.id })}
                />
                {!team.ldap_entry_uuid && (
                  <button
                    type="button"
                    className={textBtnStyles}
                    aria-label={'移出团队 ' + team.name}
                    onClick={() => onEdit({ kind: 'remove-membership', membership, user, team })}
                  >
                    移出
                  </button>
                )}
              </div>
            );
          }}
        />
      </DetailSection>
      <DetailSection
        title="直接授权"
        action={
          user.active && (
            <AddAction onClick={() => onEdit({ kind: 'binding', entity })}>授予角色</AddAction>
          )
        }
        description={!user.active ? '账号停用期间，保留的授权不会赋予访问权限。' : undefined}
      >
        <DetailGrants
          label="账号直接授权"
          bindings={directory.bindingsByPrincipal.get(user.id) ?? []}
          directory={directory}
          onEdit={onEdit}
        />
      </DetailSection>
      {user.active && (
        <DetailSection
          title="继承自团队"
          description="仅显示启用团队授予的角色。调整团队授权会影响该团队的有效成员。"
        >
          <DetailGrants
            label="团队继承授权"
            bindings={inherited}
            directory={directory}
            onOpen={onOpen}
          />
        </DetailSection>
      )}
      <DetailSection
        title="账号设置"
        description={
          user.auth_provider === 'ldap' ? '密码由 LDAP / AD 管理，Hub 不提供重置。' : undefined
        }
      >
        <div className="flex flex-wrap gap-2">
          {user.auth_provider === 'local' && (
            <button
              type="button"
              className={btnStyles}
              onClick={() => onEdit({ kind: 'reset', user })}
            >
              重置密码
            </button>
          )}
          <button
            type="button"
            className={cn(btnStyles, user.active && dangerTextStyles)}
            onClick={() => onEdit({ kind: 'toggle-user', user })}
          >
            {user.active ? '停用账号' : '启用账号'}
          </button>
        </div>
      </DetailSection>
    </>
  );
}

function TeamDetail({ team, directory, onOpen, onEdit }: DetailActions & { team: GroupResponse }) {
  const [memberSearch, setMemberSearch] = useState('');
  const query = memberSearch.trim().toLowerCase();
  const entity = { kind: 'team', id: team.id } as const;
  const members = directory.membershipsByTeam.get(team.id) ?? [];
  const rows = members
    .filter(({ user_id }) => {
      const user = directory.users.get(user_id);
      return !query || (user && matchesIdentity(query, user.display_name, user.username));
    })
    .sort((a, b) => compareNames(directory.subject(a.user_id), directory.subject(b.user_id)));
  return (
    <>
      <DetailSection
        title="团队成员"
        action={
          team.active &&
          !team.ldap_entry_uuid && (
            <AddAction onClick={() => onEdit({ kind: 'membership', entity })}>添加成员</AddAction>
          )
        }
        description={
          team.ldap_entry_uuid
            ? '成员归属在 LDAP / AD 中调整，登录时同步到 Hub。'
            : '成员身份本身不授予角色；成员可继承授给此团队的角色。'
        }
      >
        {(members.length > 5 || memberSearch) && (
          <InputField
            type="search"
            icon="search"
            aria-label="搜索团队成员"
            placeholder="搜索姓名或登录账号"
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
          />
        )}
        <IdentityResults
          key={query}
          label="团队成员"
          items={rows}
          total={members.length}
          pageSize={5}
          empty={query ? '未找到匹配成员。' : '团队还没有成员。'}
          render={(membership) => {
            const user = directory.users.get(membership.user_id);
            if (!user) return <p className={detailRowStyles}>未知账号 · {membership.user_id}</p>;
            return (
              <div className={detailRowStyles}>
                <DetailLink
                  title={user.display_name}
                  caption={accountLoginLabel(user) + (user.active ? '' : ' · 已停用')}
                  onClick={() => onOpen({ kind: 'account', id: user.id })}
                />
                {!team.ldap_entry_uuid && (
                  <button
                    type="button"
                    className={textBtnStyles}
                    aria-label={'移出成员 ' + accountName(user)}
                    onClick={() => onEdit({ kind: 'remove-membership', membership, user, team })}
                  >
                    移出
                  </button>
                )}
              </div>
            );
          }}
        />
      </DetailSection>
      <DetailSection
        title="授给此团队"
        action={<AddAction onClick={() => onEdit({ kind: 'binding', entity })}>授予角色</AddAction>}
        description={
          team.active ? '这些角色由团队的有效成员继承。' : '团队停用期间，成员不会继承这些角色。'
        }
      >
        <DetailGrants
          label="团队直接授权"
          bindings={directory.bindingsByPrincipal.get(team.id) ?? []}
          directory={directory}
          onEdit={onEdit}
        />
      </DetailSection>
      <DetailSection
        title="范围为此团队"
        description="其他账号或团队在此团队范围内的角色授权。"
        action={
          <AddAction onClick={() => onEdit({ kind: 'binding', teamScopeId: team.id })}>
            授权到此团队
          </AddAction>
        }
      >
        <DetailGrants
          label="团队范围授权"
          bindings={directory.bindingsByTeamScope.get(team.id) ?? []}
          directory={directory}
          onOpen={onOpen}
          onEdit={onEdit}
        />
      </DetailSection>
      <DetailSection title="团队设置">
        <div className="flex flex-wrap gap-2">
          {!team.ldap_entry_uuid && (
            <button
              type="button"
              className={btnStyles}
              onClick={() => onEdit({ kind: 'rename-team', team })}
            >
              修改名称
            </button>
          )}
          <button
            type="button"
            className={cn(btnStyles, team.active && dangerTextStyles)}
            onClick={() => onEdit({ kind: 'toggle-team', team })}
          >
            {team.active ? '停用团队' : '启用团队'}
          </button>
        </div>
      </DetailSection>
    </>
  );
}

function DetailGrants({
  label,
  bindings,
  directory,
  onOpen,
  onEdit,
}: {
  label: string;
  bindings: RoleBindingResponse[];
  directory: IdentityDirectoryModel;
  onOpen?: DetailActions['onOpen'];
  onEdit?: DetailActions['onEdit'];
}) {
  return (
    <IdentityResults
      label={label}
      items={bindings}
      pageSize={5}
      empty="暂无此类授权。"
      render={(binding) => {
        const account = directory.users.get(binding.principal_id);
        const team = directory.teams.get(binding.principal_id);
        return (
          <div className={detailRowStyles}>
            <div className="grid min-w-0 gap-1.5">
              <strong className="font-semibold [overflow-wrap:anywhere]">
                {directory.roles.get(binding.role_id)?.name ?? '未知角色'}
              </strong>
              <BindingScope binding={binding} directory={directory} />
              {onOpen && (account || team) && (
                <button
                  type="button"
                  className={cn(
                    textBtnStyles,
                    'w-fit max-w-full text-left [overflow-wrap:anywhere]',
                  )}
                  onClick={() =>
                    onOpen({ kind: account ? 'account' : 'team', id: binding.principal_id })
                  }
                >
                  {onEdit ? '授权给 ' : '继承自 '}
                  {directory.subject(binding.principal_id)}
                  <ChevronRight size={14} className="shrink-0" aria-hidden="true" />
                </button>
              )}
            </div>
            {onEdit && <RevokeButton binding={binding} directory={directory} onEdit={onEdit} />}
          </div>
        );
      }}
    />
  );
}

function DetailSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid min-w-0 gap-2.5" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold text-ink">{title}</h3>
        {action}
      </div>
      {description && <p className={subtleStyles}>{description}</p>}
      {children}
    </section>
  );
}

function AddAction({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button type="button" className={cn(btnStyles, 'min-h-9 px-3 py-1.5')} onClick={onClick}>
      <Plus size={15} aria-hidden="true" />
      {children}
    </button>
  );
}

function DetailLink({
  title,
  caption,
  onClick,
}: {
  title: string;
  caption: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex min-w-0 items-center gap-2 text-left hover:text-brand"
      onClick={onClick}
    >
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <strong className="block font-medium">{title}</strong>
        <small className={subtleStyles}>{caption}</small>
      </span>
      <ChevronRight size={15} className="shrink-0 text-brand" aria-hidden="true" />
    </button>
  );
}
