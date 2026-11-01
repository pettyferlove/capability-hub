import { z } from 'zod';
import type { AnyWorkflow } from '@mastra/core/workflows';
import type { OperationContext } from './context.js';
import { digest } from '../core/config.js';
import { AiError } from '../core/errors.js';
import { asJson } from '../core/records.js';

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
