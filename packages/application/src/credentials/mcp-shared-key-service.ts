import type { InstallationOption, InputVariable } from '@capability-hub/domain/content';
import type {
  AssetRecord,
  IntakeRecord,
  McpSharedKeyRecord,
  McpSharedKeyTarget,
  VersionRecord,
} from '@capability-hub/domain/models';
import type { Principal } from '@capability-hub/domain/identity';
import { canonical, digest } from '@capability-hub/domain/canonical';
import { fail } from '@capability-hub/domain/errors';
import type { AssetAccessService } from '../catalog/asset-access-service.js';
import type { CredentialCipher } from '../ports/index.js';
import type { ApplicationContext } from '../shared/application-context.js';
import type { IdempotencyService } from '../shared/idempotency-service.js';
import { matchRevision } from '../shared/revision.js';

type Target = McpSharedKeyTarget;

function targetId({ url, name, scheme }: Target) {
  return JSON.stringify([url, name.toLowerCase(), scheme ?? null]);
}

function sameTarget(a: Target, b: Target) {
  return a.url === b.url && a.name.toLowerCase() === b.name.toLowerCase() && a.scheme === b.scheme;
}

/** 只接受原值请求头或 Authorization 的单变量 Bearer 模板。 */
export function sharedMcpHeaderTarget(url: string, header: InputVariable): Target | undefined {
  const variables = Object.keys(header.variables ?? {});
  if (!header.isSecret || variables.length > 1) return undefined;
  const target = { url, name: header.name };
  if (!header.value) return target;
  const variable = variables[0];
  if (variable === undefined) return undefined;
  const ref = '{' + variable + '}';
  if (header.value === ref) return target;
  if (
    header.name.toLowerCase() === 'authorization' &&
    header.value === 'Bearer ' + ref &&
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)
  )
    return { ...target, scheme: 'bearer' };
  return undefined;
}

function keyTargets(option: InstallationOption): Target[] {
  if (
    option.kind !== 'remote' ||
    !option.supported ||
    option.type !== 'streamable-http' ||
    !option.url ||
    /[{}]/.test(option.url) ||
    Object.keys(option.variables ?? {}).length
  )
    return [];
  const url = option.url;
  if (!URL.canParse(url)) return [];
  const address = new URL(url);
  if (
    !['http:', 'https:'].includes(address.protocol) ||
    address.username ||
    address.password ||
    address.hash
  )
    return [];
  const headers = option.headers ?? [];
  const counts = new Map<string, number>();
  for (const { name } of headers) {
    const lower = name.toLowerCase();
    counts.set(lower, (counts.get(lower) ?? 0) + 1);
  }
  return headers.flatMap((header) => {
    if (counts.get(header.name.toLowerCase()) !== 1) return [];
    const target = sharedMcpHeaderTarget(url, header);
    return target ? [target] : [];
  });
}

/** 只有同一资产、完整 URL 和同名的单值秘密请求头才能使用已保存的 Key。 */
export function sharedKeysForOption(asset: AssetRecord, option: InstallationOption) {
  if (!asset.mcp_shared_keys?.length) return [];
  const targets = new Set(keyTargets(option).map(targetId));
  return asset.mcp_shared_keys.filter((key) => targets.has(targetId(key)));
}

/** 密钥独立于发布内容，只有已授权的安装配置包含解密后的值。 */
export class McpSharedKeyService {
  constructor(
    private readonly context: ApplicationContext,
    private readonly access: AssetAccessService,
    private readonly idempotency: IdempotencyService,
    private readonly cipher: CredentialCipher,
  ) {}

  private open(asset: AssetRecord, key: McpSharedKeyRecord) {
    try {
      return this.cipher.open(
        {
          kind: 'mcp-header',
          asset_id: asset.id,
          url: key.url,
          name: key.name,
          scheme: key.scheme,
        },
        key.encrypted,
      ).secret;
    } catch {
      fail(500, 'CREDENTIAL_DECRYPTION', '无法解密 MCP 共享密钥，请检查实例密钥或重新录入');
    }
  }

  private seal(
    asset: AssetRecord,
    { url, name, scheme }: Target,
    value: string,
  ): McpSharedKeyRecord {
    return {
      url,
      name,
      ...(scheme ? { scheme } : {}),
      encrypted: this.cipher.seal(
        { kind: 'mcp-header', asset_id: asset.id, url, name, scheme },
        { secret: value, passphrase: '' },
      ),
    };
  }

  private async write(
    principal: Principal,
    asset: AssetRecord,
    target: Target,
    value: string | null,
  ) {
    const keys = (asset.mcp_shared_keys ?? []).filter((key) => !sameTarget(key, target));
    if (value !== null) keys.push(this.seal(asset, target, value));
    const revision = (asset.mcp_key_revision ?? 1) + 1;
    await this.context.store.put('assets', {
      ...asset,
      mcp_shared_keys: keys,
      mcp_key_revision: revision,
    });
    await this.context.store.audit(principal.id, 'asset.mcp_key_updated', asset.id);
    return { revision };
  }

  /** 录入时只密封候选值。轮换使用带修订号的独立维护表单。 */
  prepare(asset: AssetRecord, key: Target & { value: string }) {
    const previous = asset.mcp_shared_keys?.find((item) => sameTarget(item, key));
    if (previous && this.open(asset, previous) !== key.value)
      fail(409, 'MCP_KEY_CONFIGURED', '此请求头已有共享密钥，请在资产维护设置中轮换');
    return {
      ...(previous ?? this.seal(asset, key, key.value)),
      base_revision: asset.mcp_key_revision ?? 1,
    };
  }

  /** 发布事务清除候选密文，并保留审核期间维护者已轮换的有效绑定。 */
  async publish(
    principal: Principal,
    asset: AssetRecord,
    intake: IntakeRecord,
    version: VersionRecord,
  ): Promise<AssetRecord> {
    const { pending_mcp_key: pending, ...rest } = intake;
    if (!pending) return asset;
    const targets = (version.metadata.installation_options ?? []).flatMap(keyTargets);
    if (!targets.some((target) => sameTarget(target, pending)))
      fail(409, 'MCP_KEY_TARGET', '候选密钥与待发布版本的服务地址或请求头不匹配');
    await this.context.store.put('intakes', rest);
    const current = asset.mcp_shared_keys?.find((key) => sameTarget(key, pending));
    if (current) {
      if (this.open(asset, current) !== this.open(asset, pending))
        fail(409, 'MCP_KEY_CHANGED', '共享密钥已轮换，请使用当前密钥重新提交');
      return asset;
    }
    const { base_revision, ...key } = pending;
    if (base_revision !== (asset.mcp_key_revision ?? 1))
      fail(409, 'MCP_KEY_CHANGED', '共享密钥设置已变化，请重新录入候选密钥');
    await this.context.store.audit(principal.id, 'asset.mcp_key_updated', asset.id);
    return {
      ...asset,
      mcp_shared_keys: [...(asset.mcp_shared_keys ?? []), key],
      mcp_key_revision: base_revision + 1,
    };
  }

  private async targets(asset: AssetRecord) {
    const release = await this.context.store.get('releases', asset.current_release_id);
    const version = release && (await this.context.store.get('versions', release.version_id));
    const targets = new Map<string, Target & { configured: boolean }>();
    for (const target of (version?.metadata.installation_options ?? []).flatMap(keyTargets))
      targets.set(targetId(target), { ...target, configured: false });
    for (const { url, name, scheme } of asset.mcp_shared_keys ?? [])
      targets.set(targetId({ url, name, scheme }), {
        url,
        name,
        ...(scheme ? { scheme } : {}),
        configured: true,
      });
    return [...targets.values()];
  }

  private async managedAsset(principal: Principal, id: string) {
    const asset = await this.access.getAsset(id);
    this.access.requireMaintenance(principal, asset);
    if (asset.kind !== 'mcp') fail(422, 'NOT_MCP', '仅 MCP 资产支持共享请求头密钥');
    return asset;
  }

  async describe(principal: Principal, assetId: string) {
    const asset = await this.managedAsset(principal, assetId);
    return { revision: asset.mcp_key_revision ?? 1, targets: await this.targets(asset) };
  }

  async update(
    principal: Principal,
    assetId: string,
    input: Target & { value: string | null },
    etag: string | undefined,
    requestKey: string | undefined,
  ) {
    return this.idempotency.execute(
      principal,
      'mcp-keys/' + assetId,
      requestKey,
      digest(canonical({ input, etag: etag ?? null })),
      async () => {
        const asset = await this.managedAsset(principal, assetId);
        matchRevision({ revision: asset.mcp_key_revision ?? 1 }, etag);
        if (asset.lifecycle !== 'active')
          fail(409, 'ASSET_UNAVAILABLE', '当前资产不可维护共享密钥');
        const target = (await this.targets(asset)).find((item) => sameTarget(item, input));
        if (!target) fail(422, 'MCP_KEY_TARGET', '请选择已登记的服务地址和秘密请求头');
        return await this.write(principal, asset, target, input.value);
      },
    );
  }

  async installation(p: Principal | null, versionId: string, optionId: string) {
    return this.context.store.tx(async () => {
      const actor = p && (await this.context.identity.principal(p.id));
      const version = await this.access.requireReadableVersion(actor, versionId);
      const asset = await this.access.getAsset(version.asset_id);
      const option = version.metadata.installation_options?.find(
        (item) => item.option_id === optionId,
      );
      const keys = option ? sharedKeysForOption(asset, option) : [];
      if (keys.length && !actor)
        fail(401, 'MCP_KEY_LOGIN_REQUIRED', '请登录 Hub 后获取含共享密钥的安装配置');
      const sharedHeaders = new Map(
        keys.map((key) => {
          const secret = this.open(asset, key);
          return [
            key.name.toLowerCase(),
            key.scheme === 'bearer' ? 'Bearer ' + secret : secret,
          ] as const;
        }),
      );
      return { version, asset, option, sharedHeaders };
    });
  }
}
