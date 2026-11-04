import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { cliInstallationResponseSchema } from '@capability-hub/contracts';
import { createTestHub, publishSkill } from '../support/application.js';
import { serveTestHub } from '../support/server.js';
import { httpClient } from '../support/http.js';

test('CLI 说明直接提供 npm 安装命令，仅配置私有仓库时附带仓库参数与可选认证', async (context) => {
  for (const registry of [undefined, 'https://registry.example/repository/npm/']) {
    const fixture = await createTestHub(context, {
      publicUrl: 'https://hub.example.test',
      cliRegistry: registry,
    });
    const http = httpClient(fixture);
    const response = await http
      .get('/api/cli-installation?registry=https://untrusted.example&token=must-not-reflect')
      .expect(200);
    const guide = cliInstallationResponseSchema.parse(response.body);
    assert.equal(guide.registry_url, registry ?? null);
    const commands = guide.steps.flatMap((step) => (step.command ? [step.command] : []));
    assert(
      commands.includes(
        `npm install -g @capability-hub/cli${registry ? ` --registry='${registry}' --@capability-hub:registry='${registry}'` : ''}\ncapability-hub --cli-version`,
      ),
    );
    assert.equal(
      commands.some((command) => command.startsWith('npm config')),
      false,
    );
    const authentication = guide.steps.find((step) => step.command?.startsWith('npm login'));
    assert.equal(authentication?.optional, registry ? true : undefined);
    if (registry) {
      assert(authentication?.command?.includes(registry));
      assert(authentication?.description.includes('允许匿名下载时跳过此步'));
    }
    const markdown = await http
      .get('/connect/cli?token=must-not-reflect')
      .expect('Content-Type', /text\/markdown/)
      .expect(200);
    for (const step of guide.steps) {
      assert(markdown.text.includes(step.description));
      if (step.command) assert(markdown.text.includes(step.command));
    }
    for (const text of [JSON.stringify(guide), markdown.text]) {
      assert.equal(text.includes('must-not-reflect'), false);
      assert.equal(text.includes('untrusted.example'), false);
      assert.equal(text.includes('registry.npmjs.org'), false);
      assert.equal(text.includes('获取 CLI 仓库地址'), false);
    }
  }
});

test('官方正文随实例交付，安装链接只指向当前公开且内容完全匹配的目录版本', async (context) => {
  const fixture = await serveTestHub(context);
  const http = httpClient(fixture);
  const name = 'use-capability-hub';
  const path = `/connect/skills/${name}/SKILL.md`;
  const bytes = await readFile(new URL(`../../skills/${name}/SKILL.md`, import.meta.url));
  const raw = await http
    .get(path)
    .expect('Content-Type', /text\/markdown/)
    .expect(200);
  assert.equal(raw.text, bytes.toString('utf8'));
  const files = [{ path: 'SKILL.md', bytes, executable: false }];
  const directory = `${fixture.origin}/skills/${name}/`;
  const token = await fixture.hub.tokens.issue(fixture.reader, {
    name: 'client',
    scope: 'hub:read',
  });
  async function checkLinks(version?: { label: string; id: string }) {
    const guide = await http.get('/INSTALL.md').expect(200);
    const client = new Client(
      { name: 'guide-test', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } },
    );
    try {
      await client.connect(
        new StreamableHTTPClientTransport(new URL(fixture.origin + '/mcp'), {
          requestInit: { headers: { Authorization: 'Bearer ' + token.token } },
        }),
      );
      for (const document of [guide.text, client.getInstructions() ?? '']) {
        assert(document.includes(fixture.origin + path));
        assert.equal(document.includes(directory), !!version);
        if (version) assert(document.includes(directory + version.label));
      }
      if (version) {
        const search = await client.callTool({ name: 'search_skills', arguments: { query: name } });
        const { items } = z
          .object({
            items: z
              .array(
                z.object({
                  current_release: z.object({ version_id: z.uuid() }),
                }),
              )
              .length(1),
          })
          .parse(search.structuredContent);
        assert.equal(items[0].current_release.version_id, version.id);
        const loaded = await client.callTool({
          name: 'load_skill',
          arguments: { version_id: items[0].current_release.version_id },
        });
        assert.equal(z.object({ body: z.string() }).parse(loaded.structuredContent).body, raw.text);
      }
    } finally {
      await client.close();
    }
  }
  await checkLinks();
  const first = await publishSkill(fixture, {
    slug: name,
    files,
    distribution: { mode: 'approved_audience', audience: ['organization'] },
  });
  await checkLinks();
  const next = { slug: name, assetId: first.intake.asset_id };
  await publishSkill(fixture, {
    ...next,
    version: '2.0.0',
    files: [...files, { path: 'notes.txt', bytes: Buffer.from('附加内容'), executable: false }],
  });
  await checkLinks();
  await publishSkill(fixture, { ...next, version: '3.0.0' });
  await checkLinks();
  const published = await publishSkill(fixture, { ...next, files, version: '4.0.0' });
  await checkLinks({ label: '4.0.0', id: published.intake.version_id });
  const asset = await fixture.hub.assetAccess.getAsset(next.assetId);
  await fixture.hub.lifecycle.updateState(
    fixture.admin,
    asset.id,
    { lifecycle: 'deprecated', reason: '撤下安装推荐' },
    `"${asset.revision}"`,
  );
  await checkLinks();
  assert.equal((await http.get(`/skills/${name}/4.0.0/files/SKILL.md`).expect(200)).text, raw.text);
});

test('目录不可用时仍交付首次接入说明和随附正文', async (context) => {
  const origin = 'https://hub.example.test';
  const fixture = await createTestHub(context, { publicUrl: origin });
  const http = httpClient(fixture);
  context.mock.method(fixture.store, 'get', () => {
    throw new Error('目录存储不可用');
  });
  const path = '/connect/skills/use-capability-hub/SKILL.md';
  const guide = await http.get('/INSTALL.md').expect(200);
  assert(guide.text.includes(origin + '/connect/mcp?client=codex&scope=project'));
  assert(guide.text.includes(origin + path));
  assert.equal(guide.text.includes(origin + '/skills/use-capability-hub/'), false);
  await http
    .get(path)
    .expect('Content-Type', /text\/markdown/)
    .expect(200);
});

test('分享邀请匿名提供 MCP 与 CLI 路径，未知客户端可读取说明但不能冒用配置预设', async (context) => {
  const fixture = await createTestHub(context, { publicUrl: 'https://hub.example.test' });
  const http = httpClient(fixture);
  const share = await http
    .get('/api/hub-share?client=cursor&token=must-not-reflect')
    .set('X-Forwarded-Host', 'untrusted.example')
    .expect(200);
  assert.deepEqual(share.body, {
    installation_url: 'https://hub.example.test/INSTALL.md',
    prompt:
      '请帮我将这个 Capability Hub 接入当前使用的 Agent：\nhttps://hub.example.test/INSTALL.md',
  });
  const guide = await http.get('/INSTALL.md?client=custom&token=must-not-reflect').expect(200);
  assert.match(guide.headers['content-type'] as string, /text\/markdown/);
  assert.match(guide.text, /^# 接入 Capability Hub/);
  assert.match(guide.text, /无法确定时询问用户/);
  assert.match(guide.text, /联系此 Hub 的管理员/);
  assert.match(guide.text, /配置已生成不代表已连接/);
  const cliLink = /\]\((https:\/\/[^)]+\/connect\/cli)\)/.exec(guide.text)?.[1];
  assert(cliLink);
  const cliUrl = new URL(cliLink);
  assert.equal(cliUrl.origin, 'https://hub.example.test');
  const cliGuide = await http
    .get(cliUrl.pathname)
    .expect('Content-Type', /text\/markdown/)
    .expect(200);
  const query = (text: string) =>
    text.split('\n').find((line) => line.startsWith('capability-hub search '));
  assert(query(guide.text));
  assert.equal(query(guide.text), query(cliGuide.text));
  assert.equal(guide.text.includes('must-not-reflect'), false);
  const links = [...guide.text.matchAll(/\]\((https:\/\/[^)]+\/connect\/mcp\?[^)]+)\)/g)];
  assert.equal(links.length, 16);
  for (const [, link] of links) {
    const url = new URL(link!);
    assert.equal(url.origin, 'https://hub.example.test');
    const response = await http.get(url.pathname + url.search).expect(200);
    assert(response.text.includes('https://hub.example.test/mcp'));
    assert(response.text.includes('OAuth'));
    assert.equal(response.text.includes('CAPABILITY_HUB_TOKEN'), false);
  }
  for (const path of ['/api/hub-mcp-config', '/connect/mcp'])
    await http.get(path).query({ client: 'custom' }).expect(422);
  assert.deepEqual(await fixture.hub.tokens.list(fixture.admin.id), []);
  await http.post('/mcp').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).expect(401);
});

test('Hub 首次接入接口匿名交付八种客户端说明，不创建令牌或放开 MCP 权限', async (context) => {
  const fixture = await createTestHub(context, { publicUrl: 'https://hub.example.test' });
  const http = httpClient(fixture);
  for (const [client, projectPath, userPath] of [
    ['codex', '.codex/config.toml', '~/.codex/config.toml'],
    ['claude-code', '.mcp.json', '通过 claude mcp add --scope user 登记'],
    ['cursor', '.cursor/mcp.json', '~/.cursor/mcp.json'],
    ['opencode', 'opencode.json', '~/.config/opencode/opencode.json'],
    ['pi', '.pi/mcp.json', '~/.pi/agent/mcp.json'],
    ['gemini-cli', '.gemini/settings.json', '~/.gemini/settings.json'],
    ['vscode', '.vscode/mcp.json', '通过 MCP: Open User Configuration 打开用户 mcp.json'],
    ['copilot-cli', '.mcp.json', '~/.copilot/mcp-config.json'],
  ]) {
    for (const scope of ['project', 'user'] as const) {
      const response = await http.get('/api/hub-mcp-config').query({ client, scope }).expect(200);
      const guide = response.body;
      assert.equal(guide.client, client);
      assert.equal(guide.scope, scope);
      assert.equal(guide.target_file, scope === 'project' ? projectPath : userPath);
      assert.equal(guide.runtime_client_verification, false);
      assert.deepEqual(
        guide.required_variables.map((variable: { name: string; secret: boolean }) => ({
          name: variable.name,
          secret: variable.secret,
        })),
        [],
      );
      assert(guide.text.includes('https://hub.example.test/mcp'));
      assert(guide.installation_prompt.includes(guide.text));
      assert(guide.installation_prompt.includes(guide.target_file));
      assert(guide.installation_prompt.includes('浏览器'));
      assert(guide.installation_prompt.includes('https://hub.example.test/connect/cli'));
      const manual = await http
        .get('/api/hub-mcp-config')
        .query({ client, scope, method: 'token' })
        .expect(200);
      assert(manual.body.text.includes('CAPABILITY_HUB_TOKEN'));
      const markdown = await http.get('/connect/mcp').query({ client, scope }).expect(200);
      assert.match(markdown.headers['content-type'] as string, /text\/markdown/);
      assert.equal(markdown.text, guide.installation_prompt);
    }
  }
  for (const path of ['/api/hub-mcp-config', '/connect/mcp']) {
    await http.get(path).query({ client: 'unknown' }).expect(422);
    await http.get(path).query({ client: 'pi', scope: 'global' }).expect(422);
    await http.get(path).query({ client: 'pi', token: 'must-not-reflect' }).expect(422);
  }
  assert.deepEqual(await fixture.hub.tokens.list(fixture.admin.id), []);
  await http.post('/mcp').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' }).expect(401);
});
