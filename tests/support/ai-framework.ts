import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import {
  AiRuntime,
  OperationRegistry,
  aiConfigurationSchema,
  type OperationContext,
  type AiConfiguration,
  type CredentialResolver,
} from '@capability-hub/ai';
import { createWorkflow, createStep } from '@capability-hub/ai/mastra';
import { createAiStore, HubAiQueue } from '@capability-hub/infrastructure/ai';
import { z } from 'zod';
import { createTestHub } from './application.js';

export async function frameworkFixture(
  t: TestContext,
  config: AiConfiguration,
  work: (context: OperationContext) => Promise<unknown>,
  credentials: CredentialResolver = { resolve: async () => 'ai-fixture-key' },
) {
  const hub = await createTestHub(t, { ai: config });
  const input = z.object({}).strict();
  const output = z.json();
  const failures: unknown[] = [];
  const registry = new OperationRegistry().register({
    id: 'framework-test',
    version: '1',
    title: 'Framework',
    description: 'Framework',
    input,
    output,
    interactions: {},
    create: (context) =>
      createWorkflow({
        id: 'framework-test',
        inputSchema: input,
        outputSchema: output,
        options: { autoRestartActiveRuns: false },
        retryConfig: { attempts: 0, delay: 0 },
      })
        .then(
          createStep({
            id: 'work',
            inputSchema: input,
            outputSchema: output,
            execute: async () => {
              try {
                return output.parse(await work(context));
              } catch (error) {
                failures.push(error);
                throw error;
              }
            },
          }),
        )
        .commit(),
  });
  const runtime = new AiRuntime(
    createAiStore(hub.store),
    new HubAiQueue(hub.store, hub.hub.jobs),
    registry,
    {
      authorization: { authorize: async () => undefined },
      credentials,
      resources: {
        resolve: async () => ({
          id: 'skill',
          version: 'v1',
          digest: 'fixed',
          title: 'SKILL.md',
          text: '---\nname: test\ndescription: test\n---\nFollow the evidence.',
        }),
      },
      telemetry: {
        record: () => {
          throw new Error('Telemetry sink unavailable');
        },
      },
    },
    config,
  );
  const run = async (signal = new AbortController().signal) => {
    const job = await hub.hub.jobs.claim('framework-test', ['ai_execution']);
    assert(job);
    await runtime.process(
      {
        execution_id: job.aggregate_id,
        dispatch_id: job.id,
        owner: job.lease_owner!,
        epoch: job.lease_epoch,
        attempt: job.attempt,
      },
      signal,
    );
  };
  return { ...hub, runtime, run, failures };
}
export function frameworkConfig(
  url = 'https://example.test/v1',
  format: 'openai' | 'anthropic' = 'openai',
) {
  return aiConfigurationSchema.parse({
    profiles: [
      {
        id: 'fixture',
        label: 'Fixture',
        format,
        base_url: url,
        model: 'fixture-model',
        credential_ref: 'AI_FIXTURE_KEY',
        allow_http: true,
      },
    ],
    default_profile: 'fixture',
  });
}
