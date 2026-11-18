import { InputField } from '../../shared/components/InputField.js';
import {
  sheetScrollStyles,
  formStackStyles,
  checkLabelStyles,
} from '../../shared/styles/recipes.js';
import { permissionListStyles } from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type {
  GroupResponse,
  IdentitySnapshotResponse,
  ManagedScenarioResponse,
  PublicUserResponse,
  RoleScopeOptionsResponse,
  ScenarioReferencesResponse,
} from '@capability-hub/contracts/http';
import { useState, type SubmitEvent } from 'react';
import { ApiError, mutate } from '../../shared/api/client.js';
import { formFields } from '../../shared/api/form-fields.js';
import { useQuery } from '../../shared/api/use-query.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { PasswordField } from '../../shared/components/PasswordField.js';
import {
  BindingFields,
  IdentityFormActions,
  MembershipFields,
  type IdentityOptions,
} from './IdentityAssignments.js';
import { IdentityPicker } from './IdentityPicker.js';
import {
  accountName,
  compareNames,
  permissionLabels,
  scopeLabels,
  type IdentityDirectoryModel,
  type IdentityEditor,
  type IdentityEntity,
} from './identity-directory.js';

const scenarioReferenceLabels = [
  ['publication_requests', '发布申请'],
  ['releases', '发布记录'],
  ['source_targets', '来源目标'],
  ['role_bindings', '场景授权'],
  ['merges', '合并关系'],
] as const;

/** 修订冲突时要求管理员核对新快照，不自动重试写入。 */
export function IdentityAdminForm({
  editor,
  data,
  directory,
  scenarioOptions,
  resources,
  currentUserId,
  busy,
  onBusyChange,
  retry,
  onClose,
  onSaved,
}: {
  editor: IdentityEditor;
  data: IdentitySnapshotResponse;
  directory: IdentityDirectoryModel;
  scenarioOptions: IdentityOptions<ManagedScenarioResponse[]>;
  resources: IdentityOptions<RoleScopeOptionsResponse>;
  currentUserId?: string;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  retry: () => void;
  onClose: () => void;
  onSaved: (message: string, entity?: IdentityEntity) => void;
}) {
  const { kind } = editor;
  const scenarios = scenarioOptions.data ?? [];
  const scenario = 'scenario' in editor ? editor.scenario : undefined;
  const [error, setError] = useState(''),
    [permissions, setPermissions] = useState(kind === 'edit-role' ? editor.role.permissions : []),
    [scenarioAction, setScenarioAction] = useState('edit');
  const deletingScenario = kind === 'delete-scenario';
  const [referencesRefresh, setReferencesRefresh] = useState(0);
  const {
    data: references,
    error: referencesError,
    loading: referencesLoading,
  } = useQuery<ScenarioReferencesResponse>(
    deletingScenario && scenario ? '/api/admin/scenarios/' + scenario.id + '/references' : null,
    referencesRefresh,
  );
  const canDeleteScenario = references?.total === 0 && !referencesLoading && !referencesError;
  function reloadReferences() {
    setReferencesRefresh((value) => value + 1);
  }
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || (deletingScenario && !canDeleteScenario)) return;
    onBusyChange(true);
    setError('');
    try {
      const b = formFields(e.currentTarget);
      if (kind === 'user' || kind === 'reset') {
        if (b.password !== b.confirm_password) throw new Error('两次输入的密码不一致');
        delete b.confirm_password;
      }
      switch (editor.kind) {
        case 'user': {
          const { group_id, ...account } = b;
          const created = await mutate<PublicUserResponse>('/api/admin/users', {
            ...account,
            group_ids: group_id ? [group_id] : [],
          });
          onSaved('本地账号已创建。', { kind: 'account', id: created.id });
          break;
        }
        case 'group': {
          const created = await mutate<GroupResponse>('/api/admin/groups', b);
          onSaved('维护团队已创建。', { kind: 'team', id: created.id });
          break;
        }
        case 'reset':
          await mutate(
            '/api/admin/users/' + editor.user.id,
            { password: b.password },
            'PATCH',
            editor.user.revision,
          );
          onSaved('密码已重置，账号需重新登录网页。');
          break;
        case 'toggle-user':
          await mutate(
            '/api/admin/users/' + editor.user.id,
            { active: !editor.user.active },
            'PATCH',
            editor.user.revision,
          );
          onSaved(editor.user.active ? '账号已停用，会话和访问令牌已撤销。' : '账号已启用。');
          break;
        case 'rename-team':
          await mutate(
            '/api/admin/groups/' + editor.team.id,
            { name: b.name },
            'PATCH',
            editor.team.revision,
          );
          onSaved('团队名称已更新。');
          break;
        case 'toggle-team':
          await mutate(
            '/api/admin/groups/' + editor.team.id,
            { active: !editor.team.active },
            'PATCH',
            editor.team.revision,
          );
          onSaved(editor.team.active ? '团队已停用。' : '团队已启用。');
          break;
        case 'role':
          await mutate('/api/admin/roles', { ...b, permissions });
          onSaved('自定义角色已创建。');
          break;
        case 'edit-role':
          await mutate(
            '/api/admin/roles/' + editor.role.id,
            { ...b, permissions },
            'PATCH',
            editor.role.revision,
          );
          onSaved('角色权限已更新。');
          break;
        case 'membership':
          await mutate('/api/admin/memberships', b);
          onSaved('已将账号加入团队。');
          break;
        case 'remove-membership':
          await mutate('/api/admin/memberships/' + editor.membership.id, undefined, 'DELETE');
          onSaved('已移出团队。');
          break;
        case 'binding':
          await mutate('/api/admin/bindings', {
            ...b,
            scope_id: b.scope_type === 'platform' ? '' : b.scope_id,
          });
          onSaved('角色已授予。');
          break;
        case 'revoke':
          await mutate('/api/admin/bindings/' + editor.binding.id, undefined, 'DELETE');
          onSaved('这条角色授权已回收。');
          break;
        case 'scenario':
          await mutate('/api/admin/scenarios', b);
          onSaved('业务场景已登记。');
          break;
        case 'edit-scenario':
          await mutate(
            '/api/admin/scenarios/' + editor.scenario.id,
            { action: scenarioAction, ...b },
            'PATCH',
            editor.scenario.revision,
          );
          onSaved('业务场景已保存。');
          break;
        case 'delete-scenario':
          await mutate(
            '/api/admin/scenarios/' + editor.scenario.id,
            undefined,
            'DELETE',
            editor.scenario.revision,
          );
          onSaved('业务场景已删除。');
          break;
      }
    } catch (e) {
      if (deletingScenario && e instanceof ApiError && e.code === 'SCENARIO_IN_USE') {
        setError('场景引用已变化，本次未删除。');
        reloadReferences();
      } else if (e instanceof ApiError && e.status === 412) {
        retry();
        setError('记录已被修改。请关闭此窗口，核对最新内容后再操作。');
      } else setError(errorMessage(e));
    } finally {
      onBusyChange(false);
    }
  }
  const confirmation = confirmationFor(editor, directory);
  const groups =
    kind === 'user'
      ? data.groups
          .filter((group) => group.active && !group.ldap_entry_uuid)
          .map((group) => ({ id: group.id, label: group.name }))
          .sort((a, b) => compareNames(a.label, b.label))
      : [];
  return (
    <>
      <DialogTitle title={identityEditorTitle(editor)} onClose={onClose} />
      <form className={cn(sheetScrollStyles, formStackStyles)} onSubmit={submit}>
        {kind === 'user' && (
          <>
            <label>
              显示名称
              <InputField
                icon="user"
                name="display_name"
                required
                maxLength={80}
                placeholder="例如：张三"
              />
            </label>
            <label>
              账号
              <InputField
                icon="user"
                name="username"
                required
                minLength={3}
                maxLength={64}
                autoComplete="off"
                pattern="[a-zA-Z0-9][a-zA-Z0-9_.@-]*"
                placeholder="用于登录的唯一账号"
              />
            </label>
            <PasswordField label="初始密码" name="password" placeholder="至少 12 位" />
            <PasswordField
              label="确认初始密码"
              name="confirm_password"
              placeholder="再次输入初始密码"
            />
            {groups.length > 0 && (
              <IdentityPicker
                label="初始团队（选填）"
                name="group_id"
                options={groups}
                placeholder="搜索团队名称"
              />
            )}
            <Message>创建后可在账号详情添加团队或授予角色。加入团队本身不授予个人角色。</Message>
          </>
        )}
        {kind === 'reset' && (
          <>
            <p className="text-body font-medium [overflow-wrap:anywhere]">
              {accountName(editor.user)}
            </p>
            <PasswordField label="新密码" name="password" placeholder="至少 12 位" />
            <PasswordField
              label="确认新密码"
              name="confirm_password"
              placeholder="再次输入新密码"
            />
            <Message>重置后该账号需重新登录网页，CLI/MCP 访问令牌保持有效。</Message>
          </>
        )}
        {kind === 'edit-scenario' && (
          <label>
            场景操作
            <SelectField value={scenarioAction} onValueChange={setScenarioAction}>
              <option value="edit">编辑名称与说明</option>
              <option value="merge">合并到其他场景</option>
              <option value="disable">停用场景</option>
            </SelectField>
          </label>
        )}
        {(kind === 'group' ||
          kind === 'rename-team' ||
          kind === 'role' ||
          kind === 'edit-role' ||
          kind === 'scenario' ||
          (kind === 'edit-scenario' && scenarioAction === 'edit')) && (
          <label>
            名称
            <InputField
              icon="tag"
              name="name"
              defaultValue={
                kind === 'edit-role'
                  ? editor.role.name
                  : kind === 'rename-team'
                    ? editor.team.name
                    : scenario?.name
              }
              required
              maxLength={80}
              placeholder={kind === 'scenario' ? '例如：检索团队文档' : '例如：平台工程组'}
            />
          </label>
        )}
        {(kind === 'scenario' || (kind === 'edit-scenario' && scenarioAction === 'edit')) && (
          <label>
            场景说明
            <textarea
              name="description"
              defaultValue={kind === 'edit-scenario' ? scenario?.description : ''}
              maxLength={2000}
              placeholder="描述该场景的适用团队与典型任务…"
            />
          </label>
        )}
        {kind === 'edit-scenario' && scenarioAction === 'merge' && (
          <>
            <label>
              合并目标
              <SelectField name="target_id" required>
                <option value="">请选择场景</option>
                {scenarios
                  .filter((s) => s.active && s.id !== scenario?.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </SelectField>
            </label>
            <Message>已有发布可通过目标场景检索。历史发布和审核授权保留原场景 ID。</Message>
          </>
        )}
        {kind === 'edit-scenario' && scenarioAction === 'disable' && (
          <Message>停用后，后续申请需要选择其他有效场景。已发布资产仍按原受众分发。</Message>
        )}
        {deletingScenario &&
          (referencesLoading ? (
            <Message>正在查询场景引用…</Message>
          ) : referencesError ? (
            <ErrorState message={referencesError} retry={reloadReferences} />
          ) : references ? (
            <Message>
              {references.total === 0 ? (
                '当前引用数为 0，删除后不可恢复。'
              ) : (
                <>
                  <p>当前有 {references.total} 条引用，不能删除。</p>
                  <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1" aria-label="场景引用明细">
                    {scenarioReferenceLabels.map(([key, label]) =>
                      references[key] > 0 ? (
                        <li key={key}>
                          {label} {references[key]} 条
                        </li>
                      ) : null,
                    )}
                  </ul>
                </>
              )}
            </Message>
          ) : null)}
        {['role', 'edit-role'].includes(kind) && (
          <fieldset>
            <legend>角色权限</legend>
            <div className={permissionListStyles}>
              {data.permissions.map((p: string) => (
                <label className={checkLabelStyles} key={p}>
                  <input
                    type="checkbox"
                    checked={permissions.includes(p)}
                    onChange={(e) =>
                      setPermissions((v) =>
                        e.target.checked ? [...v, p] : v.filter((x) => x !== p),
                      )
                    }
                  />
                  <span>
                    {permissionLabels[p] ?? p} <code className="text-muted-ink">{p}</code>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {confirmation && (
          <>
            <p className="rounded-xl border border-line bg-page px-4 py-3 text-body font-semibold [overflow-wrap:anywhere]">
              {confirmation.subject}
            </p>
            <Message>
              {confirmation.effect}
              {kind === 'toggle-user' && editor.user.active && editor.user.id === currentUserId && (
                <p className="mt-1.5 font-semibold">这是你正在使用的账号。</p>
              )}
            </Message>
          </>
        )}
        {kind === 'membership' ? (
          <MembershipFields
            entity={editor.entity}
            data={data}
            directory={directory}
            busy={busy}
            onClose={onClose}
            error={error}
          />
        ) : kind === 'binding' ? (
          <BindingFields
            entity={editor.entity}
            teamScopeId={editor.teamScopeId}
            data={data}
            directory={directory}
            scenarios={scenarioOptions}
            resources={resources}
            retry={retry}
            busy={busy}
            onClose={onClose}
            error={error}
          />
        ) : (
          <IdentityFormActions
            busy={busy}
            disabled={deletingScenario && !canDeleteScenario}
            danger={deletingScenario || confirmation?.danger}
            onClose={onClose}
            error={error}
          >
            {confirmation?.action ??
              (deletingScenario
                ? '确认删除'
                : kind === 'edit-scenario' && scenarioAction === 'merge'
                  ? '确认合并'
                  : kind === 'edit-scenario' && scenarioAction === 'disable'
                    ? '确认停用'
                    : kind === 'user' || kind === 'group' || kind === 'role'
                      ? '创建'
                      : kind === 'reset'
                        ? '确认重置'
                        : '保存')}
          </IdentityFormActions>
        )}
      </form>
    </>
  );
}

/** 抽屉标题与弹层的可访问名称使用同一文案。 */
export function identityEditorTitle(editor: IdentityEditor) {
  switch (editor.kind) {
    case 'user':
      return '创建本地账号';
    case 'group':
      return '新建维护团队';
    case 'rename-team':
      return '修改团队名称';
    case 'role':
      return '创建自定义角色';
    case 'edit-role':
      return '编辑角色 · ' + editor.role.name;
    case 'binding':
      return '授予角色';
    case 'membership':
      return editor.entity.kind === 'account' ? '加入团队' : '添加团队成员';
    case 'remove-membership':
      return '移出团队';
    case 'revoke':
      return '回收角色授权';
    case 'scenario':
      return '登记业务场景';
    case 'edit-scenario':
      return '管理场景 · ' + editor.scenario.name;
    case 'delete-scenario':
      return '删除场景 · ' + editor.scenario.name;
    case 'reset':
      return '重置密码 · ' + editor.user.display_name;
    case 'toggle-user':
      return editor.user.active ? '停用账号' : '启用账号';
    case 'toggle-team':
      return editor.team.active ? '停用团队' : '启用团队';
  }
}

function confirmationFor(editor: IdentityEditor, directory: IdentityDirectoryModel) {
  switch (editor.kind) {
    case 'toggle-user':
      return {
        subject: accountName(editor.user),
        effect: editor.user.active
          ? '此账号将无法登录，现有网页会话、客户端授权和访问令牌会被撤销。重新启用不会恢复已撤销的连接。'
          : '此账号可以重新登录，保留的团队归属和角色授权会恢复生效。已撤销的会话和令牌不会恢复。',
        action: editor.user.active ? '确认停用' : '确认启用',
        danger: editor.user.active,
      };
    case 'toggle-team':
      return {
        subject: editor.team.name,
        effect: editor.team.active
          ? '成员暂不再继承此团队的角色，也不再以此团队成员身份访问资源。已登记的成员和授权不会被删除。'
          : '有效成员将重新继承授给此团队的角色，并恢复以团队成员身份访问资源。',
        action: editor.team.active ? '确认停用' : '确认启用',
        danger: editor.team.active,
      };
    case 'remove-membership':
      return {
        subject: `${accountName(editor.user)} → ${editor.team.name}`,
        effect: '此账号将失去通过这条成员关系取得的访问和角色，直接授予的角色不变。',
        action: '确认移出',
        danger: true,
      };
    case 'revoke': {
      const binding = editor.binding;
      const target = directory.scopeName(binding);
      return {
        subject: [
          directory.subject(binding.principal_id),
          directory.roles.get(binding.role_id)?.name ?? '未知角色',
          scopeLabels[binding.scope_type] + (target ? `：${target}` : ''),
        ].join(' / '),
        effect: directory.teams.has(binding.principal_id)
          ? '此团队的所有有效成员都将失去从这条团队授权取得的角色；其他授权不受影响。'
          : '只回收这条直接授权。通过团队或其他记录取得的角色仍会保留。',
        action: '确认回收',
        danger: true,
      };
    }
    default:
      return undefined;
  }
}
