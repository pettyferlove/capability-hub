import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { serveTestHub } from '../support/server.js';
import { publishSkill, receiveSkill, submitPublication } from '../support/application.js';
import { skillDocument } from '../support/content.js';
import { signIn } from '../support/http.js';
import { agentClientIds } from '@capability-hub/contracts';
import { digest } from '@capability-hub/domain/canonical';
import { archive } from '@capability-hub/infrastructure/content';

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
    assert.equal(tools.tools.length, 9);
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

test('分享提交限制所属团队，重复幂等请求只生成一次接收，扫描后仍需独立审核', async (context) => {
  const fixture = await serveTestHub(context);
  const role = await fixture.store.find('roles', 'key', 'maintainer');
  assert(role);
  await fixture.hub.administration.grantRole(fixture.admin, {
    principal_id: fixture.admin.id,
    role_id: role.id,
    scope_type: 'platform',
    scope_id: '',
  });
  const token = await fixture.hub.tokens.issue(fixture.admin, {
    name: 'contribute',
    scope: 'hub:contribute',
  });
  const client = await connect(fixture.origin, token.token);
  try {
    const tools = await client.listTools();
    assert.equal(tools.tools.length, 12);
    const targets = await client.callTool({ name: 'list_share_teams', arguments: {} });
    assert(!targets.isError);
    const teams = object(targets.structuredContent).teams;
    assert(Array.isArray(teams));
    const team = teams.map(object).find((entry) => entry.name === '研发团队');
    assert(team && typeof team.id === 'string');
    const input = {
      destination: { target: 'new', slug: 'shared-skill', owner_group_id: team.id },
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
    const other = await fixture.hub.administration.createGroup(fixture.admin, { name: '其他团队' });
    const destination = { ...input.destination, owner_group_id: other.id };
    const denied = await client.callTool({
      name: 'share_skill',
      arguments: { ...input, destination },
    });
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied.content), /FORBIDDEN/);
    const browser = await signIn(fixture);
    await browser
      .post('/api/intakes')
      .set('Idempotency-Key', randomUUID())
      .field(
        'metadata',
        JSON.stringify({ ...destination, kind: 'skill', version_label: input.version_label }),
      )
      .attach(
        'file',
        await archive([
          { path: 'SKILL.md', bytes: skillDocument('shared-skill'), executable: false },
        ]),
        'skill.zip',
      )
      .expect(403);
    assert.equal((await fixture.store.all('assets')).length, 0);
    assert.equal((await fixture.store.all('intakes')).length, 0);
    const first = await client.callTool({ name: 'share_skill', arguments: input });
    const repeated = await client.callTool({ name: 'share_skill', arguments: input });
    assert(!first.isError);
    assert.deepEqual(first.structuredContent, repeated.structuredContent);
    const asset = await fixture.store.get(
      'assets',
      String(object(first.structuredContent).asset_id),
    );
    assert.equal(asset?.owner_group_id, team.id);
    assert.equal((await fixture.store.all('intakes')).length, 1);
    await fixture.worker.tick();
    assert.equal((await fixture.store.all('intakes'))[0].state, 'ready');
    assert.equal((await fixture.hub.catalog.search(null, {})).total, 0);
  } finally {
    await client.close();
  }
});

test('分享团队要求成员关系和创建权限，停用或撤销成员关系、权限后立即排除', async (context) => {
  const fixture = await serveTestHub(context);
  const { administration } = fixture.hub;
  await administration.addMembership(fixture.admin, {
    user_id: fixture.reader.id,
    group_id: fixture.teamId,
  });
  const allowed = await administration.createGroup(fixture.admin, { name: '可创建团队' });
  const disabled = await administration.createGroup(fixture.admin, { name: '停用团队' });
  await administration.addMembership(fixture.admin, {
    user_id: fixture.reader.id,
    group_id: disabled.id,
  });
  await administration.updateGroup(fixture.admin, disabled.id, { active: false }, '"1"');
  const role = await fixture.store.find('roles', 'key', 'maintainer');
  assert(role);
  const token = await fixture.hub.tokens.issue(fixture.reader, {
    name: 'share-teams',
    scope: 'hub:read',
  });
  const client = await connect(fixture.origin, token.token);
  context.after(async () => await client.close());
  const browser = await signIn(fixture, fixture.reader.username);
  const tool = (await client.listTools()).tools.find((entry) => entry.name === 'list_share_teams');
  assert.equal(tool?.annotations?.readOnlyHint, true);
  const empty = await client.callTool({ name: 'list_share_teams', arguments: {} });
  assert(!empty.isError);
  assert.deepEqual(empty.structuredContent, { teams: [] });
  assert.deepEqual(
    (await browser.get('/api/intakes/share-teams').expect(200)).body,
    empty.structuredContent,
  );
  const binding = await administration.grantRole(fixture.admin, {
    principal_id: fixture.reader.id,
    role_id: role.id,
    scope_type: 'team',
    scope_id: allowed.id,
  });
  await administration.grantRole(fixture.admin, {
    principal_id: fixture.reader.id,
    role_id: role.id,
    scope_type: 'team',
    scope_id: disabled.id,
  });
  const nonmember = await client.callTool({ name: 'list_share_teams', arguments: {} });
  assert(!nonmember.isError);
  assert.deepEqual(nonmember.structuredContent, { teams: [] });
  const membership = await administration.addMembership(fixture.admin, {
    user_id: fixture.reader.id,
    group_id: allowed.id,
  });
  const scoped = await client.callTool({ name: 'list_share_teams', arguments: {} });
  assert(!scoped.isError);
  assert.deepEqual(scoped.structuredContent, { teams: [{ id: allowed.id, name: allowed.name }] });
  assert.deepEqual(
    (await browser.get('/api/intakes/share-teams').expect(200)).body,
    scoped.structuredContent,
  );
  const memberships = object((await browser.get('/api/me').expect(200)).body).groups;
  assert(Array.isArray(memberships));
  assert.deepEqual(
    new Set(memberships),
    new Set([
      { id: fixture.teamId, name: '研发团队' },
      { id: allowed.id, name: allowed.name },
    ]),
  );
  await administration.removeGrant(fixture.admin, 'role_bindings', binding.id);
  const revoked = await client.callTool({ name: 'list_share_teams', arguments: {} });
  assert(!revoked.isError);
  assert.deepEqual(revoked.structuredContent, { teams: [] });
  await administration.grantRole(fixture.admin, {
    principal_id: fixture.reader.id,
    role_id: role.id,
    scope_type: 'platform',
    scope_id: '',
  });
  await administration.removeGrant(fixture.admin, 'memberships', membership.id);
  const global = await client.callTool({ name: 'list_share_teams', arguments: {} });
  assert(!global.isError);
  const teams = object(global.structuredContent).teams;
  assert(Array.isArray(teams));
  assert.deepEqual(
    new Set(teams.map((team: unknown) => object(team).id)),
    new Set([fixture.teamId]),
  );
  assert.deepEqual(
    (await browser.get('/api/intakes/share-teams').expect(200)).body,
    global.structuredContent,
  );
});

test('MCP 按资源名称解析固定版本，仍受历史与当前受众约束且不开放候选内容', async (context) => {
  const fixture = await serveTestHub(context);
  const first = await publishSkill(fixture, {
    body: '旧版正文',
    distribution: { mode: 'approved_audience', audience: ['group:' + fixture.teamId] },
  });
  await publishSkill(fixture, {
    assetId: first.intake.asset_id,
    version: '2.0.0',
    body: '新版正文',
  });
  await receiveSkill(fixture, { assetId: first.intake.asset_id, version: '3.0.0' });
  const ownerToken = await fixture.hub.tokens.issue(fixture.admin, {
    name: 'pinned-version',
    scope: 'hub:read',
  });
  const readerToken = await fixture.hub.tokens.issue(fixture.reader, {
    name: 'pinned-version',
    scope: 'hub:read',
  });
  const owner = await connect(fixture.origin, ownerToken.token);
  const reader = await connect(fixture.origin, readerToken.token);
  context.after(async () => {
    await owner.close();
    await reader.close();
  });
  const pinned = await owner.callTool({
    name: 'get_asset_version',
    arguments: { asset_id: 'sample-skill', version_label: '1.0.0' },
  });
  assert(!pinned.isError);
  const release = object(object(pinned.structuredContent).release);
  assert.equal(release.version_id, first.intake.version_id);
  const loaded = await owner.callTool({
    name: 'load_skill',
    arguments: { version_id: release.version_id },
  });
  assert.match(String(object(loaded.structuredContent).body), /旧版正文/);
  for (const [client, version] of [
    [reader, '1.0.0'],
    [owner, '3.0.0'],
    [owner, '4.0.0'],
  ] as const) {
    const denied = await client.callTool({
      name: 'get_asset_version',
      arguments: { asset_id: 'sample-skill', version_label: version },
    });
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied.content), /NOT_FOUND/);
  }
  const visible = await reader.callTool({
    name: 'get_asset_version',
    arguments: { asset_id: first.intake.asset_id, version_label: '2.0.0' },
  });
  assert(!visible.isError);
  await publishSkill(fixture, {
    assetId: first.intake.asset_id,
    version: '4.0.0',
    distribution: { mode: 'approved_audience', audience: ['group:' + fixture.teamId] },
  });
  const restricted = await reader.callTool({
    name: 'get_asset_version',
    arguments: { asset_id: 'sample-skill', version_label: '2.0.0' },
  });
  assert.equal(restricted.isError, true);
  assert.match(JSON.stringify(restricted.content), /NOT_FOUND/);
});

test('按名称更新未发布 Skill 与按 UUID 更新复用同一幂等结果，仍检查维护权限', async (context) => {
  const fixture = await serveTestHub(context);
  const intake = await receiveSkill(fixture);
  const token = await fixture.hub.tokens.issue(fixture.admin, {
    name: 'update-skill',
    scope: 'hub:contribute',
  });
  const client = await connect(fixture.origin, token.token);
  context.after(async () => await client.close());
  const input = {
    destination: { target: 'existing', asset_id: 'sample-skill' },
    version_label: '1.1.0',
    files: [{ path: 'SKILL.md', content: skillDocument().toString() }],
    idempotency_key: randomUUID(),
  };
  const byName = await client.callTool({ name: 'share_skill', arguments: input });
  assert(!byName.isError);
  assert.equal(object(byName.structuredContent).asset_id, intake.asset_id);
  const byId = await client.callTool({
    name: 'share_skill',
    arguments: { ...input, destination: { target: 'existing', asset_id: intake.asset_id } },
  });
  assert.deepEqual(byId.structuredContent, byName.structuredContent);
  const readerToken = await fixture.hub.tokens.issue(fixture.reader, {
    name: 'update-skill',
    scope: 'hub:contribute',
  });
  const reader = await connect(fixture.origin, readerToken.token);
  context.after(async () => await reader.close());
  for (const assetId of ['sample-skill', 'missing-skill']) {
    const denied = await reader.callTool({
      name: 'share_skill',
      arguments: { ...input, destination: { target: 'existing', asset_id: assetId } },
    });
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied.content), /NOT_FOUND/);
  }
  assert.equal((await fixture.store.all('intakes')).length, 2);
});

test('MCP 参数错误指出名称、版本或查询字段，不能误报内部故障', async (context) => {
  const fixture = await serveTestHub(context);
  const token = await fixture.hub.tokens.issue(fixture.admin, {
    name: 'invalid-input',
    scope: 'hub:contribute',
  });
  const client = await connect(fixture.origin, token.token);
  context.after(async () => await client.close());
  const input = {
    destination: { target: 'new', slug: 'sample-skill', owner_group_id: fixture.teamId },
    version_label: '1.0.0',
    files: [{ path: 'SKILL.md', content: skillDocument().toString() }],
    idempotency_key: randomUUID(),
  };
  for (const entry of [
    {
      name: 'share_skill',
      field: 'slug',
      arguments: { ...input, destination: { ...input.destination, slug: 'Invalid Name' } },
    },
    {
      name: 'share_skill',
      field: 'version_label',
      arguments: { ...input, version_label: 'latest' },
    },
    {
      name: 'search_skills',
      field: 'languages',
      arguments: { query: '', languages: ['x'.repeat(129)] },
    },
    { name: 'search_skills', field: 'cursor', arguments: { query: '', cursor: '' } },
  ]) {
    const result = await client.callTool({ name: entry.name, arguments: entry.arguments });
    assert.equal(result.isError, true);
    assert.match(JSON.stringify(result.content), new RegExp(entry.field));
    assert.doesNotMatch(JSON.stringify(result.content), /INTERNAL_ERROR/);
  }
  assert.equal((await fixture.store.all('intakes')).length, 0);
});

test('MCP 分享按解码后总大小限制 Base64 文件，未超限内容不会被编码膨胀误拒绝', async (context) => {
  const fixture = await serveTestHub(context);
  const token = await fixture.hub.tokens.issue(fixture.admin, {
    name: 'binary-share',
    scope: 'hub:contribute',
  });
  const client = await connect(fixture.origin, token.token);
  context.after(async () => await client.close());
  for (const size of [400 * 1024, 512 * 1024]) {
    const result = await client.callTool({
      name: 'share_skill',
      arguments: {
        destination: { target: 'new', slug: 'sample-skill', owner_group_id: fixture.teamId },
        version_label: '1.0.0',
        files: [
          { path: 'SKILL.md', content: skillDocument().toString() },
          {
            path: 'data/reference.bin',
            content: Buffer.alloc(size, 128).toString('base64'),
            encoding: 'base64',
          },
        ],
        idempotency_key: randomUUID(),
      },
    });
    if (size === 400 * 1024) assert(!result.isError);
    else {
      assert.equal(result.isError, true);
      assert.match(JSON.stringify(result.content), /SHARE_SIZE/);
    }
  }
  assert.equal((await fixture.store.all('intakes')).length, 1);
});

test('MCP 在当前授权下分页读取二进制参考文件，不依赖另一次 HTTP 下载授权', async (context) => {
  const fixture = await serveTestHub(context);
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0x00]);
  const intake = await receiveSkill(fixture, {
    files: [
      {
        path: 'SKILL.md',
        bytes: skillDocument('sample-skill', '参考 [图片](references/image.png)'),
        executable: false,
      },
      { path: 'references/image.png', bytes, executable: false },
    ],
  });
  const request = await submitPublication(fixture, intake, {
    mode: 'approved_audience',
    audience: ['group:' + fixture.teamId],
  });
  const scan = await fixture.store.get('scans', intake.scan_run_id);
  assert(scan);
  await fixture.hub.publications.decide(
    fixture.reviewer,
    request.id,
    {
      decision: 'approve',
      comment: '已核对二进制测试样本',
      policy_digest: request.policy_digest,
      accepted_warnings: scan.findings
        .filter((finding) => finding.severity === 'warning')
        .map((finding) => ({ finding_id: finding.id, reason: '测试固定的六字节二进制参考文件' })),
    },
    `"${request.revision}"`,
    randomUUID(),
  );
  const token = await fixture.hub.tokens.issue(fixture.admin, {
    name: 'binary-read',
    scope: 'hub:read',
  });
  const client = await connect(fixture.origin, token.token);
  context.after(async () => await client.close());
  const chunks: Buffer[] = [];
  for (const offset of [0, 4]) {
    const result = await client.callTool({
      name: 'read_skill_file',
      arguments: {
        version_id: intake.version_id,
        path: 'references/image.png',
        offset,
        max_bytes: 4,
      },
    });
    assert(!result.isError);
    const chunk = object(result.structuredContent);
    assert.equal(chunk.binary, true);
    assert.equal(chunk.encoding, 'base64');
    assert.equal(chunk.next_offset, Math.min(offset + 4, bytes.length));
    assert.equal(chunk.truncated, offset + 4 < bytes.length);
    chunks.push(Buffer.from(String(chunk.data), 'base64'));
  }
  assert.deepEqual(Buffer.concat(chunks), bytes);
  const invalid = await client.callTool({
    name: 'read_skill_file',
    arguments: {
      version_id: intake.version_id,
      path: 'references/image.png',
      offset: bytes.length + 1,
    },
  });
  assert.equal(invalid.isError, true);
  assert.match(JSON.stringify(invalid.content), /INVALID_OFFSET/);
});

test('MCP 推荐与网页登录用户共享同一资源的推荐状态', async (context) => {
  const fixture = await serveTestHub(context);
  const { intake } = await publishSkill(fixture);
  const token = await fixture.hub.tokens.issue(fixture.reader, {
    name: 'recommend',
    scope: 'hub:contribute',
  });
  const web = await signIn(fixture, 'reader');
  const client = await connect(fixture.origin, token.token);
  try {
    const body = { asset_id: intake.asset_id, recommended: true };
    await web.post('/api/ratings').send(body).expect(200);
    const repeated = await client.callTool({ name: 'rate_asset', arguments: body });
    assert(!repeated.isError);
    assert.equal(object(repeated.structuredContent).recommendation_count, 1);
    const cancelled = await client.callTool({
      name: 'rate_asset',
      arguments: { ...body, recommended: false },
    });
    assert(!cancelled.isError);
    const detail = await web.get('/api/assets/' + intake.asset_id).expect(200);
    assert.equal(detail.body.community.recommended, false);
    assert.equal(detail.body.community.recommendation_count, 0);
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
