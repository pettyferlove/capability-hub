/** 嵌套事务共用失败状态，捕获异常也不能部分提交。 */
export class TransactionScope {
  active = true;
  private failed = false;
  private failure: unknown;
  private pending = 0;
  assertActive(): void {
    if (!this.active) throw new Error('Transaction already completed');
  }
  fail(error: unknown): void {
    if (!this.failed) {
      this.failed = true;
      this.failure = error;
    }
  }
  async run<T>(work: () => T | Promise<T>): Promise<T> {
    this.assertActive();
    this.pending++;
    try {
      return await work();
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.pending--;
    }
  }
  finish(): void {
    this.active = false;
    if (this.pending) this.fail(new Error('Transaction has unfinished operations'));
  }
  assertSuccessful(): void {
    if (this.failed) throw this.failure;
  }
}
