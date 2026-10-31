import type {
  CredentialCipher,
  CredentialIdentity,
  CredentialSecret,
} from '@capability-hub/application/ports';
import type { EncryptedCredential } from '@capability-hub/domain/models';
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/** 密文绑定凭据身份；同一实例中的其他账号、域名和认证类型不能复用密文。 */
export class AesCredentialCipher implements CredentialCipher {
  private readonly key: Buffer;
  constructor(instanceSecret: string) {
    this.key = Buffer.from(
      hkdfSync('sha256', instanceSecret, 'capability-hub', 'git-credential-v1', 32),
    );
  }
  private aad(identity: CredentialIdentity): Buffer {
    return Buffer.from(
      JSON.stringify([identity.id, identity.user_id, identity.host, identity.kind]),
    );
  }
  seal(identity: CredentialIdentity, value: CredentialSecret): EncryptedCredential {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(this.aad(identity));
    return {
      iv: iv.toString('base64'),
      data: Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]).toString(
        'base64',
      ),
      tag: cipher.getAuthTag().toString('base64'),
    };
  }
  open(identity: CredentialIdentity, encrypted: EncryptedCredential): CredentialSecret {
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(encrypted.iv, 'base64'));
    decipher.setAAD(this.aad(identity));
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64'));
    const value: unknown = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(encrypted.data, 'base64')),
        decipher.final(),
      ]).toString(),
    );
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !('secret' in value) ||
      typeof value.secret !== 'string' ||
      !('passphrase' in value) ||
      typeof value.passphrase !== 'string' ||
      Object.keys(value).length !== 2
    )
      throw new Error('Invalid credential payload');
    return { secret: value.secret, passphrase: value.passphrase };
  }
}
