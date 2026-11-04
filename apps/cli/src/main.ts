import { HubError } from '@capability-hub/domain/errors';
import { CommanderError } from 'commander';
import { runCli } from './cli.js';
import { terminalText } from './api-client.js';
import { CliCancelled } from './cli-ui.js';

runCli().catch((error: unknown) => {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
    return;
  }
  process.stderr.write(
    terminalText(
      error instanceof HubError
        ? error.code + ': ' + error.message
        : error instanceof Error
          ? error.message
          : 'CLI 执行失败',
    ) + '\n',
  );
  process.exitCode = error instanceof CliCancelled ? 130 : 1;
});
