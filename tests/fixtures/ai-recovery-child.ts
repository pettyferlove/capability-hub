import { openRecordStore } from '@capability-hub/infrastructure/store';
import type { RecoveryDatabase } from '../support/ai-recovery-assertions.js';
import { recoveryRuntime, type CrashStage } from '../support/ai-recovery.js';

interface Input {
  database: RecoveryDatabase;
  stage: CrashStage;
}
process.once('message', (raw: Input) => {
  void (async () => {
    const store = await openRecordStore(
      raw.database.driver === 'postgresql'
        ? {
            ...raw.database,
            onPoolError: (error: Error) => {
              throw error;
            },
          }
        : raw.database,
    );
    try {
      let stopped = false;
      const { runtime, claim } = recoveryRuntime(store, async (stage) => {
        if (stopped || stage !== raw.stage) return;
        stopped = true;
        process.send?.({ checkpoint: stage });
        await new Promise<void>(() => undefined);
      });
      await runtime.process(await claim(), new AbortController().signal);
      process.send?.({ error: 'Execution ended before checkpoint' });
    } finally {
      await store.close();
      process.disconnect();
    }
  })().catch((error: unknown) => {
    process.send?.({ error: error instanceof Error ? error.message : 'Child failed' });
    process.exitCode = 1;
    process.disconnect();
  });
});
