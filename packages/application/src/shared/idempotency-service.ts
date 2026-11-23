import type { Principal } from '@capability-hub/domain/identity';
import { canonical } from '@capability-hub/domain/canonical';
import { fail } from '@capability-hub/domain/errors';
import { randomUUID } from 'node:crypto';
import type { RecordStore } from '../ports/index.js';
import type { IdentityService } from '../identity/identity-service.js';

/** 在同一事务中核对当前身份、幂等记录和业务写入；Git 拉取与扫描留在事务外。 */
export class IdempotencyService {
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
  ) {}
  private async assertPrincipal(p: Principal) {
    const current = await this.identity.principal(p.id);
    const snapshot = (value: Principal) =>
      canonical({
        revision: value.revision,
        groups: [...value.groups].sort(),
        bindings: [...value.bindings].sort((a, b) => canonical(a).localeCompare(canonical(b))),
        permissions: value.permissions,
      });
    if (snapshot(p) !== snapshot(current))
      fail(409, 'AUTH_CONTEXT_CHANGED', '身份或授权已变化，请刷新后重试');
    return current;
  }
  /** 与业务准入共用调用方事务；命中即使为 null 也不表示可以重新执行。 */
  async lookup<T>(principal: Principal, route: string, key: string | undefined, hash: string) {
    if (!key || key.length > 200) fail(400, 'IDEMPOTENCY_REQUIRED', '需要有效 Idempotency-Key');
    await this.assertPrincipal(principal);
    const existing = (await this.store.where('idempotency', 'key', key)).find(
      (r) => r.principal_id === principal.id && r.route === route,
    );
    if (existing && existing.expires_at > Date.now()) {
      if (existing.request_hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于不同请求');
      return { hit: true as const, response: existing.response as T };
    }
    return { hit: false as const, key, expired: existing?.id };
  }
  async execute<T>(
    principal: Principal,
    route: string,
    key: string | undefined,
    hash: string,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    return await this.store.tx(async () => {
      const record = await this.lookup<T>(principal, route, key, hash);
      if (record.hit) return record.response;
      if (record.expired) await this.store.remove('idempotency', record.expired);
      const response = await fn();
      await this.store.insert('idempotency', {
        id: randomUUID(),
        principal_id: principal.id,
        route,
        key: record.key,
        request_hash: hash,
        response,
        expires_at: Date.now() + 86400000,
      });
      return response;
    });
  }
}
