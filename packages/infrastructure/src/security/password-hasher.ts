import type { PasswordHasher } from '@capability-hub/application/ports';
import { fail } from '@capability-hub/domain/errors';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

/**
 * 用 scrypt 派生口令：16 字节随机盐、64 字节输出，返回 `salt:digest` 十六进制串，
 * 明文不落库也不进日志；`hash` 对长度不在 12–256 的口令抛 422/`PASSWORD_LENGTH`。
 * `verify` 先校验串格式再 `timingSafeEqual` 比较，格式不符直接返回 false。
 */
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
