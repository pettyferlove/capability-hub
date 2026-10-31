import { HubError } from '@capability-hub/domain/errors';
import { runCli } from './cli.js';
import { terminalText } from './api-client.js';

runCli().catch((error: unknown) => {
  process.stderr.write(
    terminalText(
      error instanceof HubError
        ? error.code + ': ' + error.message
        : error instanceof Error
          ? error.message
          : 'CLI 执行失败',
    ) + '\n',
  );
  process.exitCode = 1;
});
