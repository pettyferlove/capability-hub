import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import {
  AesCredentialCipher,
  ScryptPasswordHasher,
  SignedCatalogCursorCodec,
} from '@capability-hub/infrastructure/security';

test('密码哈希每次使用随机盐，错误密码和损坏的格式均无法通过验证', async () => {
  const hasher = new ScryptPasswordHasher();
  const first = await hasher.hash('A-test-password-2026!');
  const second = await hasher.hash('A-test-password-2026!');
  assert.notEqual(first, second);
  assert.equal(await hasher.verify('A-test-password-2026!', first), true);
  assert.equal(await hasher.verify('incorrect', first), false);
  for (const malformed of ['', 'salt:xyz', first + ':extra', '0'.repeat(32) + ':not-hex'])
    assert.equal(await hasher.verify('A-test-password-2026!', malformed), false);
  await assert.rejects(() => hasher.hash('short'));
});

test('凭据密文绑定账号、凭据 ID、域名和认证类型，修改任何绑定或密文字节都会失败', () => {
  const cipher = new AesCredentialCipher('ab'.repeat(32));
  const identity = {
    id: randomUUID(),
    user_id: randomUUID(),
    host: 'git.example',
    kind: 'token' as const,
  };
  const secret = { secret: 'synthetic-personal-token', passphrase: '' };
  const first = cipher.seal(identity, secret);
  const second = cipher.seal(identity, secret);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.data, second.data);
  assert.deepEqual(cipher.open(identity, first), secret);
  for (const changed of [
    { ...identity, id: randomUUID() },
    { ...identity, user_id: randomUUID() },
    { ...identity, host: 'other.example' },
    { ...identity, kind: 'ssh' as const },
  ])
    assert.throws(() => cipher.open(changed, first));
  const corrupted = Buffer.from(first.data, 'base64');
  corrupted[0] ^= 1;
  assert.throws(() => cipher.open(identity, { ...first, data: corrupted.toString('base64') }));
  assert.throws(() => new AesCredentialCipher('cd'.repeat(32)).open(identity, first));
});

test('目录游标拒绝篡改、跨实例签名和额外段，解码不信任已签名对象的字段类型', () => {
  const codec = new SignedCatalogCursorCodec('test-key');
  const value = {
    fingerprint: 'sha256:' + '0'.repeat(64),
    offset: 20,
    expires: Date.now() + 10000,
  };
  const encoded = codec.encode(value);
  assert.deepEqual(codec.decode(encoded), value);
  assert.equal(codec.decode(encoded + '.extra'), undefined);
  assert.equal(codec.decode('x' + encoded), undefined);
  assert.equal(new SignedCatalogCursorCodec('other-key').decode(encoded), undefined);
  assert.equal(codec.decode(codec.encode({ ...value, offset: -1 })), undefined);
  assert.equal(codec.decode('not-a-cursor'), undefined);
});
