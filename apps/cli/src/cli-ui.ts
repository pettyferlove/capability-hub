import { getColumns, SelectPrompt, wrapTextWithPrefix } from '@clack/core';
import {
  intro,
  isCancel,
  limitOptions,
  log,
  note,
  outro,
  S_BAR,
  S_BAR_END,
  spinner,
  symbol,
  text,
  unicode,
} from '@clack/prompts';
import type { Key } from 'node:readline';
import { styleText } from 'node:util';
import packageJson from '../package.json' with { type: 'json' };
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

  intro(title?: string) {
    if (!this.interactive) return;
    const style = { stream: process.stderr };
    if (title === undefined) {
      const mark = unicode ? ['◇───◇', '│   │', '◇───◆'] : ['o---o', '|   |', 'o---*'];
      process.stderr.write(
        '\n' +
          [
            `  ${styleText('cyan', mark[0], style)}  ${styleText('bold', 'Capability Hub', style)}`,
            `  ${styleText('cyan', mark[1], style)}  ${styleText('dim', 'Agent Skills · MCP', style)}`,
            `  ${styleText('cyan', mark[2], style)}  ${styleText('dim', `v${packageJson.version}`, style)}`,
          ].join('\n') +
          '\n\n',
      );
    } else process.stderr.write('\n');
    intro(styleText('cyan', terminalText(title ?? '连接 · 发现 · 安装'), style), {
      output: process.stderr,
    });
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
    options: {
      value: string;
      label: string;
      hint?: string;
      disabled?: boolean;
      gapAfter?: boolean;
    }[],
  ): Promise<string> {
    const available = options.filter((option) => !option.disabled);
    if (!available.length) throw new Error(`${argument} 没有可用选项`);
    if (!this.interactive)
      throw new Error(
        `请通过 ${argument} 明确选择：${available.map((option) => terminalText(option.value)).join(', ')}`,
      );
    const output = process.stderr;
    const style = { stream: output };
    const grouped = options.some((option) => option.disabled);
    const labelWidth = grouped ? Math.max(...available.map((option) => option.label.length)) : 0;
    const answer = await new SelectPrompt({
      initialValue: available[0].value,
      options: options.map((option) => ({
        ...option,
        label: terminalText(option.label),
        hint: option.hint === undefined ? undefined : terminalText(option.hint),
      })),
      input: process.stdin,
      output,
      render() {
        const guide = styleText('dim', S_BAR, style);
        const heading =
          guide +
          '\n' +
          wrapTextWithPrefix(
            output,
            styleText('bold', terminalText(message), style),
            `${S_BAR}  `,
            `${symbol(this.state)}  `,
          );
        if (this.state === 'submit' || this.state === 'cancel') {
          const selected = this.options[this.cursor].label;
          return `${heading}\n${wrapTextWithPrefix(
            output,
            styleText(this.state === 'cancel' ? ['dim', 'strikethrough'] : 'dim', selected, style),
            `${S_BAR}  `,
          )}`;
        }
        const stacked = getColumns(output) < 60;
        const footer =
          guide +
          '\n' +
          wrapTextWithPrefix(
            output,
            styleText('dim', `${unicode ? '↑/↓' : 'Up/Down'} 选择 · Enter 确认 · Esc 取消`, style),
            `${S_BAR}  `,
          ) +
          `\n${styleText('dim', S_BAR_END, style)}`;
        const rows = limitOptions({
          output,
          options: this.options,
          cursor: this.cursor,
          rowPadding: heading.split('\n').length + footer.split('\n').length + 1,
          style: (option, active) => {
            const marker = active ? styleText('cyan', unicode ? '›' : '>', style) : ' ';
            const name = option.label.padEnd(stacked ? 0 : labelWidth);
            const label = option.disabled
              ? styleText('dim', `${unicode ? '─' : '-'} ${option.label}`, style)
              : active
                ? styleText(['bold', 'cyan'], name, style)
                : name;
            const hint = option.hint
              ? `${stacked ? '\n' : '  '}${styleText('dim', option.hint, style)}`
              : '';
            return (
              wrapTextWithPrefix(output, label + hint, `${S_BAR}    `, `${S_BAR}  ${marker} `)
                .split('\n')
                .map((line) => guide + line.slice(1))
                .join('\n') +
              (option.gapAfter && option !== this.options.at(-1) ? `\n${guide}` : '')
            );
          },
        });
        return `${heading}\n${rows.join('\n')}\n${footer}\n`;
      },
    }).prompt();
    if (isCancel(answer) || answer === undefined) throw new CliCancelled();
    return answer;
  }

  message(message: string) {
    if (this.interactive) log.info(message, { output: process.stderr });
    else process.stderr.write(message + '\n');
  }

  step(title: string, message: string) {
    title = terminalText(title);
    message = message.split('\n').map(terminalText).join('\n');
    if (this.interactive)
      log.step(`${styleText('dim', title, { stream: process.stderr })}\n${message}`, {
        output: process.stderr,
      });
    else process.stderr.write(`${title}\n${message}\n`);
  }

  note(title: string, message: string) {
    title = terminalText(title);
    message = message.split('\n').map(terminalText).join('\n');
    if (this.interactive)
      note(message, styleText(['bold', 'cyan'], title, { stream: process.stderr }), {
        output: process.stderr,
        format: (line) => line,
      });
    else process.stderr.write(`${title}\n${message}\n`);
  }

  link(url: string) {
    url = terminalText(url);
    if (this.interactive)
      log.message(styleText(['cyan', 'underline'], url, { stream: process.stderr }), {
        output: process.stderr,
        spacing: 0,
      });
    else process.stderr.write(url + '\n');
  }

  outro(message: string) {
    message = terminalText(message);
    if (this.interactive)
      outro(styleText('bold', message, { stream: process.stderr }), { output: process.stderr });
    else process.stderr.write(message + '\n');
  }

  resource(name: string, kind: string, version: string, description: string) {
    name = terminalText(name);
    kind = terminalText(kind);
    version = terminalText(version);
    description = terminalText(description);
    process.stdout.write(
      this.interactive
        ? `\n  ${styleText(['bold', 'cyan'], name)}  ${styleText('dim', `${kind} · ${version}`)}\n  ${description}\n`
        : `${name}\t${kind}\t${version}\n  ${description}\n`,
    );
  }

  async task<T>(
    message: string,
    complete: string,
    work: (update: (message: string) => void) => Promise<T>,
  ): Promise<T> {
    const progress = this.animated
      ? spinner({
          output: process.stderr,
          indicator: 'dots',
          styleFrame: (frame) => styleText('cyan', frame, { stream: process.stderr }),
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
      const completed = styleText('dim', complete, { stream: process.stderr });
      if (progress) progress.stop(completed);
      else if (this.interactive) log.success(completed, { output: process.stderr });
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
