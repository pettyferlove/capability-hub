import type {
  IdentitySnapshotResponse,
  ManagedScenarioResponse,
  RoleScopeOptionsResponse,
} from '@capability-hub/contracts/http';
import { useState } from 'react';
import type { ApiErrorContext } from '../../shared/api/client.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { Submit } from '../../shared/components/Submit.js';
import { permissionScopeIcons } from '../../shared/components/select-icons.js';
import {
  btnDangerStyles,
  btnStyles,
  formActionsStyles,
  subtleStyles,
} from '../../shared/styles/recipes.js';
import { IdentityPicker, type IdentityOption } from './IdentityPicker.js';
import {
  accountName,
  compareNames,
  scopeLabels,
  type IdentityDirectoryModel,
  type IdentityEntity,
  type IdentityScope,
} from './identity-directory.js';

/** 没有候选与读取失败须区分；失败时不能提交未核对的作用对象。 */
export interface IdentityOptions<T> {
  data?: T;
  loading: boolean;
  error: string;
  errorProps?: ApiErrorContext;
}

interface AssignmentProps {
  data: IdentitySnapshotResponse;
  directory: IdentityDirectoryModel;
  busy: boolean;
  onClose: () => void;
  error: string;
}

/** 从当前账号或团队补充成员关系，排除已经加入的记录和目录管理的团队。 */
export function MembershipFields({
  entity,
  data,
  directory,
  busy,
  onClose,
  error,
}: AssignmentProps & { entity: IdentityEntity }) {
  const [choice, setChoice] = useState('');
  const account = entity.kind === 'account';
  const joined = account
    ? new Set(directory.membershipsByUser.get(entity.id)?.map((item) => item.group_id))
    : new Set(directory.membershipsByTeam.get(entity.id)?.map((item) => item.user_id));
  const options = account
    ? data.groups
        .filter((team) => team.active && !team.ldap_entry_uuid && !joined.has(team.id))
        .map((team) => ({ id: team.id, label: team.name }))
    : data.users
        .filter((user) => user.active && !joined.has(user.id))
        .map((user) => ({ id: user.id, label: accountName(user) }));
  options.sort((a, b) => compareNames(a.label, b.label));
  return (
    <>
      <p className={subtleStyles}>
        {account ? '账号：' : '团队：'}
        <strong className="text-ink [overflow-wrap:anywhere]">
          {directory.subject(entity.id)}
        </strong>
      </p>
      <input type="hidden" name={account ? 'user_id' : 'group_id'} value={entity.id} />
      {options.length > 0 ? (
        <IdentityPicker
          name={account ? 'group_id' : 'user_id'}
          label={account ? '加入哪个团队' : '添加哪个账号'}
          placeholder={account ? '搜索团队名称' : '搜索姓名或登录账号'}
          options={options}
          value={choice}
          onChange={setChoice}
          required
        />
      ) : (
        <Message>
          {account
            ? '没有可加入的手动团队。目录同步团队不能手动添加成员。'
            : '没有可添加的启用账号。已在团队中的账号不会重复显示。'}
        </Message>
      )}
      <p className={subtleStyles}>加入后可继承此团队的角色授权，不会自动获得新的个人角色。</p>
      <IdentityFormActions
        busy={busy}
        disabled={!options.some(({ id }) => id === choice)}
        onClose={onClose}
        error={error}
      >
        {account ? '确认加入' : '确认添加'}
      </IdentityFormActions>
    </>
  );
}

/** 主体和作用域相互独立；切换作用域时不得沿用上一个对象 ID。 */
export function BindingFields({
  data,
  directory,
  entity,
  teamScopeId,
  scenarios,
  resources,
  retry,
  busy,
  onClose,
  error,
}: AssignmentProps & {
  entity?: IdentityEntity;
  teamScopeId?: string;
  scenarios: IdentityOptions<ManagedScenarioResponse[]>;
  resources: IdentityOptions<RoleScopeOptionsResponse>;
  retry: () => void;
}) {
  const initialTeam = teamScopeId ?? (entity?.kind === 'team' ? entity.id : '');
  const [principalId, setPrincipalId] = useState(entity?.id ?? '');
  const [roleId, setRoleId] = useState('');
  const [scope, setScope] = useState<IdentityScope | ''>(initialTeam ? 'team' : '');
  const [scopeId, setScopeId] = useState(initialTeam);
  const principals = entity
    ? []
    : [
        ...data.users
          .filter((user) => user.active)
          .map((user) => ({ id: user.id, label: accountName(user) })),
        ...data.groups.map((team) => ({
          id: team.id,
          label: `${team.name}（团队${team.active ? '' : ' · 已停用'}）`,
        })),
      ].sort((a, b) => compareNames(a.label, b.label));
  const role = directory.roles.get(roleId);
  const principalTeam = directory.teams.get(principalId);
  const roleOptions = data.roles
    .map((item) => ({ id: item.id, label: item.name }))
    .sort((a, b) => compareNames(a.label, b.label));
  let options: IdentityOption[] = [];
  if (scope === 'team') {
    options = data.groups.map((team) => ({
      id: team.id,
      label: team.name + (team.active ? '' : '（已停用）'),
    }));
  } else if (scope === 'scenario') {
    options =
      scenarios.data?.filter((item) => item.active).map(({ id, name }) => ({ id, label: name })) ??
      [];
  } else if (scope === 'asset' || scope === 'source') {
    options =
      (scope === 'asset' ? resources.data?.assets : resources.data?.sources)?.map(
        ({ id, label, owner_group_id }) => {
          const team = directory.teams.get(owner_group_id);
          return { id, label: team ? `${label} · ${team.name}` : label };
        },
      ) ?? [];
  }
  options.sort((a, b) => compareNames(a.label, b.label));
  const target = options.find(({ id }) => id === scopeId);
  const scopeLoad =
    scope === 'scenario'
      ? scenarios
      : scope === 'source' || scope === 'asset'
        ? resources
        : undefined;
  const valid =
    (directory.users.get(principalId)?.active || principalTeam) &&
    role &&
    scope &&
    (scope === 'platform' || (target && !scopeLoad?.error));
  const duplicate =
    !!valid &&
    directory.bindingsByPrincipal
      .get(principalId)
      ?.some(
        (binding) =>
          binding.role_id === roleId &&
          binding.scope_type === scope &&
          binding.scope_id === scopeId,
      );
  return (
    <>
      {entity ? (
        <>
          <p className={subtleStyles}>
            授权给：
            <strong className="text-ink [overflow-wrap:anywhere]">
              {directory.subject(entity.id)}
            </strong>
          </p>
          <input type="hidden" name="principal_id" value={entity.id} />
        </>
      ) : (
        <IdentityPicker
          label="授权给谁"
          name="principal_id"
          options={principals}
          value={principalId}
          onChange={setPrincipalId}
          placeholder="搜索姓名、登录账号或团队"
          required
        />
      )}
      <IdentityPicker
        label="授予哪个角色"
        name="role_id"
        options={roleOptions}
        value={roleId}
        onChange={setRoleId}
        placeholder="搜索并选择角色"
        required
      />
      <label>
        在什么范围生效
        <SelectField
          name="scope_type"
          optionIcons={permissionScopeIcons}
          value={scope}
          onValueChange={(choice) => {
            const next = Object.hasOwn(scopeLabels, choice) ? (choice as IdentityScope) : '';
            setScope(next);
            setScopeId(next === 'team' ? initialTeam : '');
          }}
          required
        >
          <option value="">请选择作用域</option>
          <option value="platform">平台</option>
          <option value="team">指定团队</option>
          <option value="source">指定来源</option>
          <option value="asset">指定资产</option>
          <option value="scenario">指定场景</option>
        </SelectField>
      </label>
      {scope &&
        scope !== 'platform' &&
        (scopeLoad?.error ? (
          <ErrorState message={scopeLoad.error} {...scopeLoad.errorProps} retry={retry} />
        ) : options.length > 0 ? (
          <IdentityPicker
            key={scope}
            label="作用对象"
            name="scope_id"
            options={options}
            value={scopeId}
            onChange={setScopeId}
            placeholder={'搜索' + scopeLabels[scope]}
            required
          />
        ) : (
          <Message>
            {scopeLoad?.loading ? '正在加载作用对象…' : `没有可选的${scopeLabels[scope]}。`}
          </Message>
        ))}
      {principalTeam && (
        <p className={subtleStyles}>
          {principalTeam.active
            ? '团队的有效成员将继承该授权。'
            : '该团队已停用，成员暂不会继承该授权。'}
        </p>
      )}
      {scope && scope !== 'platform' && role?.permissions.includes('identity:manage') && (
        <Message>管理账号、团队和授权需要平台作用域。所选范围不会赋予这些管理权限。</Message>
      )}
      {scope && scope !== 'platform' && role?.permissions.includes('feedback:manage') && (
        <Message>处理平台反馈仅在平台范围生效。</Message>
      )}
      {role?.permissions.includes('review:decide') && scope ? (
        <Message>
          {scope === 'platform'
            ? '可审核所有团队的申请，包括公开和面向所有登录用户的申请。提交者不能自审。'
            : scope === 'scenario'
              ? '场景审核须覆盖申请涉及的全部场景。公开、面向所有登录用户或跨团队的申请仍需平台审核权限。'
              : '在所选范围内，只能审核未分类且仅对所属团队可见的申请。'}
        </Message>
      ) : scope === 'platform' ? (
        <Message>平台作用域覆盖所有团队。角色不授予目标 MCP 的业务权限。</Message>
      ) : null}
      {duplicate ? (
        <Message error>该主体已有相同角色和作用范围，无需重复授予。</Message>
      ) : valid ? (
        <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-xl border border-line bg-page px-4 py-3 text-body [overflow-wrap:anywhere]">
          <dt className="text-muted-ink">授权给</dt>
          <dd>{directory.subject(principalId)}</dd>
          <dt className="text-muted-ink">角色</dt>
          <dd>{role.name}</dd>
          <dt className="text-muted-ink">作用范围</dt>
          <dd>
            {scopeLabels[scope]}
            {target ? ` · ${target.label}` : ''}
          </dd>
        </dl>
      ) : null}
      <IdentityFormActions
        busy={busy}
        disabled={!valid || duplicate}
        onClose={onClose}
        error={error}
      >
        确认授予
      </IdentityFormActions>
    </>
  );
}

/** 请求失败时在提交处提示，保留已填写的内容。 */
export function IdentityFormActions({
  busy,
  onClose,
  disabled,
  danger,
  error,
  children,
}: {
  busy: boolean;
  onClose: () => void;
  disabled?: boolean;
  danger?: boolean;
  error: string;
  children: string;
}) {
  return (
    <>
      {error && <Message error>{error}</Message>}
      <div className={formActionsStyles}>
        <button type="button" className={btnStyles} disabled={busy} onClick={onClose}>
          取消
        </button>
        <Submit busy={busy} disabled={disabled} className={danger ? btnDangerStyles : undefined}>
          {children}
        </Submit>
      </div>
    </>
  );
}
