import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  auth,
  Client,
  StreamableHTTPClientTransport,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
  type StoredOAuthClientInformation,
  type StoredOAuthTokens,
} from '@modelcontextprotocol/client';
import { serveTestHub } from '../support/server.js';
import { signIn } from '../support/http.js';

test('官方 SDK 自动发现授权服务并完成 DCR、PKCE、兑换、刷新与 MCP 调用', async (context) => {
  const fixture = await serveTestHub(context);
  let info: StoredOAuthClientInformation | undefined;
  let saved: StoredOAuthTokens | undefined;
  let discovery: OAuthDiscoveryState | undefined;
  let verifier = '';
  let authorizationUrl: URL | undefined;
  const provider: OAuthClientProvider = {
    redirectUrl: 'http://127.0.0.1:54321/callback',
    clientMetadata: {
      client_name: 'SDK client',
      redirect_uris: ['http://127.0.0.1:54321/callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    state: () => 'sdk-test-state',
    clientInformation: () => info,
    saveClientInformation: (value) => {
      info = value;
    },
    tokens: () => saved,
    saveTokens: (value) => {
      saved = value;
    },
    saveCodeVerifier: (value) => {
      verifier = value;
    },
    codeVerifier: () => verifier,
    redirectToAuthorization: (url) => {
      authorizationUrl = url;
    },
    saveDiscoveryState: (value) => {
      discovery = value;
    },
    discoveryState: () => discovery,
  };
  const serverUrl = fixture.origin + '/mcp';
  assert.equal(await auth(provider, { serverUrl, scope: 'hub:read' }), 'REDIRECT');
  assert(authorizationUrl);
  const started = await fetch(authorizationUrl, { redirect: 'manual' });
  const requestId = new URL(started.headers.get('location')!, fixture.origin).searchParams.get(
    'authorization',
  );
  const browser = await signIn(fixture);
  const response = await browser
    .post('/api/connections/authorize/' + requestId)
    .send({ allow: true })
    .expect(200);
  const callback = new URL(response.body.redirect_uri as string);
  assert.equal(callback.searchParams.get('state'), 'sdk-test-state');
  assert.equal(
    await auth(provider, {
      serverUrl,
      authorizationCode: callback.searchParams.get('code')!,
      iss: callback.searchParams.get('iss')!,
    }),
    'AUTHORIZED',
  );
  assert(saved);
  const previous = saved.refresh_token;
  assert.equal(await auth(provider, { serverUrl }), 'AUTHORIZED');
  assert.notEqual(saved.refresh_token, previous);
  const client = new Client({ name: 'sdk-oauth-client', version: '1.0.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(serverUrl), { authProvider: provider }),
    );
    assert((await client.listTools()).tools.some((tool) => tool.name === 'search_skills'));
    assert(!(await client.listTools()).tools.some((tool) => tool.name === 'share_skill'));
  } finally {
    await client.close();
  }
});
