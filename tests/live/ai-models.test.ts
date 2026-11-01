import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { aiConfigurationSchema } from '@capability-hub/ai';
import { z } from 'zod';
import { frameworkFixture } from '../support/ai-framework.js';

const path = process.env.AI_LIVE_CONFIG;
if (!path)
  throw new Error('AI_LIVE_CONFIG must name an explicit protected model configuration file');

const config = aiConfigurationSchema.parse(JSON.parse(await readFile(path, 'utf8')));
if (!config.profiles.length) throw new Error('Live verification requires a configured model');

for (const profile of config.profiles)
  test(
    `真实模型 ${profile.id} (${profile.format})：原生工具、流、结构化输出与用量`,
    { timeout: 180000 },
    async (t) => {
      const token = randomUUID();
      let toolCalls = 0;
      const hub = await frameworkFixture(
        t,
        { ...config, profiles: [profile], default_profile: profile.id },
        async (context) => {
          const answer = await context.agent({
            id: 'live-tool',
            instructions:
              'Use the verify_token tool once. Return its exact token. Do not invent a token.',
            prompt: 'Verify the token now.',
            tools: {
              verify_token: context.tool({
                id: 'verify-token',
                description: 'Returns the required verification token.',
                input: z.object({}).strict(),
                output: z.object({ token: z.string() }).strict(),
                execute: async () => {
                  toolCalls++;
                  return { token };
                },
              }),
            },
          });
          assert(answer.text.includes(token));
          return context.structured(
            {
              id: 'live-structured',
              instructions: 'Return the requested JSON.',
              prompt: 'Return an object with verdict "ok" and integer count 7.',
            },
            z.object({ verdict: z.literal('ok'), count: z.literal(7) }).strict(),
          );
        },
        {
          resolve: async (reference) => {
            const value = process.env[reference];
            if (!value) throw new Error('Live credential reference is not configured');
            return value;
          },
        },
      );
      const execution = await hub.runtime.submit(hub.admin.id, 'framework-test', {});
      await hub.run();
      const result = await hub.runtime.get(execution.id);
      assert.equal(result.status, 'succeeded', JSON.stringify(result.payload.error));
      assert(toolCalls >= 1);
      assert.deepEqual(result.payload.result, { verdict: 'ok', count: 7 });
      assert(result.payload.usage.input_tokens > 0);
      assert(result.payload.usage.output_tokens > 0);
      assert.equal(result.payload.usage.unknown_requests, 0);
      const events = await hub.runtime.store.list('ai_events', {
        execution_id: execution.id,
        limit: 100,
      });
      assert(events.some((event) => event.payload.type === 'message.delta'));
    },
  );
