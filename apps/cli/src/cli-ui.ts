import { intro, isCancel, log, select, spinner, text, unicode } from '@clack/prompts';
import type { Key } from 'node:readline';
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
  readonly animated: boolean;

  constructor(enabled = false, animation = true) {
    this.interactive =
      enabled &&
      !!process.stdin.isTTY &&
      !!process.stdout.isTTY &&
      !!process.stderr.isTTY &&
      (!process.env.CI || /^(false|0)$/i.test(process.env.CI)) &&
      process.env.TERM !== 'dumb';
    this.animated = this.interactive && animation;
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

  async task<T>(
    message: string,
    complete: string,
    work: (update: (message: string) => void) => Promise<T>,
  ): Promise<T> {
    const progress = this.animated
      ? spinner({
          output: process.stderr,
          indicator: 'timer',
          frames: unicode
            ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
            : ['-', '\\', '|', '/'],
          onCancel: () => process.exit(130),
          cancelMessage: '操作已取消',
        })
      : undefined;
    const cancelOnKeypress = (_input: string, key: Key) => {
      if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
        progress?.cancel('操作已取消');
        process.exit(130);
      }
    };
    if (progress) {
      // Clack 将取消按键按成功退出处理，需优先恢复终端并退出 130。
      process.stdin.prependListener('keypress', cancelOnKeypress);
      progress.start(message);
    } else if (this.interactive) log.step(message, { output: process.stderr });
    try {
      const result = await work((message) => {
        if (progress) progress.message(terminalText(message));
        else this.message(terminalText(message));
      });
      if (progress) progress.stop(complete);
      else if (this.interactive) log.success(complete, { output: process.stderr });
      return result;
    } catch (error) {
      if (progress) progress.error('未完成：' + message);
      else if (this.interactive) log.error('未完成：' + message, { output: process.stderr });
      throw error;
    } finally {
      process.stdin.off('keypress', cancelOnKeypress);
    }
  }
}
