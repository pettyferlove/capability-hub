import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { serveTestHub } from '../support/server.js';
import { publishSkill } from '../support/application.js';
import { skillDocument } from '../support/content.js';
import { agentClientIds } from '@capability-hub/contracts';
import { digest } from '@capability-hub/domain/canonical';

async function connect(origin: string, token: string) {
  const client = new Client(
    { name: 'capability-hub-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
      requestInit: { headers: { Authorization: 'Bearer ' + token } },
    }),
  );
  return client;
}

function object(value: unknown): Record<string, unknown> {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

test('只读连接可以转交公开 Hub 邀请，无需取得 Skill 提交权限', async (context) => {
  const fixture = await serveTestHub(context);
  const token = await fixture.hub.tokens.issue(fixture.reader, {
    name: 'invite',
    scope: 'hub:read',
  });
  const client = await connect(fixture.origin, token.token);
  try {
    const shareUrl = fixture.origin + '/api/hub-share';
    assert(client.getInstructions()?.includes(shareUrl));
    const invitation = await fetch(shareUrl);
    assert.equal(invitation.status, 200);
    const installUrl = fixture.origin + '/INSTALL.md';
    assert.deepEqual(await invitation.json(), {
      installation_url: installUrl,
      prompt: `请帮我将这个 Capability Hub 接入当前使用的 Agent：\n${installUrl}`,
    });
    assert(!(await client.listTools()).tools.some((tool) => tool.name === 'share_skill'));
  } finally {
    await client.close();
  }
});

test('官方 MCP 客户端完成协议发现，读取令牌只看到读取工具，逐字符读取与分段归档可还原固定内容', async (context) => {
  const fixture = await serveTestHub(context);
  const published = await publishSkill(fixture, { body: '中文🙂内容' });
  const token = await fixture.hub.tokens.issue(fixture.admin, { name: 'read', scope: 'hub:read' });
  const client = await connect(fixture.origin, token.token);
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 7);
    for (const name of ['get_mcp_config', 'activate_mcp']) {
      const tool = tools.tools.find((item) => item.name === name)!;
      const properties = object(tool.inputSchema.properties);
      assert.deepEqual(object(properties.client).enum, [...agentClientIds]);
    }
    for (const [target, directory] of [
      ['codex', '.agents/skills'],
      ['claude-code', '.claude/skills'],
      ['cursor', '.cursor/skills'],
      ['opencode', '.opencode/skills'],
      ['pi', '.agents/skills'],
      ['gemini-cli', '.gemini/skills'],
      ['vscode', '.github/skills'],
      ['copilot-cli', '.github/skills'],
    ]) {
      const installation = await client.callTool({
        name: 'install_skill',
        arguments: { version_id: published.intake.version_id, client: target },
      });
      assert.equal(
        object(installation.structuredContent).suggested_directory,
        `${directory}/sample-skill`,
      );
    }
    assert.equal(
      tools.tools.some((tool) =>
        ['share_skill', 'rate_asset', 'report_asset_feedback'].includes(tool.name),
      ),
      false,
    );
    const loaded = await client.callTool({
      name: 'load_skill',
      arguments: { version_id: published.intake.version_id },
    });
    assert(!loaded.isError);
    const body = object(loaded.structuredContent).body;
    assert.equal(typeof body, 'string');
    const bytes = Buffer.from(body as string);
    const offset = bytes.indexOf(Buffer.from('中文'));
    const piece = await client.callTool({
      name: 'read_skill_file',
      arguments: {
        version_id: published.intake.version_id,
        path: 'SKILL.md',
        offset,
        max_bytes: 4,
      },
    });
    const chunk = object(piece.structuredContent);
    assert.equal(chunk.text, '中');
    assert.equal(chunk.next_offset, offset + 3);
    const invalid = await client.callTool({
      name: 'read_skill_file',
      arguments: {
        version_id: published.intake.version_id,
        path: 'SKILL.md',
        offset: offset + 1,
        max_bytes: 4,
      },
    });
    assert.equal(invalid.isError, true);
    const chunks: Buffer[] = [];
    let cursor = 0;
    let expected = '';
    for (;;) {
      const response = await client.callTool({
        name: 'install_skill',
        arguments: { version_id: published.intake.version_id, offset: cursor, max_bytes: 37 },
      });
      const result = object(response.structuredContent);
      const archive = object(result.archive_chunk);
      assert.equal(result.status, 'awaiting_client_installation');
      assert.equal(archive.offset, cursor);
      assert.equal(typeof archive.data, 'string');
      chunks.push(Buffer.from(archive.data as string, 'base64'));
      assert.equal(typeof result.artifact_digest, 'string');
      expected = result.artifact_digest as string;
      assert.equal(typeof archive.next_offset, 'number');
      cursor = archive.next_offset as number;
      if (archive.complete) break;
    }
    assert.equal(digest(Buffer.concat(chunks)), expected);
    await fixture.hub.tokens.revoke(
      fixture.admin.id,
      (await fixture.hub.tokens.list(fixture.admin.id)).find((entry) => entry.name === 'read')!.id,
    );
    await assert.rejects(() => client.listTools());
  } finally {
    await client.close();
  }
});

test('分享令牌提供提交工具，重复幂等请求只生成一次接收，扫描后仍需独立审核', async (context) => {
  const fixture = await serveTestHub(context);
  const token = await fixture.hub.tokens.issue(fixture.admin, {
    name: 'contribute',
    scope: 'hub:contribute',
  });
  const client = await connect(fixture.origin, token.token);
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 10);
    const input = {
      destination: { target: 'new', slug: 'shared-skill', owner_group_id: fixture.teamId },
      version_label: '1.0.0',
      files: [
        {
          path: 'SKILL.md',
          content: skillDocument('shared-skill').toString(),
          encoding: 'utf8',
          executable: false,
        },
      ],
      idempotency_key: randomUUID(),
    };
    const first = await client.callTool({ name: 'share_skill', arguments: input });
    const repeated = await client.callTool({ name: 'share_skill', arguments: input });
    assert(!first.isError);
    assert.deepEqual(first.structuredContent, repeated.structuredContent);
    assert.equal((await fixture.store.all('intakes')).length, 1);
    await fixture.worker.tick();
    assert.equal((await fixture.store.all('intakes'))[0].state, 'ready');
    assert.equal((await fixture.hub.catalog.search(null, {})).total, 0);
  } finally {
    await client.close();
  }
});

test('贡献令牌允许普通读者上报脱敏反馈，MCP 重试去重并返回详情链接；读取令牌不可调用', async (context) => {
  const fixture = await serveTestHub(context);
  const { intake } = await publishSkill(fixture);
  const token = await fixture.hub.tokens.issue(fixture.reader, {
    name: 'feedback',
    scope: 'hub:contribute',
  });
  const readToken = await fixture.hub.tokens.issue(fixture.reader, {
    name: 'read',
    scope: 'hub:read',
  });
  const client = await connect(fixture.origin, token.token);
  const reader = await connect(fixture.origin, readToken.token);
  try {
    const tool = (await client.listTools()).tools.find(
      (item) => item.name === 'report_asset_feedback',
    );
    assert(tool);
    assert.equal(tool.annotations?.readOnlyHint, false);
    assert.equal(tool.annotations?.idempotentHint, true);
    const args = {
      version_id: intake.version_id,
      idempotency_key: randomUUID(),
      consent: true,
      kind: 'capability_gap',
      title: '支持批量导入',
      scenario: '批量迁移业务数据',
      expected: '批量处理',
      actual: '只能单次处理',
    };
    const first = await client.callTool({ name: 'report_asset_feedback', arguments: args });
    assert(!first.isError);
    const retry = await client.callTool({ name: 'report_asset_feedback', arguments: args });
    assert.deepEqual(retry.structuredContent, first.structuredContent);
    assert.equal(
      String(object(first.structuredContent).detail_url),
      `${fixture.origin}/asset/sample-skill?feedback=${String(object(first.structuredContent).id)}`,
    );
    await assert.rejects(
      () => reader.callTool({ name: 'report_asset_feedback', arguments: args }),
      /Tool report_asset_feedback not found/,
    );
    const noConsent = await client.callTool({
      name: 'report_asset_feedback',
      arguments: { ...args, consent: false },
    });
    assert(noConsent.isError);
    assert.equal((await fixture.store.all('asset_feedback')).length, 1);
  } finally {
    await client.close();
    await reader.close();
  }
});
