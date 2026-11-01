import { z } from 'zod';
import type { AnyWorkflow } from '@mastra/core/workflows';
import type { OperationContext } from './context.js';
import { digest } from '../core/config.js';
import { AiError } from '../core/errors.js';
import { asJson } from '../core/records.js';

/**
 * 一个可执行操作的声明。`id` 必须匹配 `^[a-z][a-z0-9-]{0,63}$` 且全局唯一；`version` 参与
 * `definition_digest`，改动输入/输出/交互 Schema 或 `create` 行为都必须升版本，否则进行中的执行
 * 恢复时会因摘要不一致而判为 `AI_RECOVERY_UNCERTAIN`。
 * `interactions` 以原生工作流暂停路径（`stepA/stepB`）为键：未声明的暂停点会让执行失败，
 * 一次执行也只允许一个明确的暂停点。
 */
export interface OperationDefinition {
  id: string;
  version: string;
  title: string;
  description: string;
  input: z.ZodType;
  output: z.ZodType;
  interactions: Record<string, z.ZodType>;
  create(context: OperationContext): AnyWorkflow;
}

/**
 * 操作定义表：注册时校验 ID 形状与唯一性并先算一次摘要，校验失败不会留下半成品；
 * `get` 对未知 ID 抛 `AI_NOT_FOUND`。`describe` 每次重新生成清单与摘要，是提交与恢复时
 * 比对定义是否变化的唯一依据。
 */
export class OperationRegistry {
  private readonly definitions = new Map<string, OperationDefinition>();
  register(definition: OperationDefinition) {
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(definition.id) ||
      !definition.version ||
      this.definitions.has(definition.id)
    )
      throw new AiError('AI_CONFIGURATION', '操作 ID 不合法或重复');
    this.describe(definition);
    this.definitions.set(definition.id, definition);
    return this;
  }
  get(id: string) {
    const definition = this.definitions.get(id);
    if (!definition) throw new AiError('AI_NOT_FOUND', 'AI 操作不存在');
    return definition;
  }
  describe(definition: OperationDefinition) {
    const manifest = {
      id: definition.id,
      version: definition.version,
      title: definition.title,
      description: definition.description,
      input_schema: asJson(z.toJSONSchema(definition.input)),
      output_schema: asJson(z.toJSONSchema(definition.output)),
      interactions: Object.fromEntries(
        Object.entries(definition.interactions).map(([key, schema]) => [
          key,
          asJson(z.toJSONSchema(schema)),
        ]),
      ),
    };
    return { ...manifest, digest: digest(manifest) };
  }
  list() {
    return [...this.definitions.values()].map((definition) => this.describe(definition));
  }
}
