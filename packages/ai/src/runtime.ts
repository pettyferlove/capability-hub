import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Mastra } from '@mastra/core/mastra';
import { MastraCompositeStore } from '@mastra/core/storage';
import { createWorkflowStateReader, type AnyWorkflow } from '@mastra/core/workflows';
import type { AiStore, AiQueueBridge, ExecutionLease } from './ports.js';
import {
  asJson,
  eventTypes,
  terminalStatuses,
  type ExecutionRecord,
  type AiRecordMap,
  type Json,
} from './records.js';
import { aiConfigurationSchema, digest, profileFor, type AiConfiguration } from './config.js';
import { AiError, aiFailure } from './errors.js';
import { ExecutionScope } from './scope.js';
import { AiEventService } from './events.js';
import { OperationContext, type RuntimeDependencies } from './context.js';
import { type OperationRegistry, type OperationDefinition } from './registry.js';
import { ScopedWorkflowsStorage } from './storage/workflows.js';
import { ScopedMemoryStorage } from './storage/memory.js';

export class AiRuntime {
  private expirationCursor: { id: string; position: number } | undefined;
  readonly scope: ExecutionScope;
  readonly events: AiEventService;
  readonly config: AiConfiguration;
  constructor(
    readonly store: AiStore,
    readonly queue: AiQueueBridge,
    readonly registry: OperationRegistry,
    private readonly dependencies: RuntimeDependencies,
    config: AiConfiguration,
  ) {
    this.config = aiConfigurationSchema.parse(config);
    this.scope = new ExecutionScope(store, queue);
    this.events = new AiEventService(store, this.scope, this.config.max_event_bytes);
  }
  catalog() {
    return {
      operations: this.registry.list(),
      default_profile: this.config.default_profile,
      profiles: this.config.profiles.map(({ id, label, format, model }) => ({
        id,
        label,
        format,
        model,
      })),
    };
  }
  async submit(ownerId: string, operationId: string, input: unknown, profileId?: string) {
    return this.store.tx(async () => {
      await this.dependencies.authorization.authorize(ownerId, 'submit');
      const definition = this.registry.get(operationId);
      const manifest = this.registry.describe(definition);
      const profile = profileFor(this.config, profileId ?? this.config.default_profile);
      const parsed = asJson(definition.input.parse(input));
      if (Buffer.byteLength(JSON.stringify(parsed)) > 65536)
        throw new AiError('AI_BUDGET_EXCEEDED', '操作输入超过限制');
      const id = randomUUID();
      const now = new Date().toISOString();
      const execution: ExecutionRecord = {
        id,
        owner_id: ownerId,
        execution_id: id,
        lookup_key: operationId,
        status: 'queued',
        position: Date.now(),
        created_at: now,
        updated_at: now,
        payload: {
          operation_id: operationId,
          definition_version: definition.version,
          definition_digest: manifest.digest,
          model_profile: profile.id,
          model_digest: digest(profile),
          input: parsed,
          result: null,
          revision: 1,
          attempt: 0,
          continuation: 0,
          dispatch_id: null,
          native_run_id: randomUUID(),
          native_workflow_id: operationId,
          deadline: Date.now() + this.config.execution_timeout_ms,
          last_seq: 0,
          event_bytes: 0,
          message_text: '',
          message_blocks: [],
          error: null,
          usage: { requests: 0, tools: 0, input_tokens: 0, output_tokens: 0, unknown_requests: 0 },
        },
      };
      await this.dependencies.authorization.authorize(ownerId, 'submit', execution);
      await this.store.insert('ai_executions', execution);
      execution.payload.dispatch_id = await this.queue.enqueue(id);
      await this.events.append(execution, 'execution.queued', { operation_id: operationId });
      return execution;
    });
  }
  async get(id: string) {
    const row = await this.store.get('ai_executions', id);
    if (!row) throw new AiError('AI_NOT_FOUND', 'AI 执行不存在');
    return row;
  }
  async view(id: string) {
    return this.store.tx(async () => {
      const execution = await this.get(id);
      const interactions = await this.store.list('ai_interactions', {
        execution_id: id,
        limit: 100,
      });
      const artifacts = await this.store.list('ai_artifacts', { execution_id: id, limit: 100 });
      // 只读取活动节点，排除高频文本与重复结果；限定水位，避免混入稍后提交的事件。
      const activity = (
        await this.store.list('ai_events', {
          execution_id: id,
          lookup_key: `${id}:operator`,
          event_types: eventTypes.filter(
            (type) =>
              ![
                'message.delta',
                'message.completed',
                'usage.updated',
                'execution.completed',
              ].includes(type),
          ),
          before_position: execution.payload.last_seq + 1,
          descending: true,
          limit: 1000,
        })
      ).reverse();
      return {
        execution,
        interactions,
        artifacts,
        activity,
        activity_truncated: activity.length > 0 && activity[0].payload.seq > 1,
        watermark: execution.payload.last_seq,
      };
    });
  }
  async cancel(id: string, actor: string, revision: number) {
    return this.store.tx(async () => {
      const execution = await this.get(id);
      await this.dependencies.authorization.authorize(actor, 'cancel', execution);
      this.revision(execution.payload.revision, revision);
      if (terminalStatuses.has(execution.status)) throw new AiError('AI_CONFLICT', '执行已经结束');
      if (execution.payload.dispatch_id) await this.queue.cancel(execution.payload.dispatch_id);
      execution.status = 'cancelled';
      execution.payload.revision++;
      await this.closeUnsettled(execution);
      await this.events.append(execution, 'execution.cancelled', {});
      return execution;
    });
  }
  async respond(
    id: string,
    interactionId: string,
    actor: string,
    revision: number,
    response: unknown,
  ) {
    return this.store.tx(async () => {
      const execution = await this.get(id);
      await this.dependencies.authorization.authorize(actor, 'respond', execution);
      const interaction = await this.store.get('ai_interactions', interactionId);
      if (!interaction || interaction.execution_id !== id)
        throw new AiError('AI_NOT_FOUND', '交互不存在');
      this.revision(interaction.payload.revision, revision);
      if (
        execution.status !== 'waiting_input' ||
        interaction.status !== 'pending' ||
        interaction.payload.expires_at <= Date.now()
      )
        throw new AiError('AI_CONFLICT', '交互已结束或过期');
      const definition = this.registry.get(execution.payload.operation_id);
      this.assertDefinition(execution, definition);
      const schema = definition.interactions[interaction.payload.native_path.join('/')];
      if (!schema) throw new AiError('AI_RECOVERY_UNCERTAIN', '交互定义不可用');
      const value = asJson(schema.parse(response));
      interaction.status = 'answered';
      interaction.payload.response = value;
      interaction.payload.response_digest = digest(value);
      interaction.payload.responded_by = actor;
      interaction.payload.revision++;
      interaction.updated_at = new Date().toISOString();
      await this.store.put('ai_interactions', interaction);
      if (execution.payload.continuation >= this.config.max_continuations)
        throw new AiError('AI_BUDGET_EXCEEDED', '人工交互次数超过上限');
      execution.payload.continuation++;
      execution.payload.revision++;
      execution.status = 'queued';
      execution.payload.dispatch_id = await this.queue.enqueue(id);
      await this.events.append(execution, 'interaction.responded', {
        interaction_id: interactionId,
      });
      await this.events.append(execution, 'execution.queued', {
        continuation: execution.payload.continuation,
      });
      return execution;
    });
  }
  private revision(actual: number, expected: number) {
    if (actual !== expected)
      throw new AiError('AI_REVISION_CONFLICT', '修订号已改变，请刷新后重试');
  }
  private assertDefinition(execution: ExecutionRecord, definition: OperationDefinition) {
    if (
      execution.payload.definition_digest !== this.registry.describe(definition).digest ||
      execution.payload.model_digest !==
        digest(profileFor(this.config, execution.payload.model_profile))
    )
      throw new AiError('AI_RECOVERY_UNCERTAIN', '操作定义或模型配置已改变，不能恢复旧执行');
  }
  async process(lease: ExecutionLease, signal: AbortSignal): Promise<void> {
    const execution = await this.get(lease.execution_id);
    const controller = new AbortController();
    const forward = () =>
      controller.abort(
        signal.reason instanceof AiError
          ? signal.reason
          : new AiError('AI_INTERRUPTED', '执行已中断'),
      );
    signal.addEventListener('abort', forward, { once: true });
    if (signal.aborted) forward();
    const timeout = setTimeout(
      () => controller.abort(new AiError('AI_DEADLINE_EXCEEDED', '本轮执行超过时限')),
      Math.max(1, Math.min(this.config.active_timeout_ms, execution.payload.deadline - Date.now())),
    );
    try {
      await this.scope.run(
        {
          lease,
          owner_id: execution.owner_id,
          definition_digest: execution.payload.definition_digest,
          controller,
        },
        async () => {
          let mastra: Mastra | undefined;
          try {
            await this.store.tx(async () => {
              await this.queue.assert(lease);
              const current = await this.get(execution.id);
              if (
                current.payload.dispatch_id !== lease.dispatch_id ||
                terminalStatuses.has(current.status)
              )
                throw new AiError('AI_LEASE_LOST', '执行已结束或调度已替换');
              current.status = 'running';
              current.payload.attempt++;
              current.payload.revision++;
              // 崩溃前已预留但未结算的网络请求不能被假定为未发生。
              for (const call of await this.store.list('ai_calls', {
                execution_id: current.id,
                status: 'pending',
                limit: 100,
              })) {
                call.status = 'unknown';
                current.payload.usage.unknown_requests++;
                await this.store.put('ai_calls', call);
              }
              await this.events.append(current, 'execution.started', {});
            });
            controller.signal.throwIfAborted();
            const current = await this.get(execution.id);
            const definition = this.registry.get(current.payload.operation_id);
            this.assertDefinition(current, definition);
            await this.dependencies.authorization.authorize(current.owner_id, 'execute', current);
            const storage = new MastraCompositeStore({
              id: `execution-${current.id}`,
              domains: {
                workflows: new ScopedWorkflowsStorage(this.scope),
                memory: new ScopedMemoryStorage(this.scope),
              },
            });
            const context = new OperationContext(
              this.scope,
              this.events,
              storage,
              this.dependencies,
              this.config,
              profileFor(this.config, current.payload.model_profile),
            );
            const workflow = definition.create(context);
            if (workflow.id !== definition.id)
              throw new AiError('AI_CONFIGURATION', '工作流 ID 必须与操作 ID 一致');
            mastra = new Mastra({
              storage,
              workflows: { operation: workflow },
              logger: false,
              recovery: { workflows: 'off', durableAgents: 'off' },
            });
            const native = mastra.getWorkflow('operation');
            const prior = await native.getWorkflowRunById(current.payload.native_run_id);
            const run = await native.createRun({
              runId: current.payload.native_run_id,
              resourceId: current.owner_id,
            });
            const abort = () => run.abortController.abort(controller.signal.reason);
            controller.signal.addEventListener('abort', abort, { once: true });
            try {
              if (!prior || prior.status === 'pending')
                await run.start({ inputData: current.payload.input });
              else if (
                !['success', 'failed', 'canceled', 'suspended', 'tripwire', 'bailed'].includes(
                  prior.status,
                )
              )
                await run.restart();
              controller.signal.throwIfAborted();
              for (let count = 0; count <= this.config.max_continuations; count++) {
                const state = await native.getWorkflowRunById(current.payload.native_run_id);
                if (!state) throw new AiError('AI_RECOVERY_UNCERTAIN', '原生快照未持久化');
                const reader = createWorkflowStateReader(state);
                if (state.status !== 'suspended') {
                  if (state.status !== 'success')
                    throw context.failure ?? new AiError('AI_INTERNAL', '原生工作流未成功完成');
                  const output = asJson(definition.output.parse(reader.getResult()));
                  await this.complete(current.id, output);
                  return;
                }
                const suspended = reader.getSuspendedSteps();
                if (suspended.length !== 1)
                  throw new AiError('AI_RECOVERY_UNCERTAIN', '一次执行只接受一个明确的人工交互点');
                const pending = suspended[0];
                const receipt = await this.interaction(
                  native,
                  definition,
                  pending.path,
                  asJson(pending.suspendPayload ?? null),
                );
                if (receipt.status === 'pending') {
                  await this.waitForInput(current.id);
                  return;
                }
                if (
                  !receipt.payload.responded_by ||
                  !receipt.payload.response_digest ||
                  receipt.payload.response_digest !== digest(receipt.payload.response)
                )
                  throw new AiError('AI_RECOVERY_UNCERTAIN', '回答回执不完整');
                await this.dependencies.authorization.authorize(
                  receipt.payload.responded_by,
                  'respond',
                  await this.get(current.id),
                );
                await run.resume({
                  step: receipt.payload.native_path,
                  resumeData: receipt.payload.response,
                });
                controller.signal.throwIfAborted();
                await this.scope.write(async () => {
                  receipt.status = 'applied';
                  receipt.payload.revision++;
                  await this.store.put('ai_interactions', receipt);
                });
              }
              throw new AiError('AI_BUDGET_EXCEEDED', '交互恢复次数达到上限');
            } finally {
              controller.signal.removeEventListener('abort', abort);
            }
          } catch (error) {
            const reason = controller.signal.aborted
              ? (controller.signal.reason as unknown)
              : error;
            await this.failed(lease, aiFailure(reason));
          } finally {
            await mastra?.shutdown();
          }
        },
      );
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', forward);
    }
  }
  private async interaction(
    workflow: AnyWorkflow,
    definition: OperationDefinition,
    path: string[],
    request: Json,
  ) {
    return this.scope.write(async (execution) => {
      const key = path.join('/');
      const schema = definition.interactions[key];
      if (!schema || workflow.id !== definition.id)
        throw new AiError('AI_RECOVERY_UNCERTAIN', '暂停路径未声明交互协议');
      const existing = await this.store.list('ai_interactions', {
        execution_id: execution.id,
        limit: 100,
      });
      const requestDigest = digest(request);
      const active = existing.find((row) => row.status === 'pending' || row.status === 'answered');
      if (active) {
        if (
          active.payload.native_path.join('/') !== key ||
          active.payload.definition_digest !== execution.payload.definition_digest ||
          active.payload.request_digest !== requestDigest
        )
          throw new AiError('AI_RECOVERY_UNCERTAIN', '暂停位置或参数与回答回执不匹配');
        return active;
      }
      const now = new Date().toISOString();
      const id = randomUUID();
      const record: AiRecordMap['ai_interactions'] = {
        id,
        owner_id: execution.owner_id,
        execution_id: execution.id,
        lookup_key: id,
        status: 'pending',
        position: existing.length + 1,
        created_at: now,
        updated_at: now,
        payload: {
          native_path: path,
          occurrence: `${execution.payload.native_run_id}:${existing.length + 1}`,
          definition_digest: execution.payload.definition_digest,
          request,
          request_digest: requestDigest,
          response_schema: asJson(z.toJSONSchema(schema)),
          revision: 1,
          expires_at: execution.payload.deadline,
          response: null,
          response_digest: null,
          responded_by: null,
        },
      };
      await this.store.insert('ai_interactions', record);
      await this.events.append(execution, 'interaction.requested', {
        interaction_id: id,
        request,
        response_schema: record.payload.response_schema,
        revision: 1,
      });
      return record;
    });
  }
  private async project(execution: ExecutionRecord) {
    for (const snapshot of await this.store.list('ai_snapshots', {
      execution_id: execution.id,
      limit: 1000,
    })) {
      snapshot.payload.projected_revision = snapshot.payload.snapshot_revision;
      await this.store.put('ai_snapshots', snapshot);
    }
  }
  private async waitForInput(id: string) {
    await this.scope.write(async (execution) => {
      if (execution.id !== id) throw new AiError('AI_LEASE_LOST', '执行不匹配');
      execution.status = 'waiting_input';
      execution.payload.revision++;
      await this.project(execution);
      await this.events.append(execution, 'execution.waiting_input', {});
      await this.queue.finish(this.scope.current().lease, 'succeeded');
    });
  }
  private async complete(id: string, result: Json) {
    await this.scope.write(async (execution) => {
      if (execution.id !== id) throw new AiError('AI_LEASE_LOST', '执行不匹配');
      await this.dependencies.authorization.authorize(execution.owner_id, 'execute', execution);
      for (const receipt of await this.store.list('ai_interactions', {
        execution_id: id,
        status: 'answered',
        limit: 100,
      })) {
        receipt.status = 'applied';
        receipt.payload.revision++;
        await this.store.put('ai_interactions', receipt);
      }
      execution.status = 'succeeded';
      execution.payload.result = result;
      execution.payload.revision++;
      await this.project(execution);
      await this.events.append(execution, 'execution.completed', { result });
      await this.queue.finish(this.scope.current().lease, 'succeeded');
    });
  }
  async expireWaiting(): Promise<void> {
    const rows = await this.store.list('ai_executions', {
      status: 'waiting_input',
      after: this.expirationCursor,
      limit: 100,
    });
    for (const row of rows)
      if (row.payload.deadline <= Date.now())
        await this.store.tx(async () => {
          const current = await this.get(row.id);
          if (current.status !== 'waiting_input' || current.payload.deadline > Date.now()) return;
          current.status = 'timed_out';
          current.payload.revision++;
          current.payload.error = {
            code: 'AI_DEADLINE_EXCEEDED',
            message: '等待回答已超过执行期限',
            retryable: false,
          };
          for (const interaction of await this.store.list('ai_interactions', {
            execution_id: row.id,
            status: 'pending',
            limit: 100,
          })) {
            interaction.status = 'cancelled';
            interaction.payload.revision++;
            await this.store.put('ai_interactions', interaction);
          }
          await this.events.append(current, 'execution.timed_out', {
            error: current.payload.error,
          });
        });
    const last = rows.at(-1);
    this.expirationCursor =
      rows.length === 100 && last ? { id: last.id, position: last.position } : undefined;
  }
  private async failed(lease: ExecutionLease, error: AiError) {
    try {
      await this.store.tx(async () => {
        await this.queue.assert(lease);
        const execution = await this.get(lease.execution_id);
        if (
          terminalStatuses.has(execution.status) ||
          execution.payload.dispatch_id !== lease.dispatch_id
        )
          return;
        execution.payload.revision++;
        if (error.code === 'AI_INTERRUPTED' && execution.payload.deadline > Date.now()) {
          execution.status = 'queued';
          await this.queue.retry(lease, 0);
          await this.events.append(execution, 'execution.retry_scheduled', {
            reason: 'interrupted',
          });
          return;
        }
        execution.status = error.code === 'AI_DEADLINE_EXCEEDED' ? 'timed_out' : 'failed';
        execution.payload.error = {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        };
        await this.closeUnsettled(execution);
        await this.events.append(
          execution,
          execution.status === 'timed_out' ? 'execution.timed_out' : 'execution.failed',
          { error: execution.payload.error },
        );
        await this.queue.finish(lease, 'failed');
      });
    } catch (failure) {
      if (!(failure instanceof AiError && failure.code === 'AI_LEASE_LOST')) throw failure;
    }
  }
  private async closeUnsettled(execution: ExecutionRecord) {
    const now = new Date().toISOString();
    for (const call of await this.store.list('ai_calls', {
      execution_id: execution.id,
      status: 'pending',
      limit: 100,
    })) {
      call.status = 'unknown';
      call.updated_at = now;
      call.payload.duration_ms = Date.now() - Date.parse(call.created_at);
      execution.payload.usage.unknown_requests++;
      await this.store.put('ai_calls', call);
    }
    for (const interaction of await this.store.list('ai_interactions', {
      execution_id: execution.id,
      limit: 100,
    })) {
      if (interaction.status !== 'pending' && interaction.status !== 'answered') continue;
      interaction.status = 'cancelled';
      interaction.payload.revision++;
      interaction.updated_at = now;
      await this.store.put('ai_interactions', interaction);
    }
  }
}
