import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const image = process.argv[2];
if (!image) throw new Error('请提供已构建的验收镜像标签');
const environment = { ...process.env };
const context = environment.DOCKER_CONTEXT;
const endpoint =
  environment.DOCKER_HOST && !context
    ? environment.DOCKER_HOST
    : spawnSync(
        'docker',
        [
          'context',
          'inspect',
          ...(context ? [context] : []),
          '--format',
          '{{.Endpoints.docker.Host}}',
        ],
        { encoding: 'utf8' },
      ).stdout?.trim();
if (!endpoint?.startsWith('unix://')) throw new Error('镜像验收只允许本机 Docker Unix socket');
for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'])
  delete environment[key];
const program = `
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { get } from 'node:http';
import { readFile } from 'node:fs/promises';
import { scanIsolated } from '@capability-hub/infrastructure/scanning';
assert.equal(process.getuid(), 1000);
assert.throws(() => import.meta.resolve('tsx'));
for (const dialect of ['sqlite', 'postgresql']) {
  const root = import.meta.resolve('@capability-hub/infrastructure/store');
  assert(JSON.parse(await readFile(new URL('./persistence/' + dialect + '/migrations/meta/_journal.json', root), 'utf8')).entries.length > 0);
  assert((await readFile(new URL('./persistence/' + dialect + '/migrations/0000_init.sql', root), 'utf8')).includes('CREATE TABLE'));
}
const inspected = await scanIsolated({ kind: 'skill', slug: 'compiled-skill', files: [{ path: 'SKILL.md', bytes: Buffer.from('---\\nname: compiled-skill\\ndescription: Compiled runtime fixture\\n---\\n\\n# Runtime\\n'), executable: false }] });
assert.equal(inspected.inspected.state, 'passed'); assert(inspected.zip.length > 0);
function request(path) {
  return new Promise((resolve, reject) => {
    const req = get({ hostname: '127.0.0.1', port: 4100, path, headers: { Host: 'hub.example.test' } }, (res) => {
      let text = ''; res.setEncoding('utf8'); res.on('data', (chunk) => { text += chunk; });
      res.once('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    }); req.once('error', reject); req.setTimeout(1000, () => req.destroy(new Error('Probe timeout')));
  });
}
const server = spawn(process.execPath, ['dist/main.js'], { stdio: 'inherit' });
let exited = false;
const closed = new Promise((resolve) => server.once('exit', (code) => { exited = true; resolve(code); }));
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (exited) throw new Error('服务在 readiness 之前退出');
    try {
      const response = await request('/health/ready');
      if (response.status === 200) { ready = true; break; }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert(ready, 'compiled server readiness');
  const page = await request('/discover');
  assert.equal(page.status, 200); assert(page.text.includes('<div id="root">'));
  const missing = await request('/api/missing');
  assert.notEqual(missing.headers['content-type'], 'text/html');
} finally {
  server.kill('SIGTERM');
  const timeout = setTimeout(() => server.kill('SIGKILL'), 10000);
  assert.equal(await closed, 0, 'graceful shutdown'); clearTimeout(timeout);
}
process.stdout.write('镜像验收通过：非 root、无 tsx、SQL 资产、编译扫描器、真实服务 readiness、静态页面和优雅关闭。\\n');
`;
const container = 'hub-image-check-' + randomBytes(6).toString('hex');
let result;
try {
  result = spawnSync(
    'docker',
    [
      '--host',
      endpoint,
      'run',
      '--name',
      container,
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--tmpfs',
      '/app/data:rw,uid=1000,gid=1000,mode=0700',
      '--tmpfs',
      '/tmp:rw,nosuid,mode=1777',
      '-e',
      'CAPABILITY_HUB_PUBLIC_URL=https://hub.example.test',
      '-e',
      'CAPABILITY_HUB_INSTANCE_SECRET=' + randomBytes(32).toString('hex'),
      '-e',
      'CAPABILITY_HUB_WORKER=false',
      '-e',
      'CAPABILITY_HUB_LOG_LEVEL=info',
      image,
      'node',
      '--input-type=module',
      '-e',
      program,
    ],
    { env: environment, stdio: 'inherit', timeout: 30000 },
  );
} finally {
  spawnSync('docker', ['--host', endpoint, 'rm', '--force', container], {
    env: environment,
    stdio: 'ignore',
    timeout: 10000,
  });
}
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
