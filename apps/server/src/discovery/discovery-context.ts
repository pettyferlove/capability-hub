import { createHmac, timingSafeEqual } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { discoveryContextMaxBytes, discoveryCriteriaSchema } from '@capability-hub/contracts';
import { canonical } from '@capability-hub/domain/canonical';
import { fail } from '@capability-hub/domain/errors';
import type { Principal } from '@capability-hub/domain/identity';
import { z } from 'zod';

const id = z.string().min(1).max(64);
const versionSchema = z.strictObject({ asset_id: id, version_id: id });

const contextSchema = z.strictObject({
  goal: z.string().max(200).nullable(),
  pending_dimension: z.string().max(28).nullable(),
  /** 整段状态继承历轮来源：当时送出的发布 UUID → 同版当时最近的发布 UUID。 */
  releases: z.record(z.uuid(), z.uuid()),
  suggestions: z.array(z.uuid()),
  criteria: discoveryCriteriaSchema,
  unsure: z.number().int().min(0).max(20),
  shown: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('none') }),
    z.strictObject({
      kind: z.literal('results'),
      items: z.array(versionSchema).max(8),
    }),
    z.strictObject({
      kind: z.literal('directions'),
      items: z
        .array(
          z.strictObject({
            label: z.string().max(28),
            patch: z.strictObject({
              requirements: z.array(z.string().max(64)).max(5).optional(),
              scenario_id: id.optional(),
            }),
            basis: versionSchema,
            /** 模型为该方向挑出的固定版本与判断；选中方向时直接列出，不再请求模型。 */
            picks: z
              .array(
                z.strictObject({
                  asset_id: id,
                  version_id: id,
                  fit: z.enum(['direct', 'partial']),
                  reason: z.string().max(120),
                  quote: z.string().max(120).nullable(),
                }),
              )
              .max(3)
              .optional(),
          }),
        )
        .max(3),
    }),
  ]),
});

/** 上一轮的目标、条件和实际展示顺序；页面只在内存中原样回传签名后的值。 */
export type DiscoveryContext = z.infer<typeof contextSchema>;

/**
 * 发现上下文签名与访客标记。两把子密钥由实例密钥按用途派生：上下文签名绑定模式与访客标记，
 * 标记只用于察觉身份变化，不是凭据，也不含会话令牌。
 */
export class DiscoverySigner {
  private readonly contextKey: Buffer;
  private readonly viewerKey: Buffer;
  constructor(secret: string) {
    this.contextKey = createHmac('sha256', secret).update('discovery-context/v2').digest();
    this.viewerKey = createHmac('sha256', secret).update('discovery-viewer/v1').digest();
  }

  /** 匿名固定为 `anonymous`；登录态覆盖会话、账号及决定目录可见性的授权快照。 */
  viewer(principal: Principal | null, sessionId: string | undefined) {
    if (!principal || !sessionId) return 'anonymous';
    return createHmac('sha256', this.viewerKey)
      .update(
        canonical({
          session: sessionId,
          user: principal.id,
          active: principal.active,
          groups: [...principal.groups].sort(),
          bindings: principal.bindings
            .map((binding) => `${binding.role_id}:${binding.scope_type}:${binding.scope_id}`)
            .sort(),
        }),
      )
      .digest('base64url');
  }

  sign(context: DiscoveryContext, mode: string, viewer: string) {
    const data = Buffer.from(JSON.stringify(contextSchema.parse(context)));
    const body = deflateRawSync(data).toString('base64url');
    const token = `v2.${body}.${this.mac(body, mode, viewer)}`;
    if (data.length > discoveryContextMaxBytes * 8 || token.length > discoveryContextMaxBytes)
      fail(422, 'DISCOVERY_INPUT_TOO_LARGE', '对话上下文超过上限，请重新开始提问');
    return token;
  }

  /** 签名、模式或访客任一不符即拒绝；不接受客户端改写的上下文。 */
  verify(token: string, mode: string, viewer: string): DiscoveryContext {
    const [version, body, mac, extra] = token.split('.');
    const expected = body ? Buffer.from(this.mac(body, mode, viewer)) : Buffer.alloc(0);
    const actual = Buffer.from(mac ?? '');
    if (
      version !== 'v2' ||
      extra !== undefined ||
      !body ||
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    )
      fail(400, 'DISCOVERY_CONTEXT_INVALID', '对话上下文无效，请重新开始提问');
    const data = inflateRawSync(Buffer.from(body, 'base64url'), {
      maxOutputLength: discoveryContextMaxBytes * 8,
    });
    return contextSchema.parse(JSON.parse(data.toString('utf8')));
  }

  private mac(body: string, mode: string, viewer: string) {
    return createHmac('sha256', this.contextKey)
      .update(`${mode}\n${viewer}\n${body}`)
      .digest('base64url');
  }
}
