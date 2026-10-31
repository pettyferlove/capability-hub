import type { Principal } from '@capability-hub/domain/identity';
import type { RecordStore } from '../ports/index.js';
import { sha256 } from '@capability-hub/domain/canonical';
import { fail, notFound } from '@capability-hub/domain/errors';
import { tokenRecordSchema } from '@capability-hub/domain/token';
import { randomBytes } from 'node:crypto';
import type { IssueTokenCommand } from './commands.js';
import type { IdentityService } from './identity-service.js';

export class TokenService {
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
  ) {}

  async find(token: string) {
    return await this.store.get('tokens', sha256(token));
  }

  async issue(principal: Principal, input: IssueTokenCommand) {
    const value = { ...input, scope: input.scope ?? ('hub:read' as const) };
    const token = randomBytes(32).toString('base64url');
    await this.store.tx(async () => {
      await this.identity.activeUser(principal.id);
      await this.store.insert('tokens', {
        id: sha256(token),
        user_id: principal.id,
        ...value,
        created_at: Date.now(),
        revoked_at: null,
      });
      await this.store.audit(principal.id, 'identity.token_created', sha256(token));
    });
    return { token };
  }

  async list(userId: string) {
    return (await this.store.where('tokens', 'user_id', userId)).map((record) => {
      const parsed = tokenRecordSchema.safeParse(record);
      if (!parsed.success) fail(409, 'TOKEN_RECORD_INVALID', '访问令牌记录无效，请联系管理员处理');
      const { id, name, scope, created_at, revoked_at } = parsed.data;
      return { id, name, scope, created_at, revoked_at };
    });
  }

  async revoke(userId: string, id: string): Promise<void> {
    await this.store.tx(async () => {
      await this.identity.activeUser(userId);
      const record = await this.store.get('tokens', id);
      if (!record || record.user_id !== userId) notFound();
      const parsed = tokenRecordSchema.safeParse(record);
      if (!parsed.success) fail(409, 'TOKEN_RECORD_INVALID', '访问令牌记录无效，请联系管理员处理');
      await this.store.put('tokens', { ...parsed.data, revoked_at: Date.now() });
      await this.store.audit(userId, 'identity.token_revoked', id);
    });
  }
}
