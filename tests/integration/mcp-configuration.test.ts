import { agentClientIds } from '@capability-hub/contracts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { Response } from 'supertest';
import type { ClientConfigurationResponse } from '@capability-hub/contracts/http';
import {
  buildMcpDocument,
  emptyMcpEntry,
} from '../../apps/web/src/features/publishing/mcp-entry.js';
import { createTestHub, submitPublication } from '../support/application.js';
import { httpClient } from '../support/http.js';

for (const entry of [
  { mode: 'url', url: 'https://docs.example.test/mcp' },
  { mode: 'url', url: 'http://10.0.0.8:8080/mcp' },
  { mode: 'command', url: '' },
] as const) {
  const { mode, url } = entry;
  test(`MCP ${url || mode} 表单生成描述经真实扫描和独立发布，所有客户端仅输出固定配置与变量引用`, async (context) => {
    const fixture = await createTestHub(context);
    const slug = mode === 'url' ? 'remote-docs' : 'package-docs';
    const document = buildMcpDocument(
      {
        ...emptyMcpEntry,
        mode,
        description: '团队文档检索',
        url,
        authenticated: true,
        tokenVariable: 'DOCS_TOKEN',
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
          assert.equal(server.oauth, false);
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
        body.required_variables.map((variable) => variable.name),
        ['DOCS_TOKEN'],
      );
      if (mode === 'url') {
        assert(body.text.includes(url));
        assert(
          body.text.includes(
            client === 'codex'
              ? 'bearer_token_env_var'
              : client === 'cursor' || client === 'vscode'
                ? '${env:DOCS_TOKEN}'
                : client === 'opencode'
                  ? '{env:DOCS_TOKEN}'
                  : '${DOCS_TOKEN}',
          ),
        );
      } else {
        assert(body.text.includes('@example/docs@1.2.3'));
        assert(body.text.includes('my workspace'));
        assert(
          body.text.includes(
            client === 'codex'
              ? 'env_vars'
              : client === 'cursor' || client === 'vscode'
                ? '${env:DOCS_TOKEN}'
                : client === 'opencode'
                  ? '{env:DOCS_TOKEN}'
                  : '${DOCS_TOKEN}',
          ),
        );
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
