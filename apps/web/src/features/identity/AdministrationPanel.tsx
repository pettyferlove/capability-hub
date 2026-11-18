import type {
  IdentitySnapshotResponse,
  ManagedScenarioResponse,
  RoleScopeOptionsResponse,
} from '@capability-hub/contracts/http';
import { useMemo, useState } from 'react';
import { useQuery } from '../../shared/api/use-query.js';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { ListSkeleton } from '../../shared/components/Skeleton.js';
import { useHub } from '../../shared/context/HubContext.js';
import { ArrowRight, Layers3, Plus, ShieldCheck } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import {
  btnStyles,
  chipsStyles,
  countPillStyles,
  dangerTextStyles,
  formStackStyles,
  panelStyles,
  sectionHeadingStyles,
  sheetScrollStyles,
  subtleStyles,
  tagStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';
import { IdentityAdminForm, identityEditorTitle } from './IdentityAdminForm.js';
import { IdentityDetail } from './IdentityDetail.js';
import { IdentityDirectory } from './IdentityDirectory.js';
import {
  identityDirectory,
  permissionLabels,
  type IdentityEditor,
  type IdentityEntity,
  type IdentityView,
} from './identity-directory.js';
import {
  directoryCardStyles,
  directoryEmptyStyles,
  directoryFooterStyles,
  directoryHeaderStyles,
  directoryIconStyles,
  directoryListStyles,
  permissionTagStyles,
  roleCardStyles,
  roleGridStyles,
} from './styles.js';

/** 各管理栏目共用快照；变更成功后重取服务端状态，而不在本地推算权限。 */
export function AdministrationPanel({
  view,
  initialRole,
}: {
  view: IdentityView;
  initialRole?: string;
}) {
  const { me, refresh, reload } = useHub();
  const snapshot = useQuery<IdentitySnapshotResponse>('/api/admin/identity', refresh);
  const { data } = snapshot;
  const [editor, setEditor] = useState<IdentityEditor>();
  const [editorBusy, setEditorBusy] = useState(false);
  const [trail, setTrail] = useState<IdentityEntity[]>([]);
  const [message, setMessage] = useState('');
  const entity = trail.at(-1);
  const detailTitle = entity?.kind === 'team' ? '团队详情' : '账号详情';
  const mayShowGrants = view === 'grants' || !!entity;
  const assigning = editor?.kind === 'binding';
  const scenarios = useQuery<ManagedScenarioResponse[]>(
    view === 'scenarios' ||
      assigning ||
      (mayShowGrants && data?.bindings.some(({ scope_type }) => scope_type === 'scenario'))
      ? '/api/admin/scenarios'
      : null,
    refresh,
  );
  const resources = useQuery<RoleScopeOptionsResponse>(
    assigning ||
      (mayShowGrants &&
        data?.bindings.some(({ scope_type }) => scope_type === 'source' || scope_type === 'asset'))
      ? '/api/admin/role-scope-options'
      : null,
    refresh,
  );
  const directory = useMemo(
    () => data && identityDirectory(data, scenarios.data, resources.data),
    [data, scenarios.data, resources.data],
  );
  const user = entity?.kind === 'account' ? directory?.users.get(entity.id) : undefined;
  const team = entity?.kind === 'team' ? directory?.teams.get(entity.id) : undefined;

  function open(entity: IdentityEntity) {
    setMessage('');
    setTrail((current) => {
      const index = current.findIndex((item) => item.id === entity.id && item.kind === entity.kind);
      return index >= 0 ? current.slice(0, index + 1) : [...current, entity];
    });
  }
  function edit(editor: IdentityEditor) {
    setMessage('');
    setEditor(editor);
  }
  function closeEditor() {
    if (!editorBusy) setEditor(undefined);
  }
  function saved(message: string, created?: IdentityEntity) {
    setEditor(undefined);
    if (created) setTrail([created]);
    setMessage(message);
    reload();
  }
  const feedback = message ? <Message>{message}</Message> : null;
  const scopeNotice = ((view !== 'scenarios' && scenarios.error) || resources.error) && (
    <Message error className="mb-3">
      部分作用对象名称未能加载。{' '}
      <button type="button" className={textBtnStyles} onClick={reload}>
        重新加载
      </button>
    </Message>
  );
  const editorVariant =
    editor?.kind === 'delete-scenario'
      ? 'palette'
      : editor &&
          ['toggle-user', 'toggle-team', 'remove-membership', 'revoke'].includes(editor.kind)
        ? 'showcase'
        : 'sheet';

  if (snapshot.error) return <ErrorState message={snapshot.error} retry={reload} />;
  if (!data || !directory) {
    return (
      <section className={panelStyles}>
        <ListSkeleton label="正在加载身份管理数据…" rows={5} />
      </section>
    );
  }
  const scenarioList = scenarios.data ?? [];
  return (
    <div className={formStackStyles}>
      {!entity && feedback}
      {view === 'scenarios' ? (
        <section
          className={cn(panelStyles, directoryCardStyles)}
          aria-labelledby="scenarios-heading"
        >
          <div className={directoryHeaderStyles}>
            <div className="flex min-w-0 items-center gap-3">
              <span className={directoryIconStyles} aria-hidden="true">
                <Layers3 size={19} />
              </span>
              <div className="min-w-0">
                <h2 id="scenarios-heading" className="flex flex-wrap items-center gap-2">
                  业务场景
                  {scenarios.data && !scenarios.error && (
                    <span className={countPillStyles}>{scenarioList.length}</span>
                  )}
                </h2>
                <p className="mt-1 text-caption text-muted-ink">按业务划分资产的审核范围</p>
              </div>
            </div>
            <button
              type="button"
              className={cn(btnStyles, 'shrink-0')}
              onClick={() => edit({ kind: 'scenario' })}
            >
              <Plus size={15} aria-hidden="true" />
              登记场景
            </button>
          </div>
          {scenarios.error ? (
            <ErrorState message={scenarios.error} retry={reload} />
          ) : scenarios.loading && !scenarios.data ? (
            <ListSkeleton label="正在加载业务场景…" rows={3} />
          ) : !scenarioList.length ? (
            <div className={directoryEmptyStyles}>
              <Layers3 size={24} className="text-muted-ink" aria-hidden="true" />
              <p className="font-medium text-ink">还没有业务场景</p>
              <p className="text-muted-ink">从一个业务开始，为资产设置清晰的审核范围。</p>
            </div>
          ) : (
            <ul className={directoryListStyles} aria-label="业务场景列表">
              {scenarioList.map((s) => (
                <li className="flex min-w-0 items-start gap-3 px-3.5 py-3" key={s.id}>
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"
                    aria-hidden="true"
                  >
                    <Layers3 size={17} />
                  </span>
                  <div className="min-w-0 self-center [overflow-wrap:anywhere]">
                    <strong className="block text-body font-medium">{s.name}</strong>
                    <p className="mt-1 whitespace-pre-wrap text-caption leading-relaxed text-muted-ink">
                      {s.description || '尚未填写场景说明'}
                    </p>
                    {!s.active && (
                      <small>
                        {s.merged_into
                          ? '已合并至 ' +
                            (scenarioList.find((item) => item.id === s.merged_into)?.name ??
                              s.merged_into)
                          : '已停用'}
                      </small>
                    )}
                  </div>
                  {(s.active || !s.merged_into) && (
                    <div className="ml-auto flex shrink-0 gap-2 self-center">
                      {s.active && (
                        <button
                          type="button"
                          className={textBtnStyles}
                          aria-label={'管理场景「' + s.name + '」'}
                          onClick={() => edit({ kind: 'edit-scenario', scenario: s })}
                        >
                          管理
                        </button>
                      )}
                      {!s.merged_into && (
                        <button
                          type="button"
                          className={cn(textBtnStyles, dangerTextStyles)}
                          aria-label={'删除场景「' + s.name + '」'}
                          onClick={() => edit({ kind: 'delete-scenario', scenario: s })}
                        >
                          删除
                        </button>
                      )}
                    </div>
                  )}
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
            <a href="/account?tab=roles" className={textBtnStyles}>
              前往角色授权配置场景审核权限 <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </section>
      ) : view === 'roles' ? (
        <section className={panelStyles}>
          <div className={sectionHeadingStyles}>
            <div>
              <h2>角色定义</h2>
              <p className={subtleStyles}>
                角色定义权限；授予角色时另选作用范围。编辑自定义角色会影响已持有该角色的主体。
              </p>
            </div>
            <button type="button" className={btnStyles} onClick={() => edit({ kind: 'role' })}>
              <Plus size={15} />
              创建自定义角色
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
                      <span className={permissionTagStyles} title={p} key={p}>
                        {permissionLabels[p] ?? p}
                      </span>
                    ))
                  ) : (
                    <small className={subtleStyles}>按获批受众读取内容</small>
                  )}
                </div>
                <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <a href={'/account?tab=roles&role=' + r.id} className={textBtnStyles}>
                    查看授权（{data.bindings.filter((binding) => binding.role_id === r.id).length}）
                  </a>
                  {!r.builtin && (
                    <button
                      type="button"
                      className={textBtnStyles}
                      onClick={() => edit({ kind: 'edit-role', role: r })}
                    >
                      编辑角色
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <IdentityDirectory
          key={`${view}:${initialRole ?? ''}`}
          view={view}
          data={data}
          directory={directory}
          initialRole={initialRole}
          onOpen={open}
          onEdit={edit}
          resourceNotice={scopeNotice}
        />
      )}
      <Overlay open={!!entity} onClose={() => setTrail([])} label={detailTitle} variant="sheet">
        {entity &&
          (user || team ? (
            <IdentityDetail
              key={entity.id}
              {...(user ? { user } : { team: team! })}
              directory={directory}
              onOpen={open}
              onEdit={edit}
              onClose={() => setTrail([])}
              onBack={
                trail.length > 1 ? () => setTrail((current) => current.slice(0, -1)) : undefined
              }
              feedback={feedback}
              resourceNotice={scopeNotice}
            />
          ) : (
            <>
              <DialogTitle title={detailTitle} onClose={() => setTrail([])} />
              <div className={sheetScrollStyles}>
                {snapshot.loading ? (
                  <ListSkeleton label="正在加载详情…" rows={2} />
                ) : (
                  <Message error>未找到此记录。</Message>
                )}
              </div>
            </>
          ))}
      </Overlay>
      <Overlay
        open={!!editor}
        onClose={closeEditor}
        label={editor ? identityEditorTitle(editor) : '身份权限管理'}
        variant={editorVariant}
      >
        {editor && (
          <IdentityAdminForm
            key={editor.kind}
            editor={editor}
            data={data}
            directory={directory}
            scenarioOptions={scenarios}
            resources={resources}
            retry={reload}
            currentUserId={me?.id}
            busy={editorBusy}
            onBusyChange={setEditorBusy}
            onClose={closeEditor}
            onSaved={saved}
          />
        )}
      </Overlay>
    </div>
  );
}
