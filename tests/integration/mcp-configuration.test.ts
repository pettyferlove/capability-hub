import { agentClientIds, publicResourcePath } from '@capability-hub/contracts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import type { Response } from 'supertest';
import type { ClientConfigurationResponse } from '@capability-hub/contracts/http';
import {
  buildMcpDocument,
  emptyMcpEntry,
} from '../../apps/web/src/features/publishing/mcp-entry.js';
import { createTestHub, submitPublication, type TestHub } from '../support/application.js';
import { httpClient, signIn } from '../support/http.js';

async function shareKey(
  f: TestHub,
  publicAccess: boolean,
  {
    url = 'https://service.example.test/mcp',
    secret = randomUUID(),
    authMode = 'api-key',
  }: {
    url?: string;
    secret?: string;
    authMode?: 'api-key' | 'bearer';
  } = {},
) {
  const owner = await signIn(f);
  const descriptor = buildMcpDocument(
    { ...emptyMcpEntry, description: '测试服务', url, authMode, sharedKey: secret },
    'sample-mcp',
    '1.0.0',
  );
  const uploadKey = randomUUID();
  const upload = (value: string) =>
    owner
      .post('/api/intakes')
      .set('Idempotency-Key', uploadKey)
      .field(
        'metadata',
        JSON.stringify({
          target: 'new',
          kind: 'mcp',
          slug: 'sample-mcp',
          owner_group_id: f.teamId,
          version_label: '1.0.0',
          shared_mcp_key: value,
          confirm_sharing: true,
        }),
      )
      .attach('file', Buffer.from(JSON.stringify(descriptor)), 'server.json');
  const receipt = await upload(secret).expect(202);
  assert.deepEqual((await upload(secret).expect(202)).body, receipt.body);
  await upload(randomUUID()).expect(409);
  await f.worker.tick();
  const intake = await f.hub.intakeQueries.getDetail(f.admin, receipt.body.intake_id);
  assert.equal(intake.state, 'ready');
  assert(intake.version_id && intake.scan_run_id);
  assert(!JSON.stringify(intake).includes(secret));
  assert(!Object.hasOwn(intake, 'pending_mcp_key'));
  assert.equal((await f.store.get('assets', intake.asset_id))?.mcp_shared_keys, undefined);
  const request = await submitPublication(
    f,
    { ...intake, version_id: intake.version_id, scan_run_id: intake.scan_run_id },
    { mode: 'approved_audience', audience: [publicAccess ? 'public' : 'group:' + f.teamId] },
  );
  await f.hub.publications.decide(
    f.reviewer,
    request.id,
    {
      decision: 'approve',
      comment: '确认分发范围',
      policy_digest: request.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  return { owner, secret, url, assetId: intake.asset_id, versionId: intake.version_id };
}

test('首次录入共享凭据必须显式确认领取范围', async (context) => {
  const f = await createTestHub(context);
  const owner = await signIn(f);
  const descriptor = buildMcpDocument(
    { ...emptyMcpEntry, description: '服务', url: 'https://example.test/mcp', authMode: 'bearer' },
    'example',
    '1.0.0',
  );
  const secret = randomUUID();
  for (const confirm_sharing of [undefined, false]) {
    const reply = await owner
      .post('/api/intakes')
      .set('Idempotency-Key', randomUUID())
      .field(
        'metadata',
        JSON.stringify({
          target: 'new',
          kind: 'mcp',
          slug: 'example',
          owner_group_id: f.teamId,
          version_label: '1.0.0',
          shared_mcp_key: secret,
          confirm_sharing,
        }),
      )
      .attach('file', Buffer.from(JSON.stringify(descriptor)), 'server.json')
      .expect(422);
    assert(!reply.text.includes(secret));
  }
  assert.equal((await f.store.all('intakes')).length, 0);
});

test('同时写进共享字段和描述文件的密钥在接收前被拒绝', async (context) => {
  const f = await createTestHub(context);
  const owner = await signIn(f);
  const secret = randomUUID();
  const descriptor = {
    name: 'local.capability-hub/example',
    version: '1.0.0',
    description: '服务',
    remotes: [
      {
        type: 'streamable-http',
        url: 'https://example.test/mcp',
        headers: [{ name: 'X-Api-Key', isSecret: true, default: secret }],
      },
    ],
  };
  const response = await owner
    .post('/api/intakes')
    .set('Idempotency-Key', randomUUID())
    .field(
      'metadata',
      JSON.stringify({
        target: 'new',
        kind: 'mcp',
        slug: 'example',
        owner_group_id: f.teamId,
        version_label: '1.0.0',
        shared_mcp_key: secret,
        confirm_sharing: true,
      }),
    )
    .attach('file', Buffer.from(JSON.stringify(descriptor)), 'server.json')
    .expect(422);
  assert.equal(response.body.error.code, 'MCP_KEY_IN_DOCUMENT');
  assert(!response.text.includes(secret));
  assert.equal((await f.store.all('intakes')).length, 0);
});

for (const [authMode, header] of [
  ['api-key', 'X-Api-Key'],
  ['bearer', 'Authorization'],
] as const) {
  test(`客户端能用共享 ${header} 直连目标 MCP 并列出工具`, async (context) => {
    const f = await createTestHub(context);
    const secret = randomUUID();
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'example-service', version: '1.0.0' });
      server.registerTool('ping', { description: '连通性检查' }, async () => ({
        content: [{ type: 'text', text: 'ok' }],
      }));
      return server;
    });
    const route = toNodeHandler(handler);
    const server = createServer((req, res) => {
      if (
        req.url !== '/mcp' ||
        req.headers[header.toLowerCase()] !== (authMode === 'bearer' ? 'Bearer ' + secret : secret)
      ) {
        res.writeHead(403).end();
        return;
      }
      void route(req, res).catch(() => res.destroy());
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    context.after(async () => {
      await handler.close();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    });
    const address = server.address();
    assert(address && typeof address !== 'string');
    const url = 'http://127.0.0.1:' + address.port + '/mcp';
    const { owner, versionId } = await shareKey(f, true, { url, secret, authMode });
    const response = await owner
      .get('/api/versions/' + versionId + '/mcp-config')
      .query({ client: 'claude-code', installation_option_id: 'remote-1', scope: 'user' })
      .expect(200);
    const service = response.body.config.mcpServers['sample-mcp'];
    const client = new Client({ name: 'installation-test', version: '1.0.0' });
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(service.url), {
          requestInit: { headers: service.headers },
        }),
      );
      assert.deepEqual(
        (await client.listTools()).tools.map((tool) => tool.name),
        ['ping'],
      );
    } finally {
      await client.close();
    }
  });

  test(`共享 ${header} 只交付给已授权的安装配置，描述、公开下载和审计均不含原值`, async (context) => {
    const f = await createTestHub(context);
    const { secret, assetId, versionId } = await shareKey(f, true, { authMode });
    const anonymous = httpClient(f);
    const path = '/api/versions/' + versionId + '/mcp-config';
    const args = { installation_option_id: 'remote-1', client: 'codex', scope: 'user' };
    await anonymous.get(path).query(args).expect(401);
    const publicAsset = await anonymous.get('/api/assets/' + assetId).expect(200);
    assert.equal(publicAsset.body.installation_options[0].has_shared_key, true);
    assert(!publicAsset.text.includes(secret));
    const guide = await anonymous.get(publicResourcePath('mcp', 'sample-mcp', '1.0.0')).expect(200);
    assert(guide.text.includes('get_mcp_config') && !guide.text.includes(secret));
    const file = await f.hub.content.getFile(null, versionId, 'server.json');
    assert(!file.bytes.includes(secret));
    for (const table of ['assets', 'intakes', 'versions', 'audit', 'idempotency'] as const)
      assert(!JSON.stringify(await f.store.all(table)).includes(secret), table);
    const token = await f.hub.tokens.issue(f.reader, { name: '配置', scope: 'hub:read' });
    for (const client of agentClientIds) {
      const response = await anonymous
        .post('/api/mcp-config')
        .set('Authorization', 'Bearer ' + token.token)
        .send({ ...args, client, version_id: versionId })
        .expect(200);
      const body = response.body as ClientConfigurationResponse;
      const servers = Object.values(body.config)[0] as Record<string, Record<string, unknown>>;
      assert.deepEqual(servers['sample-mcp'][client === 'codex' ? 'http_headers' : 'headers'], {
        [header]: authMode === 'bearer' ? 'Bearer ' + secret : secret,
      });
      assert.deepEqual(body.required_variables, []);
      assert(body.text.includes(secret));
    }
    await f.hub.lifecycle.revokeVersion(f.admin, versionId, '停止共享');
    await anonymous
      .post('/api/mcp-config')
      .set('Authorization', 'Bearer ' + token.token)
      .send({ ...args, version_id: versionId })
      .expect(404);
  });
}

test('同地址的原值 Authorization 与 Bearer 凭据独立维护和交付', async (context) => {
  const f = await createTestHub(context);
  const { url, assetId, owner, secret } = await shareKey(f, true, { authMode: 'bearer' });
  const descriptor = {
    name: 'local.capability-hub/sample-mcp',
    description: '服务',
    version: '2.0.0',
    remotes: [
      {
        name: 'authorization',
        isSecret: true,
        value: 'Bearer {SERVICE_TOKEN}',
        variables: { SERVICE_TOKEN: { isSecret: true } },
      },
      { name: 'Authorization', isSecret: true },
    ].map((header) => ({ type: 'streamable-http', url, headers: [header] })),
  };
  const receipt = await f.hub.intakes.receive(
    f.admin,
    Buffer.from(JSON.stringify(descriptor)),
    'server.json',
    { target: 'existing', asset_id: assetId, version_label: '2.0.0' },
    randomUUID(),
  );
  await f.worker.tick();
  const intake = await f.hub.intakeQueries.getDetail(f.admin, receipt.intake_id);
  assert(intake.version_id && intake.scan_run_id);
  const request = await submitPublication(f, {
    ...intake,
    version_id: intake.version_id,
    scan_run_id: intake.scan_run_id,
  });
  await f.hub.publications.decide(
    f.reviewer,
    request.id,
    {
      decision: 'approve',
      comment: '确认',
      policy_digest: request.policy_digest,
      accepted_warnings: [],
    },
    '"1"',
    randomUUID(),
  );
  const path = '/api/management/assets/' + assetId + '/mcp-keys';
  const state = await owner.get(path).expect(200);
  assert.equal(state.body.targets.length, 2);
  const config = (id: string) =>
    owner
      .get('/api/versions/' + intake.version_id + '/mcp-config')
      .query({ client: 'codex', installation_option_id: id });
  assert(!(await config('remote-2').expect(200)).text.includes(secret));
  const raw = randomUUID();
  const change = (value: string, scheme: 'bearer' | undefined, etag: string) =>
    owner
      .put(path)
      .set('Idempotency-Key', randomUUID())
      .set('If-Match', etag)
      .send({ url, name: 'Authorization', value, scheme, confirm_sharing: true });
  const rawSave = await change(raw, undefined, state.headers.etag).expect(200);
  const next = randomUUID();
  await change(next, 'bearer', rawSave.headers.etag).expect(200);
  const bearerConfig = (await config('remote-1').expect(200)).body.config.mcp_servers['sample-mcp'];
  const rawConfig = (await config('remote-2').expect(200)).body.config.mcp_servers['sample-mcp'];
  assert.deepEqual(bearerConfig.http_headers, { authorization: 'Bearer ' + next });
  assert.deepEqual(rawConfig.http_headers, { Authorization: raw });
});

test('同名请求头只共享给同一资产和完整地址，其他安装项仍引用使用者变量', async (context) => {
  const f = await createTestHub(context);
  const { url, secret, assetId, owner } = await shareKey(f, true);
  const urls = [
    url,
    url + '/other',
    'https://service.example.test:8443/mcp',
    'https://other.example.test/mcp',
  ];
  const descriptor = {
    name: 'local.capability-hub/test-service',
    version: '2.0.0',
    description: '服务',
    remotes: urls.map((endpoint) => ({
      type: 'streamable-http',
      url: endpoint,
      headers: [{ name: 'x-api-key', isSecret: true }],
    })),
  };
  for (const sameAsset of [true, false]) {
    const receipt = await f.hub.intakes.receive(
      f.admin,
      Buffer.from(JSON.stringify(descriptor)),
      'server.json',
      {
        ...(sameAsset
          ? { target: 'existing', asset_id: assetId }
          : { target: 'new', kind: 'mcp', slug: 'second-service', owner_group_id: f.teamId }),
        version_label: '2.0.0',
      },
      randomUUID(),
    );
    await f.worker.tick();
    const intake = await f.hub.intakeQueries.getDetail(f.admin, receipt.intake_id);
    assert(intake.version_id && intake.scan_run_id);
    const request = await submitPublication(f, {
      ...intake,
      version_id: intake.version_id,
      scan_run_id: intake.scan_run_id,
    });
    await f.hub.publications.decide(
      f.reviewer,
      request.id,
      {
        decision: 'approve',
        comment: '确认',
        policy_digest: request.policy_digest,
        accepted_warnings: [],
      },
      '"1"',
      randomUUID(),
    );
    for (const [i] of urls.entries()) {
      const reply: Response = await owner
        .get('/api/versions/' + intake.version_id + '/mcp-config')
        .query({ installation_option_id: 'remote-' + (i + 1), client: 'codex' })
        .expect(200);
      assert.equal(reply.body.text.includes(secret), sameAsset && i === 0);
      assert.equal(reply.body.required_variables.length, sameAsset && i === 0 ? 0 : 1);
    }
  }
});

test('审核中的密钥不能覆盖已经轮换的共享绑定', async (context) => {
  const f = await createTestHub(context);
  const { url, secret, assetId, owner, versionId } = await shareKey(f, true);
  const descriptor = buildMcpDocument(
    { ...emptyMcpEntry, url, description: '服务', authMode: 'api-key' },
    'sample-mcp',
    '1.1.0',
  );
  const receipt = await f.hub.intakes.receive(
    f.admin,
    Buffer.from(JSON.stringify(descriptor)),
    'server.json',
    { target: 'existing', asset_id: assetId, version_label: '1.1.0' },
    randomUUID(),
    { url, name: 'X-Api-Key', value: secret },
  );
  await f.worker.tick();
  const intake = await f.hub.intakeQueries.getDetail(f.admin, receipt.intake_id);
  assert(intake.version_id && intake.scan_run_id);
  const request = await submitPublication(f, {
    ...intake,
    version_id: intake.version_id,
    scan_run_id: intake.scan_run_id,
  });
  const path = '/api/management/assets/' + assetId + '/mcp-keys';
  const state = await owner.get(path).expect(200);
  const next = randomUUID();
  await owner
    .put(path)
    .set('Idempotency-Key', randomUUID())
    .set('If-Match', state.headers.etag)
    .send({ url, name: 'X-Api-Key', value: next, confirm_sharing: true })
    .expect(200);
  await assert.rejects(
    f.hub.publications.decide(
      f.reviewer,
      request.id,
      {
        decision: 'approve',
        comment: '确认',
        policy_digest: request.policy_digest,
        accepted_warnings: [],
      },
      '"1"',
      randomUUID(),
    ),
    { code: 'MCP_KEY_CHANGED' },
  );
  assert.equal((await f.store.get('versions', intake.version_id))?.availability, 'unreleased');
  const config = await owner
    .get('/api/versions/' + versionId + '/mcp-config')
    .query({ client: 'codex', installation_option_id: 'remote-1' })
    .expect(200);
  assert(config.body.text.includes(next) && !config.body.text.includes(secret));
});

test('维护者可轮换或移除绑定，过期修订、越权和未声明的地址不能取得或改写密钥', async (context) => {
  const f = await createTestHub(context);
  const { url, owner, secret, assetId, versionId } = await shareKey(f, false);
  const reader = await signIn(f, 'reader');
  const path = '/api/management/assets/' + assetId + '/mcp-keys';
  const configPath = '/api/versions/' + versionId + '/mcp-config';
  const args = { installation_option_id: 'remote-1', client: 'codex' };
  const target = { url, name: 'X-Api-Key' };
  const state = await owner.get(path).expect(200);
  assert.deepEqual(state.body.targets, [{ ...target, configured: true }]);
  assert(!state.text.includes(secret));
  await reader.get(path).expect(403);
  await reader.get(configPath).query(args).expect(404);
  const next = randomUUID();
  const change = (value: string | null, etag: string, key = randomUUID()) =>
    owner
      .put(path)
      .set('Idempotency-Key', key)
      .set('If-Match', etag)
      .send({ ...target, value, ...(value !== null ? { confirm_sharing: true } : {}) });
  await owner
    .put(path)
    .set('Idempotency-Key', randomUUID())
    .set('If-Match', state.headers.etag)
    .send({ ...target, value: next })
    .expect(422);
  assert((await owner.get(configPath).query(args).expect(200)).body.text.includes(secret));
  await reader
    .put(path)
    .set('Idempotency-Key', randomUUID())
    .set('If-Match', state.headers.etag)
    .send({ ...target, value: next, confirm_sharing: true })
    .expect(403);
  await owner
    .put(path)
    .set('Idempotency-Key', randomUUID())
    .send({ ...target, value: next, confirm_sharing: true })
    .expect(428);
  await owner
    .put(path)
    .set('Idempotency-Key', randomUUID())
    .set('If-Match', state.headers.etag)
    .send({ ...target, url: url + '/other', value: next, confirm_sharing: true })
    .expect(422);
  const key = randomUUID();
  const rotated = await change(next, state.headers.etag, key).expect(200);
  assert.deepEqual((await change(next, state.headers.etag, key).expect(200)).body, rotated.body);
  await change(null, state.headers.etag).expect(412);
  const config = await owner.get(configPath).query(args).expect(200);
  assert(config.body.text.includes(next) && !config.body.text.includes(secret));
  await change(null, rotated.headers.etag).expect(200);
  const removed = await owner.get(configPath).query(args).expect(200);
  assert(!removed.body.text.includes(next));
  assert.deepEqual(
    removed.body.required_variables.map((v: { name: string }) => v.name),
    ['X_API_KEY'],
  );
});

for (const entry of [
  { mode: 'url', url: 'https://docs.example.test/mcp', authMode: 'bearer' },
  { mode: 'url', url: 'http://10.0.0.8:8080/mcp', authMode: 'bearer' },
  { mode: 'url', url: 'http://gateway.example.test/mcp', authMode: 'api-key' },
  { mode: 'command', url: '', authMode: 'none' },
] as const) {
  const { mode, url, authMode } = entry;
  const variableName = authMode === 'api-key' ? 'GATEWAY_API_KEY' : 'DOCS_TOKEN';
  test(`MCP ${url || mode} 表单生成描述经真实扫描和独立发布，所有客户端仅输出固定配置与变量引用`, async (context) => {
    const fixture = await createTestHub(context);
    const slug = mode === 'url' ? 'remote-docs' : 'package-docs';
    const document = buildMcpDocument(
      {
        ...emptyMcpEntry,
        mode,
        description: '团队文档检索',
        url,
        authMode,
        keySource: 'client',
        tokenVariable: 'DOCS_TOKEN',
        apiKeyVariable: 'GATEWAY_API_KEY',
        command: 'npx -y @example/docs@1.2.3 --project "my workspace"',
        environment: 'DOCS_TOKEN',
      },
      slug,
      '1.0.0',
    );
    const receipt = await fixture.hub.intakes.receive(
      fixture.admin,
      Buffer.from(JSON.stringify(document)),
      'server.json',
      { target: 'new', kind: 'mcp', slug, owner_group_id: fixture.teamId, version_label: '1.0.0' },
      randomUUID(),
    );
    await fixture.worker.tick();
    const intake = await fixture.hub.intakeQueries.getDetail(fixture.admin, receipt.intake_id);
    assert.equal(intake.state, 'ready', intake.error_message ?? 'MCP 未通过扫描');
    assert(intake.version_id && intake.scan_run_id);
    const request = await submitPublication(fixture, {
      ...intake,
      version_id: intake.version_id,
      scan_run_id: intake.scan_run_id,
    });
    await fixture.hub.publications.decide(
      fixture.reviewer,
      request.id,
      {
        decision: 'approve',
        comment: '核对固定安装项',
        policy_digest: request.policy_digest,
        accepted_warnings: [],
      },
      '"1"',
      randomUUID(),
    );
    const consumer = httpClient(fixture);
    const token = await fixture.hub.tokens.issue(fixture.admin, {
      name: 'configuration-test',
      scope: 'hub:read',
    });
    for (const client of agentClientIds) {
      const response = await consumer
        .get(`/api/versions/${intake.version_id}/mcp-config`)
        .query({
          installation_option_id: mode === 'url' ? 'remote-1' : 'package-1',
          client,
          scope: 'project',
        })
        .expect(200);
      const body = response.body as ClientConfigurationResponse;
      const post: Response = await consumer
        .post('/api/mcp-config')
        .set('Authorization', `Bearer ${token.token}`)
        .send({
          version_id: intake.version_id,
          installation_option_id: mode === 'url' ? 'remote-1' : 'package-1',
          client,
          scope: 'project',
        })
        .expect(200);
      assert.deepEqual(post.body, body);
      assert.equal(body.runtime_client_verification, false);
      const root =
        client === 'codex'
          ? 'mcp_servers'
          : client === 'opencode'
            ? 'mcp'
            : client === 'vscode'
              ? 'servers'
              : 'mcpServers';
      const server = (body.config[root] as Record<string, Record<string, unknown>>)[slug];
      if (mode === 'url') {
        assert.equal(server[client === 'gemini-cli' ? 'httpUrl' : 'url'], url);
        if (client === 'opencode') {
          assert.equal(server.type, 'remote');
          assert.equal(server.oauth, authMode === 'bearer' ? false : undefined);
        }
      } else {
        const command = ['npx', '-y', '@example/docs@1.2.3', '--project', 'my workspace'];
        if (client === 'opencode') {
          assert.deepEqual(server.command, command);
          assert.equal(server.args, undefined);
          assert.deepEqual(server.environment, { DOCS_TOKEN: '{env:DOCS_TOKEN}' });
        } else {
          assert.equal(server.command, 'npx');
          assert.deepEqual(server.args, command.slice(1));
        }
      }
      if (client === 'vscode' || client === 'copilot-cli')
        assert.equal(server.type, mode === 'url' ? 'http' : 'stdio');

      assert.deepEqual(
        body.required_variables.map(({ name, secret }) => ({ name, secret })),
        [{ name: variableName, secret: true }],
      );
      const reference =
        client === 'cursor' || client === 'vscode'
          ? `\${env:${variableName}}`
          : client === 'opencode'
            ? `{env:${variableName}}`
            : `\${${variableName}}`;
      if (mode === 'url') {
        assert(body.text.includes(url));
        if (authMode === 'api-key') {
          assert.deepEqual(server[client === 'codex' ? 'env_http_headers' : 'headers'], {
            'X-Api-Key': client === 'codex' ? variableName : reference,
          });
          assert.equal(server.bearer_token_env_var, undefined);
          assert(body.text.includes('X-Api-Key'));
        } else if (client === 'codex') {
          assert.equal(server.bearer_token_env_var, variableName);
          assert(body.text.includes('bearer_token_env_var'));
        } else {
          assert.deepEqual(server.headers, { Authorization: `Bearer ${reference}` });
          assert(body.text.includes(reference));
        }
      } else {
        assert(body.text.includes('@example/docs@1.2.3'));
        assert(body.text.includes('my workspace'));
        assert(body.text.includes(client === 'codex' ? 'env_vars' : reference));
      }
    }
    const userConfig = await consumer
      .get(`/api/versions/${intake.version_id}/mcp-config`)
      .query({
        installation_option_id: mode === 'url' ? 'remote-1' : 'package-1',
        client: 'codex',
        scope: 'user',
      })
      .expect(200);
    assert.equal(userConfig.body.target_file, '~/.codex/config.toml');
    await consumer
      .get(`/api/versions/${intake.version_id}/mcp-config`)
      .query({ installation_option_id: 'remote-1', client: 'unknown-client' })
      .expect(422);
    await consumer
      .get(`/api/versions/${intake.version_id}/mcp-config`)
      .query({ installation_option_id: 'missing', client: 'codex' })
      .expect(422);
    await fixture.hub.lifecycle.revokeVersion(fixture.admin, intake.version_id, '终止分发');
    await consumer
      .get(`/api/versions/${intake.version_id}/mcp-config`)
      .query({ installation_option_id: mode === 'url' ? 'remote-1' : 'package-1', client: 'codex' })
      .expect(404);
  });
}

for (const entry of [
  {
    title: 'OpenCode 文件表达式',
    header: { name: 'X-Context', value: '{file:~/.private-key}' },
    clients: ['opencode'],
    code: 'UNSUPPORTED_CLIENT_EXPRESSION',
  },
  {
    title: '客户端环境表达式',
    header: { name: 'X-Context', value: '${UNDECLARED}' },
    clients: ['pi', 'gemini-cli', 'copilot-cli', 'vscode', 'cursor', 'claude-code'],
    code: 'UNSUPPORTED_CLIENT_EXPRESSION',
  },
  {
    title: '环境变量模板',
    environment: { name: 'BASE_URL', value: 'https://{HOST}/api', variables: { HOST: {} } },
    clients: agentClientIds,
    code: 'UNSUPPORTED_ENV_TEMPLATE',
  },
  {
    title: '多变量 Header',
    header: { name: 'X-Context', value: '{TEAM}:{USER}', variables: { TEAM: {}, USER: {} } },
    clients: agentClientIds,
    code: 'UNSUPPORTED_HEADER_TEMPLATE',
  },
  {
    title: 'Pi 命令求值 Header',
    header: { name: 'X-Context', value: '!echo unexpected-command' },
    clients: ['pi'],
    code: 'UNSUPPORTED_CLIENT_VALUE',
  },
]) {
  test(`配置生成拒绝${entry.title}，不把声明值转成隐式执行`, async (context) => {
    const fixture = await createTestHub(context);
    const document = {
      name: 'local.capability-hub/context-service',
      version: '1.0.0',
      description: '上下文服务',
      ...('environment' in entry
        ? {
            packages: [
              {
                registryType: 'npm',
                identifier: '@example/docs',
                version: '1.2.3',
                transport: { type: 'stdio' },
                environmentVariables: [entry.environment],
              },
            ],
          }
        : {
            remotes: [
              {
                type: 'streamable-http',
                url: 'https://context.example.test/mcp',
                headers: [entry.header],
              },
            ],
          }),
    };
    const receipt = await fixture.hub.intakes.receive(
      fixture.admin,
      Buffer.from(JSON.stringify(document)),
      'server.json',
      {
        target: 'new',
        kind: 'mcp',
        slug: 'context-service',
        owner_group_id: fixture.teamId,
        version_label: '1.0.0',
      },
      randomUUID(),
    );
    await fixture.worker.tick();
    const intake = await fixture.hub.intakeQueries.getDetail(fixture.admin, receipt.intake_id);
    assert.equal(intake.state, 'ready', intake.error_message ?? '扫描未完成');
    assert(intake.version_id && intake.scan_run_id);
    const request = await submitPublication(fixture, {
      ...intake,
      version_id: intake.version_id,
      scan_run_id: intake.scan_run_id,
    });
    await fixture.hub.publications.decide(
      fixture.reviewer,
      request.id,
      {
        decision: 'approve',
        comment: '保留原始可审查描述',
        policy_digest: request.policy_digest,
        accepted_warnings: [],
      },
      '"1"',
      randomUUID(),
    );
    for (const client of entry.clients) {
      const response: Response = await httpClient(fixture)
        .get(`/api/versions/${intake.version_id}/mcp-config`)
        .query({
          installation_option_id: 'environment' in entry ? 'package-1' : 'remote-1',
          client,
        })
        .expect(422);
      assert.equal(response.body.error.code, entry.code);
    }
  });
}
