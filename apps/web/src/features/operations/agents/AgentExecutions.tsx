import { useEffect, useState, type ReactNode } from 'react';
import {
  aiCatalogResponseSchema,
  operationsAgentApi,
  type AiCatalogResponse,
} from '@capability-hub/contracts';
import { api } from '../../../shared/api/client.js';
import { useHub } from '../../../shared/context/HubContext.js';
import { History, Plus } from '../../../shared/icons/lucide.js';
import { operationsHref } from '../navigation.js';
import { navigate } from '../../../shared/navigation/history-navigation.js';
import {
  btnStyles,
  btnPrimaryStyles,
  sectionHeadingStyles,
  subtleStyles,
} from '../../../shared/styles/recipes.js';
import { ExecutionLedger } from './ExecutionLedger.js';
import { ExecutionDiagnostics } from './ExecutionDiagnostics.js';
import { ExecutionPanel } from '../../ai/ExecutionPanel.js';
import { NewExecution } from './NewExecution.js';
import { WorkspaceSkeleton } from '../OperationsSkeleton.js';
import { useAiExecution } from '../../ai/use-ai-execution.js';
import { fillStyles } from '../../ai/styles.js';
import { workspaceStyles } from './styles.js';
import { cn } from '../../../shared/styles/cn.js';

/** 记录、诊断和新建表单各有独立链接，返回列表时保留筛选和页码。 */
export function AgentExecutions({
  selected,
  creating,
  viewSwitch,
}: {
  selected: string;
  creating: boolean;
  viewSwitch?: ReactNode;
}) {
  const { me } = useHub();
  const canExecute = !!me?.capabilities.can_ai;
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
    void api(operationsAgentApi.catalog, { signal: controller.signal })
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
      <div className={sectionHeadingStyles}>
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2>Agent 执行</h2>
            {viewSwitch}
          </div>
          <p className={subtleStyles}>检索各用户的执行记录，回看流程并导出排查材料。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!listing && (
            <a className={btnStyles} href={operationsHref('agents')}>
              <History size={15} />
              返回执行记录
            </a>
          )}
          {canExecute && !creating && (
            <button
              type="button"
              className={cn(btnStyles, btnPrimaryStyles)}
              onClick={() => navigate(operationsHref('agents', { new: '1' }))}
            >
              <Plus size={15} />
              新建任务
            </button>
          )}
        </div>
      </div>
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
            onCreated={(id) => navigate(operationsHref('agents', { execution: id }))}
          />
        )}
        {((creating && !catalog && !catalogError) || (selected && !view && !execution.error)) && (
          <WorkspaceSkeleton creating={creating} />
        )}
        {selected && view && (
          <ExecutionPanel
            key={selected}
            view={view}
            diagnostics={<ExecutionDiagnostics id={selected} liveWatermark={view.watermark} />}
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
