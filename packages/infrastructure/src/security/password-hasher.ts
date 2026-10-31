import type { PasswordHasher } from '@capability-hub/application/ports';
import { fail } from '@capability-hub/domain/errors';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    if (password.length < 12 || password.length > 256)
      fail(422, 'PASSWORD_LENGTH', '密码长度必须在 12 到 256 位之间');
    const salt = randomBytes(16).toString('hex');
    const derived = (await scrypt(password, salt, 64)) as Buffer;
    return salt + ':' + derived.toString('hex');
  }
  async verify(password: string, hash: string): Promise<boolean> {
    if (!/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash)) return false;
    const [salt, encoded] = hash.split(':');
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(encoded, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
