import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTestHub } from '../support/application.js';
import { httpClient } from '../support/http.js';

test('分享邀请使用实例公开地址，通用安装说明匿名分流到现有客户端配置', async (context) => {
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
  const guide = await http.get('/INSTALL.md?token=must-not-reflect').expect(200);
  assert.match(guide.headers['content-type'] as string, /text\/markdown/);
  assert.match(guide.text, /^# 接入 Capability Hub/);
  assert.match(guide.text, /无法确定时询问用户/);
  assert.match(guide.text, /联系此 Hub 的管理员/);
  assert.match(guide.text, /配置已生成不代表已连接/);
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
