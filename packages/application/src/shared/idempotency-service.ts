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
  async execute<T>(
    principal: Principal,
    route: string,
    key: string | undefined,
    hash: string,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    if (!key || key.length > 200) fail(400, 'IDEMPOTENCY_REQUIRED', '需要有效 Idempotency-Key');
    return await this.store.tx(async () => {
      await this.assertPrincipal(principal);
      const existing = (await this.store.all('idempotency')).find(
        (r) => r.principal_id === principal.id && r.route === route && r.key === key,
      );
      if (existing && existing.expires_at > Date.now()) {
        if (existing.request_hash !== hash)
          fail(409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于不同请求');
        // 操作名与请求摘要共同约束幂等响应的复用。
        return existing.response as T;
      }
      if (existing) await this.store.remove('idempotency', existing.id);
      const response = await fn();
      await this.store.insert('idempotency', {
        id: randomUUID(),
        principal_id: principal.id,
        route,
        key,
        request_hash: hash,
        response,
        expires_at: Date.now() + 86400000,
      });
      return response;
    });
  }
}
