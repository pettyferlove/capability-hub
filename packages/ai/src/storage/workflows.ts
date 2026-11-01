import {
  WorkflowsStorage,
  matchesExpectedWorkflowStatus,
  mergeWorkflowStepResult,
} from '@mastra/core/storage';
import type { WorkflowRun, WorkflowRuns } from '@mastra/core/storage';
import type { WorkflowRunState } from '@mastra/core/workflows';
import type { AiRecordMap } from '../core/records.js';
import { digest } from '../core/config.js';
import { AiError } from '../core/errors.js';
import { type ExecutionScope } from '../execution/scope.js';
import { decodeSnapshot, encodeNative } from './codec.js';
const sdkVersion = '1.81.0';

type Arg<K extends keyof WorkflowsStorage> = WorkflowsStorage[K] extends (
  ...args: infer A
) => unknown
  ? A[0]
  : never;
export class ScopedWorkflowsStorage extends WorkflowsStorage {
  constructor(private readonly scope: ExecutionScope) {
    super();
  }
  supportsConcurrentUpdates() {
    return true;
  }
  supportsGuardedSnapshotWrites() {
    return true;
  }
  supportsRunFencing() {
    return false;
  }
  dangerouslyClearAll(): Promise<void> {
    return Promise.reject(new AiError('AI_FORBIDDEN', '禁止清空执行存储'));
  }
  private key(workflow: string, run: string) {
    return digest([workflow, run]);
  }
  private async row(workflow: string, run: string) {
    const row = await this.scope.store.get('ai_snapshots', this.key(workflow, run));
    const current = this.scope.current();
    if (
      row &&
      (row.execution_id !== current.lease.execution_id ||
        row.owner_id !== current.owner_id ||
        row.payload.sdk_version !== sdkVersion ||
        row.payload.definition_digest !== current.definition_digest)
    )
      throw new AiError('AI_RECOVERY_UNCERTAIN', '原生运行与当前执行不匹配');
    return row;
  }
  private async save(workflow: string, run: string, snapshot: WorkflowRunState) {
    const current = this.scope.current();
    const prior = await this.row(workflow, run);
    const now = new Date().toISOString();
    const record: AiRecordMap['ai_snapshots'] = {
      id: this.key(workflow, run),
      owner_id: current.owner_id,
      execution_id: current.lease.execution_id,
      lookup_key: this.key(workflow, run),
      status: snapshot.status,
      position: prior?.position ?? Date.now(),
      created_at: prior?.created_at ?? now,
      updated_at: now,
      payload: {
        workflow_name: workflow,
        run_id: run,
        sdk_version: sdkVersion,
        definition_digest: current.definition_digest,
        snapshot: encodeNative(snapshot),
        snapshot_revision: (prior?.payload.snapshot_revision ?? 0) + 1,
        projected_revision: prior?.payload.projected_revision ?? 0,
      },
    };
    // revision 差值就是未收敛意图；不能与原生快照分开提交。
    if (prior) await this.scope.store.put('ai_snapshots', record);
    else await this.scope.store.insert('ai_snapshots', record);
  }
  async persistWorkflowSnapshot(args: Arg<'persistWorkflowSnapshot'>) {
    return this.scope.write(async () => {
      const old = await this.loadWorkflowSnapshot(args);
      if (!matchesExpectedWorkflowStatus(old?.status, args.expectedStatus)) return false;
      await this.save(args.workflowName, args.runId, args.snapshot);
      return true;
    });
  }
  async loadWorkflowSnapshot(args: Arg<'loadWorkflowSnapshot'>) {
    const row = await this.row(args.workflowName, args.runId);
    return row ? decodeSnapshot(row.payload.snapshot) : null;
  }
  async updateWorkflowState(args: Arg<'updateWorkflowState'>) {
    return this.scope.write(async () => {
      const snapshot = await this.loadWorkflowSnapshot(args);
      if (!snapshot || !matchesExpectedWorkflowStatus(snapshot.status, args.opts.expectedStatus))
        return undefined;
      const { expectedStatus: _guard, ...changes } = args.opts;
      Object.assign(snapshot, changes);
      await this.save(args.workflowName, args.runId, snapshot);
      return snapshot;
    });
  }
  async updateWorkflowResults(args: Arg<'updateWorkflowResults'>) {
    return this.scope.write(async () => {
      const snapshot = await this.loadWorkflowSnapshot(args);
      if (!snapshot) return {};
      const result = mergeWorkflowStepResult({ ...args, snapshot });
      await this.save(args.workflowName, args.runId, snapshot);
      return result;
    });
  }
  private native(row: AiRecordMap['ai_snapshots']): WorkflowRun {
    return {
      workflowName: row.payload.workflow_name,
      runId: row.payload.run_id,
      resourceId: row.owner_id,
      snapshot: decodeSnapshot(row.payload.snapshot),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
  async listWorkflowRuns(args: Arg<'listWorkflowRuns'> = {}): Promise<WorkflowRuns> {
    const scope = this.scope.current();
    const rows = await this.scope.store.list('ai_snapshots', {
      execution_id: scope.lease.execution_id,
      owner_id: scope.owner_id,
      limit: 1000,
    });
    const runs = rows
      .filter(
        (row) =>
          (!args.workflowName || row.payload.workflow_name === args.workflowName) &&
          (!args.resourceId || row.owner_id === args.resourceId) &&
          (!args.status || row.status === args.status) &&
          (!args.fromDate || new Date(row.created_at) >= args.fromDate) &&
          (!args.toDate || new Date(row.created_at) <= args.toDate),
      )
      .map((row) => this.native(row));
    const offset = (args.page ?? 0) * (args.perPage || runs.length);
    return {
      runs: args.perPage ? runs.slice(offset, offset + args.perPage) : runs,
      total: runs.length,
    };
  }
  async getWorkflowRunById(args: Arg<'getWorkflowRunById'>) {
    if (args.workflowName) {
      const row = await this.row(args.workflowName, args.runId);
      return row ? this.native(row) : null;
    }
    return (await this.listWorkflowRuns()).runs.find((row) => row.runId === args.runId) ?? null;
  }
  async deleteWorkflowRunById(args: Arg<'deleteWorkflowRunById'>) {
    await this.scope.write(async () => {
      const row = await this.row(args.workflowName, args.runId);
      if (row) await this.scope.store.remove('ai_snapshots', row.id);
    });
  }
}
