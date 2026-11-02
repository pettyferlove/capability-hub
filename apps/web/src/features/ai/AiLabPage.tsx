import { useEffect, useState } from 'react';
import { aiCatalogResponseSchema, type AiCatalogResponse } from '@capability-hub/contracts';
import { api } from '../../shared/api/client.js';
import { PageHead } from '../../shared/components/PageHead.js';
import { useHub } from '../../shared/context/HubContext.js';
import { History, Plus } from '../../shared/icons/lucide.js';
import { navigate } from '../../shared/navigation/history-navigation.js';
import { btnStyles, btnPrimaryStyles } from '../../shared/styles/recipes.js';
import { ExecutionLedger } from './ExecutionLedger.js';
import { ExecutionPanel } from './ExecutionPanel.js';
import { NewExecution } from './NewExecution.js';
import { useAiExecution } from './use-ai-execution.js';
import { fillStyles, workspaceStyles } from './styles.js';
import { cn } from '../../shared/styles/cn.js';

/** 记录、诊断和新建表单各有独立链接，返回列表时保留筛选和页码。 */
export default function AiLabPage({ query }: { query: string }) {
  const { me } = useHub();
  const canExecute = !!me?.capabilities.can_ai;
  const params = new URLSearchParams(query);
  const selected = params.get('execution') ?? '';
  const creating = !selected && canExecute && params.get('new') === '1';
  const listing = !selected && !creating;
  const [catalog, setCatalog] = useState<AiCatalogResponse>();
  const [catalogError, setCatalogError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const execution = useAiExecution(selected, refresh);
  const view = execution.view?.execution.id === selected ? execution.view : undefined;
  useEffect(() => {
    if (!canExecute || listing) return;
    const controller = new AbortController();
    setCatalogError('');
    void api('/api/ai/catalog', { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setCatalog(aiCatalogResponseSchema.parse(data));
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setCatalogError(failure instanceof Error ? failure.message : '加载失败');
      });
    return () => controller.abort();
  }, [canExecute, listing]);
  return (
    <div className={fillStyles}>
      <PageHead
        eyebrow="AI CONSOLE"
        title="AI 控制台"
        description="检索各用户的执行记录，回看 Agent 流程并导出排查材料。"
        action={
          <div className="flex flex-wrap gap-2">
            {!listing && (
              <a className={btnStyles} href="/ai">
                <History size={15} />
                返回执行记录
              </a>
            )}
            {canExecute && !creating && (
              <button
                type="button"
                className={cn(btnStyles, btnPrimaryStyles)}
                onClick={() => navigate('/ai?new=1')}
              >
                <Plus size={15} />
                新建任务
              </button>
            )}
          </div>
        }
      />
      <div className={cn(workspaceStyles, 'flex-col')}>
        <ExecutionLedger active={listing} readOnly={!canExecute} />
        {!listing && (catalogError || execution.error) && (
          <p role="alert" className="bg-danger-soft px-5 py-3 text-danger">
            {catalogError || execution.error}
          </p>
        )}
        {creating && catalog && (
          <NewExecution
            catalog={catalog}
            onCreated={(id) => navigate('/ai?execution=' + encodeURIComponent(id))}
          />
        )}
        {((creating && !catalog && !catalogError) || (selected && !view && !execution.error)) && (
          <p role="status" className="m-auto text-muted-ink">
            正在加载工作区…
          </p>
        )}
        {selected && view && (
          <ExecutionPanel
            key={selected}
            view={view}
            diagnostics
            canManage={
              me?.id === view.execution.owner_id &&
              canExecute &&
              !!catalog?.operations.some((item) => item.id === view.execution.operation_id)
            }
            connection={execution.connection}
            onRefresh={() => setRefresh((value) => value + 1)}
          />
        )}
      </div>
    </div>
  );
}
