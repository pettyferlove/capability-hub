import { HubError } from '@capability-hub/domain/errors';

/**
 * 首页对话在实际出站前预占名额：每个主体或匿名地址每分钟 8 次、本进程每分钟 30 次、
 * 同时最多 3 个在途请求。发出即计数，超时、无效输出或取消都不退回次数；
 * `release` 只在传输结束时归还并发名额。多实例部署由入口限流兜底，这里不跨进程协调。
 */
export class DiscoveryLimiter {
  private window = { start: 0, total: 0, keys: new Map<string, number>() };
  private active = 0;
  constructor(
    private readonly limits = { perKey: 8, total: 30, concurrent: 3 },
    private readonly now = Date.now,
  ) {}

  acquire(key: string): () => void {
    const now = this.now();
    if (now - this.window.start >= 60000)
      this.window = { start: now, total: 0, keys: new Map<string, number>() };
    const used = this.window.keys.get(key) ?? 0;
    if (
      this.active >= this.limits.concurrent ||
      this.window.total >= this.limits.total ||
      used >= this.limits.perKey
    )
      throw new HubError(
        429,
        'DISCOVERY_BUSY',
        '提问太频繁或同时进行的对话过多，请稍后再试',
        {},
        true,
      );
    this.window.total++;
    this.window.keys.set(key, used + 1);
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
    };
  }
}
