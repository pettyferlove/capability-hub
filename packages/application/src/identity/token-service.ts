import type { Principal } from '@capability-hub/domain/identity';
import type { RecordStore } from '../ports/index.js';
import { sha256 } from '@capability-hub/domain/canonical';
import { fail, notFound } from '@capability-hub/domain/errors';
import { tokenRecordSchema } from '@capability-hub/domain/token';
import { randomBytes } from 'node:crypto';
import type { IssueTokenCommand } from './commands.js';
import type { IdentityService } from './identity-service.js';

/** 个人访问令牌的签发、列举与吊销；明文只在签发响应出现一次，鉴权靠摘要查表。 */
export class TokenService {
  constructor(
    private readonly store: RecordStore,
    private readonly identity: IdentityService,
  ) {}

  /**
   * 按原始令牌取记录（内部按 `sha256` 查表）；不做吊销与 schema 判断，
   * 是否可用由调用方结合 `revoked_at` 与 {@link tokenRecordSchema} 决定。
   */
  async find(token: string) {
    return await this.store.get('tokens', sha256(token));
  }

  /**
   * 签发个人访问令牌：32 字节随机明文只在此返回，库中仅存 `sha256` 摘要。
   * `scope` 缺省 `hub:read`（只读）；`hub:contribute` 才允许经 MCP 提交内容，
   * 权限细节仍由 {@link Principal} 的角色决定，scope 只是额外收窄。
   * 事务内要求账号启用（401/`UNAUTHENTICATED`），写审计 `identity.token_created`。
   * @param input - 名称与 scope 由调用方校验，本方法不再做范围检查
   */
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

  /**
   * 列出该用户的令牌元数据（名称、scope、签发与吊销时间），从不回显摘要 ID 以外的凭据。
   * 任一条记录不符合 {@link tokenRecordSchema} 抛 409/`TOKEN_RECORD_INVALID`，
   * 表示存储损坏，需人工处理而非自动修复。
   */
  async list(userId: string) {
    return (await this.store.where('tokens', 'user_id', userId)).map((record) => {
      const parsed = tokenRecordSchema.safeParse(record);
      if (!parsed.success) fail(409, 'TOKEN_RECORD_INVALID', '访问令牌记录无效，请联系管理员处理');
      const { id, name, scope, created_at, revoked_at } = parsed.data;
      return { id, name, scope, created_at, revoked_at };
    });
  }

  /**
   * 吊销令牌：置 `revoked_at` 后永久失效且不可复原，重新签发是唯一恢复路径。
   * 令牌不存在或不属于该用户抛 404；记录损坏抛 409/`TOKEN_RECORD_INVALID`；
   * 用户已失效抛 401/`UNAUTHENTICATED`。写审计 `identity.token_revoked`。
   */
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
