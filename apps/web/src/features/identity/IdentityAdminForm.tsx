import { InputField } from '../../shared/components/InputField.js';
import { permissionScopeIcons } from '../../shared/components/select-icons.js';
import {
  sheetScrollStyles,
  formStackStyles,
  checkLabelStyles,
} from '../../shared/styles/recipes.js';
import { permissionListStyles } from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type {
  IdentitySnapshotResponse,
  ManagementAssetResponse,
  SourceResponse,
} from '@capability-hub/contracts/http';
import type { ScenarioResponse } from '@capability-hub/contracts/http';
import { useState, type SubmitEvent } from 'react';
import { mutate } from '../../shared/api/client.js';
import { formFields } from '../../shared/api/form-fields.js';
import { useQuery } from '../../shared/api/use-query.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { Message } from '../../shared/components/Message.js';
import { PasswordField } from '../../shared/components/PasswordField.js';
import { Submit } from '../../shared/components/Submit.js';
/**
 * 账号、团队、角色、绑定与场景共用的编辑表单：`kind` 同时决定提交路径、字段集合与标题，
 * 且每类形态只提交自己的字段。`reset` 与 `edit-role` 必须带 `user`（缺失直接抛错），
 * 这两类写操作额外回传 `user.revision` 做乐观并发校验；其余形态均为新建语义。
 */
export function IdentityAdminForm({
  kind,
  data,
  user,
  scenarios,
  onClose,
  onSaved,
}: {
  kind: IdentityEditorKind;
  data: IdentitySnapshotResponse;
  user?: IdentityEditorRecord;
  scenarios: ScenarioResponse[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [permissions, setPermissions] = useState<string[]>(
      kind === 'edit-role' ? (user?.permissions ?? []) : [],
    ),
    [scope, setScope] = useState('platform');
  const { data: sources } = useQuery<SourceResponse[]>('/api/sources');
  const { data: assets } = useQuery<ManagementAssetResponse[]>('/api/management/assets');
  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const b = formFields(e.currentTarget);
      if (['reset', 'edit-role'].includes(kind) && !user) throw new Error('请选择要编辑的记录');
      if (['user', 'reset'].includes(kind)) {
        if (b.password !== b.confirm_password) throw new Error('两次输入的密码不一致');
        delete b.confirm_password;
      }
      if (kind === 'user')
        await mutate('/api/admin/users', {
          ...b,
          group_ids: b.group_id ? [b.group_id] : [],
          group_id: undefined,
        });
      else if (kind === 'reset')
        await mutate(
          '/api/admin/users/' + user!.id,
          { password: b.password },
          'PATCH',
          user!.revision,
        );
      else if (kind === 'edit-role')
        await mutate(
          '/api/admin/roles/' + user!.id,
          { ...b, permissions },
          'PATCH',
          user!.revision,
        );
      else if (kind === 'role') await mutate('/api/admin/roles', { ...b, permissions });
      else if (kind === 'binding')
        await mutate('/api/admin/bindings', {
          ...b,
          scope_type: scope,
          scope_id: scope === 'platform' ? '' : b.scope_id,
        });
      else
        await mutate(
          '/api/admin/' +
            (
              { group: 'groups', membership: 'memberships', scenario: 'scenarios' } as Record<
                string,
                string
              >
            )[kind],
          b,
        );
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const title = (
    {
      user: '创建账号',
      group: '新建维护团队',
      role: '创建自定义角色',
      'edit-role': '编辑角色权限',
      binding: '授予角色',
      membership: '添加团队成员',
      scenario: '登记业务场景',
      reset: '重置 ' + user?.display_name + ' 的密码',
    } as Record<string, string>
  )[kind];
  const groupSelect = (
    <label>
      团队
      <SelectField name="group_id" required>
        <option value="">请选择团队</option>
        {data.groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </SelectField>
    </label>
  );
  return (
    <>
      <DialogTitle title={title} onClose={onClose} />
      <form className={cn(sheetScrollStyles, formStackStyles)} onSubmit={submit}>
        {kind === 'user' && (
          <>
            <label>
              显示名称
              <InputField icon="user" name="display_name" required maxLength={80} />
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
              />
            </label>
            <PasswordField label="初始密码" name="password" />
            <PasswordField label="确认初始密码" name="confirm_password" />
            {groupSelect}
            <Message>创建后请单独授予维护或审核角色。加入团队本身不授予管理权限。</Message>
          </>
        )}
        {kind === 'reset' && (
          <>
            <PasswordField label="新密码" name="password" />
            <PasswordField label="确认新密码" name="confirm_password" />
            <Message>重置后该账号需重新登录网页，CLI/MCP 访问令牌保持有效。</Message>
          </>
        )}
        {['group', 'role', 'edit-role', 'scenario'].includes(kind) && (
          <label>
            名称
            <InputField
              icon="tag"
              name="name"
              defaultValue={kind === 'edit-role' ? user?.name : ''}
              required
              maxLength={80}
            />
          </label>
        )}
        {kind === 'scenario' && (
          <label>
            场景说明
            <textarea name="description" maxLength={2000} />
          </label>
        )}
        {kind === 'membership' && (
          <>
            <label>
              成员
              <SelectField name="user_id" required>
                {data.users
                  .filter((u) => u.active)
                  .map((u) => (
                    <option value={u.id} key={u.id}>
                      {u.display_name} · {u.username}
                    </option>
                  ))}
              </SelectField>
            </label>
            {groupSelect}
          </>
        )}
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
                  <code>{p}</code>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {kind === 'binding' && (
          <>
            <label>
              授权主体
              <SelectField name="principal_id" required>
                <optgroup label="成员">
                  {data.users
                    .filter((u) => u.active)
                    .map((u) => (
                      <option value={u.id} key={u.id}>
                        {u.display_name}
                      </option>
                    ))}
                </optgroup>
                <optgroup label="团队">
                  {data.groups.map((g) => (
                    <option value={g.id} key={g.id}>
                      {g.name}（团队）
                    </option>
                  ))}
                </optgroup>
              </SelectField>
            </label>
            <label>
              角色
              <SelectField name="role_id" required>
                {data.roles.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name}
                  </option>
                ))}
              </SelectField>
            </label>
            <label>
              作用域
              <SelectField
                optionIcons={permissionScopeIcons}
                value={scope}
                onValueChange={(nextValue) => setScope(nextValue)}
              >
                <option value="platform">全平台</option>
                <option value="team">指定团队</option>
                <option value="source">指定来源</option>
                <option value="asset">指定资产</option>
                <option value="scenario">指定场景</option>
              </SelectField>
            </label>
            {scope !== 'platform' && (
              <label>
                作用对象
                <SelectField name="scope_id" required>
                  <option value="">请选择对象</option>
                  {(scope === 'team'
                    ? data.groups
                    : scope === 'scenario'
                      ? scenarios
                      : scope === 'source'
                        ? (sources ?? [])
                        : (assets ?? [])
                  ).map((r) => (
                    <option key={r.id} value={r.id}>
                      {'name' in r ? r.name : 'slug' in r ? r.slug : r.repository_identity}
                    </option>
                  ))}
                </SelectField>
              </label>
            )}
          </>
        )}
        {error && <Message error>{error}</Message>}
        <Submit busy={busy}>保存</Submit>
      </form>
    </>
  );
}

/**
 * 各编辑形态共用的最小记录快照；`revision` 随写请求回传，服务端据此拒绝过期写入，
 * 因此从列表里拿到的记录不能跨刷新长期持有。不同形态用到的字段不同：
 * `permissions` 只对角色生效，`name` 只对团队与角色生效。
 */
export interface IdentityEditorRecord {
  id: string;
  revision: number;
  display_name?: string;
  permissions?: string[];
  name?: string;
}

/**
 * 表单形态：`user`/`reset` 面向账号，`group`/`membership` 面向团队与成员关系，
 * `role`/`edit-role` 面向角色定义与授权，`binding` 面向「主体—角色—作用域」绑定，
 * `scenario` 登记业务场景；每种形态对应一条独立的写接口，不共享提交载荷。
 */
export type IdentityEditorKind =
  'user' | 'reset' | 'group' | 'role' | 'edit-role' | 'binding' | 'membership' | 'scenario';
