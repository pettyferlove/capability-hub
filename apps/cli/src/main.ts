import { HubError } from '@capability-hub/domain/errors';
import { CommanderError } from 'commander';
import { runCli } from './cli.js';
import { HubApiError, redactCredentials } from './api-client.js';
import { CliCancelled } from './cli-ui.js';

runCli()
  .then((code) => {
    if (code !== undefined) process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode;
      return;
    }
    process.stderr.write(
      redactCredentials(
        error instanceof HubError
          ? error.code + ': ' + error.message
          : error instanceof Error
            ? error.message
            : 'CLI 执行失败',
      ) +
        '\n' +
        (error instanceof HubApiError && error.requestId ? `请求编号：${error.requestId}\n` : ''),
    );
    process.exitCode = error instanceof CliCancelled ? 130 : 1;
  });
