import { intro, isCancel, log, select, spinner, text } from '@clack/prompts';
import { terminalText } from './api-client.js';

/** 人工取消与执行失败分开退出，主入口将取消映射为 130。 */
export class CliCancelled extends Error {
  constructor() {
    super('操作已取消。');
  }
}

/** 提示只用于人工终端；stdout 始终留给命令结果或 MCP 协议。 */
export class CliUi {
  readonly interactive: boolean;

  constructor(enabled = false) {
    this.interactive =
      enabled &&
      !!process.stdin.isTTY &&
      !!process.stdout.isTTY &&
      !!process.stderr.isTTY &&
      (!process.env.CI || /^(false|0)$/i.test(process.env.CI)) &&
      process.env.TERM !== 'dumb';
  }

  intro(title: string) {
    if (this.interactive) intro(title, { output: process.stderr });
  }

  async input(
    value: string | undefined,
    argument: string,
    message: string,
    validate: (value: string) => string | undefined = (input) =>
      input.trim() ? undefined : '请输入非空内容',
  ): Promise<string> {
    if (value === undefined) {
      if (!this.interactive) throw new Error(`缺少 ${argument}，请显式提供或在交互终端运行。`);
      const answer = await text({
        message,
        validate: (input) => validate(input ?? ''),
        input: process.stdin,
        output: process.stderr,
      });
      if (isCancel(answer)) throw new CliCancelled();
      value = answer;
    }
    const error = validate(value);
    if (error) throw new Error(`${argument}：${error}`);
    return value;
  }

  async choose(
    argument: string,
    message: string,
    options: { value: string; label: string; hint?: string }[],
  ): Promise<string> {
    if (!options.length) throw new Error(`${argument} 没有可用选项`);
    if (!this.interactive)
      throw new Error(
        `请通过 ${argument} 明确选择：${options.map((option) => terminalText(option.value)).join(', ')}`,
      );
    const answer = await select({
      message,
      options: options.map((option) => ({
        ...option,
        label: terminalText(option.label),
        hint: option.hint === undefined ? undefined : terminalText(option.hint),
      })),
      input: process.stdin,
      output: process.stderr,
    });
    if (isCancel(answer)) throw new CliCancelled();
    return answer;
  }

  message(message: string) {
    if (this.interactive) log.info(message, { output: process.stderr });
    else process.stderr.write(message + '\n');
  }

  async task<T>(message: string, complete: string, work: () => Promise<T>): Promise<T> {
    if (!this.interactive) return work();
    const progress = spinner({
      output: process.stderr,
      // Clack 清理显示后恢复 SIGINT 的退出语义，避免取消动画后任务仍在后台继续。
      onCancel: () => process.kill(process.pid, 'SIGINT'),
      cancelMessage: '操作已取消',
    });
    progress.start(message);
    try {
      const result = await work();
      progress.stop(complete);
      return result;
    } catch (error) {
      progress.error('未完成：' + message);
      throw error;
    }
  }
}
