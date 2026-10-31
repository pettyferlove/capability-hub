import {
  formStackStyles,
  panelStyles,
  accountLayoutStyles,
  sectionHeadingStyles,
  countPillStyles,
  btnStyles,
  btnPrimaryStyles,
  tableCellStatusStyles,
  tableCellActionsStyles,
  monoStyles,
  chipsStyles,
  tagStyles,
  tagTealStyles,
  textBtnStyles,
  subtleStyles,
  dangerTextStyles,
} from '../../shared/styles/recipes.js';
import {
  memberRemoveBtnStyles,
  tableActionsStyles,
  directoryCardStyles,
  directoryHeaderStyles,
  directoryIconStyles,
  directoryListStyles,
  directoryEmptyStyles,
  directoryFooterStyles,
  roleGridStyles,
  roleCardStyles,
  permissionTagStyles,
  tableScopeStyles,
  tableScopeNameStyles,
} from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { errorMessage } from '../../shared/api/error-message.js';
import type { IdentitySnapshotResponse, PublicUserResponse } from '@capability-hub/contracts/http';
import type { ScenarioResponse } from '@capability-hub/contracts/http';
import { Plus, ShieldCheck, Trash2 } from '../../shared/icons/lucide.js';
import { AppIcon } from '../../shared/icons/AppIcon.js';
import usersRoundIcon from '@iconify-icons/lucide/users-round';
import layersIcon from '@iconify-icons/lucide/layers';
import userPlusIcon from '@iconify-icons/lucide/user-plus';
import arrowRightIcon from '@iconify-icons/lucide/arrow-right';
import { useState } from 'react';
import { api, mutate } from '../../shared/api/client.js';
import { useQuery } from '../../shared/api/use-query.js';
import { DataTable } from '../../shared/components/DataTable.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { CardGridSkeleton, ListSkeleton, TableSkeleton } from '../../shared/components/Skeleton.js';
import { useHub } from '../../shared/context/HubContext.js';
import type { IdentityEditorKind, IdentityEditorRecord } from './IdentityAdminForm.js';
import { IdentityAdminForm } from './IdentityAdminForm.js';
export function AdministrationPanel({ tab }: { tab: string }) {
  const { refresh, reload } = useHub();
  const { data, error, loading } = useQuery<IdentitySnapshotResponse>(
    '/api/admin/identity',
    refresh,
  );
  const [dialog, setDialog] = useState<IdentityEditorKind | ''>(''),
    [activeUser, setActiveUser] = useState<IdentityEditorRecord>(),
    [message, setMessage] = useState(''),
    [failure, setFailure] = useState(false);
  const {
    data: scenarios,
    error: scenarioError,
    loading: scenariosLoading,
  } = useQuery<ScenarioResponse[]>('/api/scenarios', refresh);
  async function remove(path: string) {
    try {
      await api(path, { method: 'DELETE' });
      setFailure(false);
      setMessage('授权已回收，后续请求按最新权限判断。');
      reload();
    } catch (e) {
      setFailure(true);
      setMessage(errorMessage(e));
    }
  }
  async function toggle(u: PublicUserResponse) {
    try {
      await mutate('/api/admin/users/' + u.id, { active: !u.active }, 'PATCH', u.revision);
      setFailure(false);
      setMessage(u.active ? '账号已停用，会话与令牌已撤销。' : '账号已启用。');
      reload();
    } catch (e) {
      setFailure(true);
      setMessage(errorMessage(e));
    }
  }
  if (error) return <ErrorState message={error} retry={reload} />;
  if (loading && !data)
    return (
      <div className={formStackStyles}>
        {tab === 'identity' ? (
          <>
            <section className={panelStyles}>
              <TableSkeleton label="正在加载账号…" rows={4} columns={4} />
            </section>
            <div className={accountLayoutStyles}>
              <section className={panelStyles}>
                <ListSkeleton label="正在加载维护团队…" rows={3} />
              </section>
              <section className={panelStyles}>
                <ListSkeleton label="正在加载业务场景…" rows={3} />
              </section>
            </div>
          </>
        ) : (
          <>
            <section className={panelStyles}>
              <CardGridSkeleton label="正在加载角色定义…" count={4} variant="role" />
            </section>
            <section className={panelStyles}>
              <TableSkeleton label="正在加载角色授权…" rows={4} columns={4} />
            </section>
          </>
        )}
      </div>
    );
  if (!data) return null;
  const person = (id: string) =>
    data.users.find((u) => u.id === id)?.display_name ??
    data.groups.find((g) => g.id === id)?.name ??
    id;
  return (
    <div className={formStackStyles}>
      {message && <Message error={failure}>{message}</Message>}
      {tab === 'identity' ? (
        <>
          <section className={panelStyles}>
            <div className={sectionHeadingStyles}>
              <h2>
                账号 <span className={countPillStyles}>{data.users.length}</span>
              </h2>
              <button className={cn(btnStyles, btnPrimaryStyles)} onClick={() => setDialog('user')}>
                <Plus size={15} />
                创建账号
              </button>
            </div>
            <DataTable label="账号">
              <table>
                <thead>
                  <tr>
                    <th>成员</th>
                    <th>团队</th>
                    <th className={tableCellStatusStyles}>状态</th>
                    <th className={tableCellActionsStyles}>管理</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.display_name}</strong>
                        <small className={monoStyles}>{u.username}</small>
                      </td>
                      <td>
                        <div className={chipsStyles}>
                          {data.memberships
                            .filter((m) => m.user_id === u.id)
                            .map((m) => (
                              <span className={tagStyles} key={m.id}>
                                {person(m.group_id)}
                                <button
                                  className={memberRemoveBtnStyles}
                                  aria-label={'移出团队 ' + person(m.group_id)}
                                  onClick={() => remove('/api/admin/memberships/' + m.id)}
                                >
                                  移出
                                </button>
                              </span>
                            ))}
                        </div>
                      </td>
                      <td className={tableCellStatusStyles}>
                        <span className={cn(tagStyles, u.active ? tagTealStyles : '')}>
                          {u.active ? '有效' : '已停用'}
                        </span>
                      </td>
                      <td className={tableCellActionsStyles}>
                        <div className={tableActionsStyles}>
                          <button className={textBtnStyles} onClick={() => toggle(u)}>
                            {u.active ? '停用' : '启用'}
                          </button>
                          <button
                            className={textBtnStyles}
                            onClick={() => {
                              setActiveUser(u);
                              setDialog('reset');
                            }}
                          >
                            重置密码
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          </section>
          <div className={cn(accountLayoutStyles, 'items-stretch')}>
            <section
              className={cn(panelStyles, directoryCardStyles)}
              aria-labelledby="teams-heading"
            >
              <div className={directoryHeaderStyles}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={directoryIconStyles} aria-hidden="true">
                    <AppIcon icon={usersRoundIcon} size={19} />
                  </span>
                  <div className="min-w-0">
                    <h2 id="teams-heading" className="flex flex-wrap items-center gap-2">
                      维护团队 <span className={countPillStyles}>{data.groups.length}</span>
                    </h2>
                    <p className="mt-1 text-caption text-muted-ink">组织成员，共同维护共享资产</p>
                  </div>
                </div>
                <button className={cn(btnStyles, 'shrink-0')} onClick={() => setDialog('group')}>
                  <Plus size={15} aria-hidden="true" />
                  新建团队
                </button>
              </div>
              {data.groups.length ? (
                <ul className={directoryListStyles} aria-label="维护团队列表">
                  {data.groups.map((g) => (
                    <li key={g.id} className="flex min-w-0 items-center gap-3 px-3.5 py-3">
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-body font-semibold text-brand"
                        aria-hidden="true"
                      >
                        {Array.from(g.name)[0]}
                      </span>
                      <strong className="min-w-0 flex-1 break-words text-body font-medium [overflow-wrap:anywhere]">
                        {g.name}
                      </strong>
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-caption text-muted-ink">
                        <AppIcon icon={usersRoundIcon} size={14} aria-hidden="true" />
                        {data.memberships.filter((m) => m.group_id === g.id).length} 位成员
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className={directoryEmptyStyles}>
                  <AppIcon
                    icon={usersRoundIcon}
                    size={24}
                    className="text-muted-ink"
                    aria-hidden="true"
                  />
                  <p className="font-medium text-ink">还没有维护团队</p>
                  <p className="text-muted-ink">新建团队后，即可添加协作成员。</p>
                </div>
              )}
              <div className={directoryFooterStyles}>
                <button
                  className={cn(textBtnStyles, 'w-full justify-between py-1')}
                  onClick={() => setDialog('membership')}
                >
                  <span className="inline-flex items-center gap-2">
                    <AppIcon icon={userPlusIcon} size={16} aria-hidden="true" />
                    加入团队成员
                  </span>
                  <AppIcon icon={arrowRightIcon} size={15} aria-hidden="true" />
                </button>
              </div>
            </section>
            <section
              className={cn(panelStyles, directoryCardStyles)}
              aria-labelledby="scenarios-heading"
            >
              <div className={directoryHeaderStyles}>
                <div className="flex min-w-0 items-center gap-3">
                  <span className={directoryIconStyles} aria-hidden="true">
                    <AppIcon icon={layersIcon} size={19} />
                  </span>
                  <div className="min-w-0">
                    <h2 id="scenarios-heading" className="flex flex-wrap items-center gap-2">
                      业务场景
                      {scenarios && !scenarioError && (
                        <span className={countPillStyles}>{scenarios.length}</span>
                      )}
                    </h2>
                    <p className="mt-1 text-caption text-muted-ink">按业务划分资产的审核范围</p>
                  </div>
                </div>
                <button className={cn(btnStyles, 'shrink-0')} onClick={() => setDialog('scenario')}>
                  <Plus size={15} aria-hidden="true" />
                  登记场景
                </button>
              </div>
              {scenarioError ? (
                <ErrorState message={scenarioError} retry={reload} />
              ) : scenariosLoading && !scenarios ? (
                <ListSkeleton label="正在加载业务场景…" rows={3} />
              ) : !scenarios?.length ? (
                <div className={directoryEmptyStyles}>
                  <AppIcon
                    icon={layersIcon}
                    size={24}
                    className="text-muted-ink"
                    aria-hidden="true"
                  />
                  <p className="font-medium text-ink">还没有业务场景</p>
                  <p className="text-muted-ink">从一个业务开始，为资产设置清晰的审核范围。</p>
                </div>
              ) : (
                <ul className={directoryListStyles} aria-label="业务场景列表">
                  {scenarios.map((s) => (
                    <li className="flex min-w-0 items-start gap-3 px-3.5 py-3" key={s.id}>
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"
                        aria-hidden="true"
                      >
                        <AppIcon icon={layersIcon} size={17} />
                      </span>
                      <div className="min-w-0 self-center [overflow-wrap:anywhere]">
                        <strong className="block text-body font-medium">{s.name}</strong>
                        <p className="mt-1 whitespace-pre-wrap text-caption leading-relaxed text-muted-ink">
                          {s.description || '尚未填写场景说明'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div
                className={cn(
                  directoryFooterStyles,
                  'flex items-center gap-2 text-caption text-muted-ink',
                )}
              >
                <ShieldCheck size={16} className="shrink-0" aria-hidden="true" />
                <span>在角色授权中配置场景审核权限</span>
              </div>
            </section>
          </div>
        </>
      ) : (
        <>
          <section className={panelStyles}>
            <div className={sectionHeadingStyles}>
              <div>
                <h2>角色定义</h2>
                <p className={subtleStyles}>
                  内置角色保留职责边界，也可创建包含明确权限的自定义角色。
                </p>
              </div>
              <button className={btnStyles} onClick={() => setDialog('role')}>
                <Plus size={15} />
                自定义角色
              </button>
            </div>
            <div className={roleGridStyles}>
              {data.roles.map((r) => (
                <div className={roleCardStyles} key={r.id}>
                  <ShieldCheck size={22} />
                  <h3>
                    {r.name}
                    <span className={tagStyles}>{r.builtin ? '内置' : '自定义'}</span>
                  </h3>
                  <div className={chipsStyles}>
                    {r.permissions.length ? (
                      r.permissions.map((p: string) => (
                        <code className={permissionTagStyles} key={p}>
                          {p}
                        </code>
                      ))
                    ) : (
                      <small className={subtleStyles}>按获批受众读取内容</small>
                    )}
                  </div>
                  {!r.builtin && (
                    <button
                      className={textBtnStyles}
                      onClick={() => {
                        setActiveUser(r);
                        setDialog('edit-role');
                      }}
                    >
                      编辑权限
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
          <section className={panelStyles}>
            <div className={sectionHeadingStyles}>
              <h2>角色授权</h2>
              <button
                className={cn(btnStyles, btnPrimaryStyles)}
                onClick={() => setDialog('binding')}
              >
                <Plus size={15} />
                授予角色
              </button>
            </div>
            <Message>
              平台、团队、来源、资产和场景作用域分别判断。提交者不能自审，角色不授予目标 MCP
              的业务权限。
            </Message>
            <DataTable label="角色授权">
              <table>
                <thead>
                  <tr>
                    <th>授权主体</th>
                    <th>角色</th>
                    <th>作用域</th>
                    <th className={tableCellActionsStyles}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bindings.map((b) => (
                    <tr key={b.id}>
                      <td>{person(b.principal_id)}</td>
                      <td>{data.roles.find((r) => r.id === b.role_id)?.name}</td>
                      <td>
                        <div className={tableScopeStyles}>
                          <span className={tagStyles}>
                            {
                              (
                                {
                                  platform: '平台',
                                  team: '团队',
                                  source: '来源',
                                  asset: '资产',
                                  scenario: '场景',
                                } as Record<string, string>
                              )[b.scope_type]
                            }
                          </span>
                          {b.scope_id && (
                            <span className={tableScopeNameStyles}>
                              {b.scope_type === 'team' ? person(b.scope_id) : b.scope_id}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={tableCellActionsStyles}>
                        <button
                          className={cn(textBtnStyles, dangerTextStyles)}
                          onClick={() => remove('/api/admin/bindings/' + b.id)}
                        >
                          <Trash2 size={14} />
                          回收
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTable>
          </section>
        </>
      )}
      <Overlay open={!!dialog} onClose={() => setDialog('')} label="身份权限管理" variant="sheet">
        {dialog && (
          <IdentityAdminForm
            kind={dialog}
            data={data}
            scenarios={scenarios ?? []}
            user={activeUser}
            onClose={() => setDialog('')}
            onSaved={() => {
              setDialog('');
              setMessage('已保存，权限变更已生效。');
              setFailure(false);
              reload();
            }}
          />
        )}
      </Overlay>
    </div>
  );
}
