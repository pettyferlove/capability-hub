import { isIP } from 'node:net';
import {
  Client,
  EqualityFilter,
  InvalidCredentialsError,
  NoSuchObjectError,
  SizeLimitExceededError,
} from 'ldapts';
import type { DirectoryAuthenticator, DirectoryIdentity } from '@capability-hub/application/ports';
import { HubError } from '@capability-hub/domain/errors';

interface LdapOptions {
  url: string;
  baseDn: string;
  bindDn: string;
  bindPassword: string;
}

/** 每次登录独占连接，用户绑定及条目复核均在该连接上完成。 */
export class LdapAuthenticator implements DirectoryAuthenticator {
  constructor(private readonly options: LdapOptions) {}

  async authenticate(username: string, password: string): Promise<DirectoryIdentity | undefined> {
    if (!password) return undefined;
    try {
      const url = new URL(this.options.url);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      await using client = new Client({
        url: this.options.url,
        connectTimeout: 5000,
        timeout: 5000,
        tlsOptions:
          url.protocol === 'ldaps:'
            ? {
                rejectUnauthorized: true,
                minVersion: 'TLSv1.2',
                servername: isIP(host) ? undefined : host,
              }
            : undefined,
      });
      await client.bind(this.options.bindDn, this.options.bindPassword);
      const { searchEntries, searchReferences } = await client.search(this.options.baseDn, {
        scope: 'sub',
        timeLimit: 5,
        filter: new EqualityFilter({ attribute: 'uid', value: username }),
        attributes: ['uid', 'cn', 'entryUUID'],
      });
      const [entry] = searchEntries;
      if (searchEntries.length !== 1 || searchReferences.length || !entry.dn) return undefined;
      const attributes = Object.fromEntries(
        Object.entries(entry).map(([key, value]) => [key.toLowerCase(), value] as const),
      );
      if (typeof attributes.uid !== 'string' || attributes.uid.toLowerCase() !== username)
        return undefined;
      try {
        await client.bind(entry.dn, password);
        const uuid = attributes.entryuuid;
        if (typeof uuid !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(uuid))
          throw new Error('LDAP 条目缺少 entryUUID');
        // 防止查询与用户绑定之间同名 DN 被删除重建。
        const confirmed = await client.search(entry.dn, {
          scope: 'base',
          filter: new EqualityFilter({ attribute: 'entryUUID', value: uuid }),
          attributes: ['1.1'],
        });
        if (confirmed.searchEntries.length !== 1) return undefined;
        const name = Array.isArray(attributes.cn) ? attributes.cn[0] : attributes.cn;
        return {
          entryUuid: uuid.toLowerCase(),
          displayName: (typeof name === 'string' && name.trim().slice(0, 80)) || username,
        };
      } catch (error) {
        if (error instanceof InvalidCredentialsError || error instanceof NoSuchObjectError)
          return undefined;
        throw error;
      }
    } catch (error) {
      if (error instanceof SizeLimitExceededError) return undefined;
      throw new HubError(503, 'LDAP_UNAVAILABLE', 'LDAP 目录服务暂时不可用', {}, true);
    }
  }
}
