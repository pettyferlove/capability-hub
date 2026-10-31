import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(command, args, environment = process.env, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: environment,
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    let output = '';
    if (capture)
      child.stdout.setEncoding('utf8').on('data', (value) => {
        output += value;
      });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}
const context = process.env.DOCKER_CONTEXT;
const endpoint =
  process.env.DOCKER_HOST && !context
    ? process.env.DOCKER_HOST
    : await run(
        'docker',
        [
          'context',
          'inspect',
          ...(context ? [context] : []),
          '--format',
          '{{.Endpoints.docker.Host}}',
        ],
        process.env,
        true,
      );
if (!endpoint.startsWith('unix://'))
  throw new Error('外部集成测试需要明确的本机 Docker Unix socket');
const environment = { ...process.env };
for (const name of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'])
  delete environment[name];
const directory = await mkdtemp(join(tmpdir(), 'hub-external-'));
const key = join(directory, 'identity');
const project = 'hub-test-' + randomBytes(6).toString('hex');
const docker = ['--host', endpoint];
const compose = [...docker, 'compose', '-f', 'compose.test.yaml', '-p', project];
environment.CAPABILITY_HUB_TEST_PASSWORD = randomBytes(24).toString('hex');
environment.CAPABILITY_HUB_TEST_GIT_PUBLIC_KEY = key + '.pub';
environment.CAPABILITY_HUB_TEST_APP_SECRET = randomBytes(24).toString('hex');
try {
  await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', key], environment);
  await run(
    'docker',
    [...compose, 'up', '-d', '--build', '--wait', '--wait-timeout', '60'],
    environment,
  );
  async function port(service, target) {
    const address = await run(
      'docker',
      [...compose, 'port', service, String(target)],
      environment,
      true,
    );
    if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error('测试服务未绑定 loopback');
    return address;
  }
  await run(
    'docker',
    [
      ...compose,
      'exec',
      '-T',
      '-e',
      'CAPABILITY_HUB_TEST_APP_SECRET=' + environment.CAPABILITY_HUB_TEST_APP_SECRET,
      'minio',
      '/bin/sh',
      '/bootstrap.sh',
    ],
    environment,
  );
  environment.CAPABILITY_HUB_TEST_DATABASE_URL = `postgresql://hub_test:${environment.CAPABILITY_HUB_TEST_PASSWORD}@${await port('postgres', 5432)}/hub_test`;
  environment.CAPABILITY_HUB_TEST_MINIO_ENDPOINT = 'http://' + (await port('minio', 9000));
  environment.CAPABILITY_HUB_TEST_GIT_URL =
    'ssh://git@' + (await port('git', 2222)) + '/repositories/fixture.git';
  environment.CAPABILITY_HUB_TEST_GIT_KEY = key;
  environment.CAPABILITY_HUB_TEST_GIT_HOST_KEY = await run(
    'docker',
    [...compose, 'exec', '-T', 'git', 'cat', '/etc/ssh/ssh_host_ed25519_key.pub'],
    environment,
    true,
  );
  await run(process.execPath, ['scripts/testing/run-tests.mjs', 'external'], environment);
} finally {
  try {
    await run(
      'docker',
      [...compose, 'down', '--volumes', '--remove-orphans', '--rmi', 'local'],
      environment,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
