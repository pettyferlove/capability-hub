import { openOperations } from './runtime.js';
import { ScryptPasswordHasher } from '@capability-hub/infrastructure/security';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
const index = process.argv.indexOf('--username');
const username = index >= 0 ? process.argv[index + 1]?.trim().toLowerCase() : undefined;
if (!username || !process.stdin.isTTY) {
  process.stderr.write('请在本地交互终端运行：pnpm account:recover --username ACCOUNT\n');
  process.exit(1);
}
let hidden = false;
const output = new Writable({
  write(chunk: Uint8Array, _encoding, callback) {
    if (!hidden) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: true });
const runtime = await openOperations();
const { store } = runtime;
try {
  const user = await store.find('users', 'username', username);
  if (!user) throw new Error('账号不存在');
  process.stdout.write(`恢复账号 ${username}。需要具备该实例数据目录的本地访问权限。\n`);
  process.stdout.write('新密码（至少 12 位，不回显）：');
  hidden = true;
  const password = await rl.question('');
  hidden = false;
  process.stdout.write('\n再次输入（不回显）：');
  hidden = true;
  const confirm = await rl.question('');
  hidden = false;
  process.stdout.write('\n');
  if (password !== confirm) throw new Error('两次输入不一致，未修改');
  const password_hash = await new ScryptPasswordHasher().hash(password);
  await store.tx(async () => {
    const current = await store.get('users', user.id);
    if (!current) throw new Error('账号不存在');
    await store.put('users', {
      ...current,
      password_hash,
      active: true,
      revision: current.revision + 1,
    });
    for (const session of await store.where('sessions', 'user_id', user.id))
      await store.put('sessions', { ...session, revoked_at: Date.now() });
    await store.audit(
      'local-recovery',
      'identity.local_password_recovered',
      user.id,
      'local filesystem owner recovery',
    );
  });
  process.stdout.write('密码已恢复，网页会话已撤销。请回浏览器使用新密码登录。\n');
} catch (e) {
  process.stderr.write((e instanceof Error ? e.message : '恢复失败') + '\n');
  process.exitCode = 1;
} finally {
  hidden = false;
  rl.close();
  await runtime.close();
}
