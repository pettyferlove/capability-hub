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
  directoryType: 'ldap' | 'ad';
}

/** 每次登录独占连接，用户绑定及条目复核均在该连接上完成。 */
export class LdapAuthenticator implements DirectoryAuthenticator {
  constructor(private readonly options: LdapOptions) {}

  async authenticate(username: string, password: string): Promise<DirectoryIdentity | undefined> {
    if (!password) return undefined;
    try {
      const url = new URL(this.options.url);
      const activeDirectory = this.options.directoryType === 'ad';
      const usernameAttribute = activeDirectory ? 'sAMAccountName' : 'uid';
      const uuidAttribute = activeDirectory ? 'objectGUID' : 'entryUUID';
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
        filter: new EqualityFilter({ attribute: usernameAttribute, value: username }),
        attributes: activeDirectory
          ? [usernameAttribute, 'displayName', 'cn', uuidAttribute]
          : [usernameAttribute, 'cn', uuidAttribute],
        explicitBufferAttributes: activeDirectory ? ['objectGUID'] : [],
      });
      const [entry] = searchEntries;
      if (searchEntries.length !== 1 || searchReferences.length || !entry.dn) return undefined;
      const attributes = Object.fromEntries(
        Object.entries(entry).map(([key, value]) => [key.toLowerCase(), value] as const),
      );
      const accountName = attributes[usernameAttribute.toLowerCase()];
      if (typeof accountName !== 'string' || accountName.toLowerCase() !== username)
        return undefined;
      const department = await this.department(client, entry.dn);
      try {
        await client.bind(entry.dn, password);
        const identifier = directoryIdentifier(
          attributes[uuidAttribute.toLowerCase()],
          activeDirectory,
        );
        // 防止查询与用户绑定之间同名 DN 被删除重建。
        const confirmed = await client.search(entry.dn, {
          scope: 'base',
          filter: new EqualityFilter({ attribute: uuidAttribute, value: identifier.filterValue }),
          attributes: ['1.1'],
        });
        if (confirmed.searchEntries.length !== 1) return undefined;
        const commonName = Array.isArray(attributes.cn) ? attributes.cn[0] : attributes.cn;
        const name =
          activeDirectory &&
          typeof attributes.displayname === 'string' &&
          attributes.displayname.trim()
            ? attributes.displayname
            : commonName;
        return {
          entryUuid: identifier.entryUuid,
          displayName: (typeof name === 'string' && name.trim().slice(0, 80)) || username,
          ...(department ? { department } : {}),
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

  private async department(
    client: Client,
    userDn: string,
  ): Promise<DirectoryIdentity['department']> {
    const activeDirectory = this.options.directoryType === 'ad';
    const uuidAttribute = activeDirectory ? 'objectGUID' : 'entryUUID';
    const parts = distinguishedNameParts(userDn);
    const baseDepth = distinguishedNameParts(this.options.baseDn).length;
    for (let index = 1; parts.length - index >= baseDepth; index++) {
      const { searchEntries, searchReferences } = await client.search(
        parts.slice(index).join(','),
        {
          scope: 'base',
          timeLimit: 5,
          filter: new EqualityFilter({ attribute: 'objectClass', value: 'organizationalUnit' }),
          attributes: ['description', 'ou', uuidAttribute],
          explicitBufferAttributes: activeDirectory ? ['objectGUID'] : [],
        },
      );
      if (searchReferences.length) throw new Error('LDAP 部门查询返回转介');
      const entry = searchEntries[0];
      if (!entry) continue;
      const attributes = Object.fromEntries(
        Object.entries(entry).map(([key, value]) => [key.toLowerCase(), value] as const),
      );
      const displayName = directoryText(attributes.description) ?? directoryText(attributes.ou);
      if (!displayName) throw new Error('LDAP 部门缺少名称');
      return {
        entryUuid: directoryIdentifier(attributes[uuidAttribute.toLowerCase()], activeDirectory)
          .entryUuid,
        displayName: displayName.slice(0, 80),
      };
    }
    return undefined;
  }
}

function directoryIdentifier(
  value: unknown,
  activeDirectory: boolean,
): { entryUuid: string; filterValue: Buffer | string } {
  if (activeDirectory) {
    if (!Buffer.isBuffer(value) || value.length !== 16)
      throw new Error('AD 条目缺少有效的 objectGUID');
    // AD GUID 的前三段按小端存储，其余字节保持原序。
    return {
      entryUuid: [
        value.readUInt32LE(0).toString(16).padStart(8, '0'),
        value.readUInt16LE(4).toString(16).padStart(4, '0'),
        value.readUInt16LE(6).toString(16).padStart(4, '0'),
        value.toString('hex', 8, 10),
        value.toString('hex', 10, 16),
      ].join('-'),
      filterValue: value,
    };
  }
  if (typeof value !== 'string' || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(value))
    throw new Error('LDAP 条目缺少 entryUUID');
  return { entryUuid: value.toLowerCase(), filterValue: value };
}

function distinguishedNameParts(dn: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index < dn.length; index++) {
    if (dn[index] === '\\') index++;
    else if (dn[index] === ',') {
      parts.push(dn.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(dn.slice(start));
  return parts;
}

function directoryText(value: unknown): string | undefined {
  if (Array.isArray(value))
    return value.find((item): item is string => typeof item === 'string' && !!item.trim())?.trim();
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
