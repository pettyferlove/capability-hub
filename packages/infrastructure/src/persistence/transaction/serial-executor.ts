/** 按提交顺序执行任务；单个任务失败不会中断后续队列。 */
export class SerialExecutor {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(work: () => T | Promise<T>): Promise<T> {
    const pending = this.tail.then(work);
    this.tail = pending.catch(() => {});
    return pending;
  }
  async idle(): Promise<void> {
    await this.tail;
  }
}
