import type { SshKeyInspector } from '@capability-hub/application/ports';
import { fail } from '@capability-hub/domain/errors';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { sshAskpass } from './ssh-askpass.js';

const execute = promisify(execFile);

export class OpenSshKeyInspector implements SshKeyInspector {
  async inspect(input: { privateKey: string; passphrase: string; hostKey: string }) {
    const directory = await mkdtemp(join(tmpdir(), 'capability-key-check-'));
    try {
      const privateKey = input.privateKey.endsWith('\n')
        ? input.privateKey
        : input.privateKey + '\n';
      await writeFile(join(directory, 'key'), privateKey, { mode: 0o600 });
      await writeFile(join(directory, 'passphrase'), input.passphrase, { mode: 0o600 });
      await writeFile(join(directory, 'askpass'), sshAskpass, { mode: 0o700 });
      await writeFile(join(directory, 'host.pub'), input.hostKey + '\n', { mode: 0o600 });
      const env = {
        PATH: '/usr/bin:/bin',
        HOME: directory,
        DISPLAY: 'capability-hub',
        SSH_ASKPASS: join(directory, 'askpass'),
        SSH_ASKPASS_REQUIRE: 'force',
        CAPABILITY_SSH_PASSPHRASE_FILE: join(directory, 'passphrase'),
      };
      const { stdout } = await execute(
        '/usr/bin/ssh-keygen',
        ['-y', '-f', join(directory, 'key')],
        { env, timeout: 5000, maxBuffer: 16384 },
      );
      const fingerprint =
        'SHA256:' +
        createHash('sha256')
          .update(Buffer.from(stdout.trim().split(' ')[1], 'base64'))
          .digest('base64')
          .replace(/=+$/, '');
      const host = await execute(
        '/usr/bin/ssh-keygen',
        ['-lf', join(directory, 'host.pub'), '-E', 'sha256'],
        { env, timeout: 5000, maxBuffer: 16384 },
      );
      return { fingerprint, hostFingerprint: host.stdout.trim().split(/\s+/)[1] };
    } catch {
      fail(422, 'SSH_KEY_INVALID', 'SSH 私钥、口令或主机公钥无效，请核对后重试');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
