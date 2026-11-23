import { getColumns, SelectPrompt, wrapTextWithPrefix } from '@clack/core';
import {
  confirm,
  intro,
  isCancel,
  limitOptions,
  log,
  multiline,
  note,
  outro,
  S_BAR,
  S_BAR_END,
  symbol,
  text,
  unicode,
} from '@clack/prompts';
import { clearLine, cursorTo, emitKeypressEvents, type Key } from 'node:readline';
import { styleText } from 'node:util';
import packageJson from '../package.json' with { type: 'json' };
import { terminalText } from './api-client.js';

/** 人工取消与执行失败分开退出，主入口将取消映射为 130。 */
export class CliCancelled extends Error {
  constructor() {
    super('操作已取消。');
  }
}

export function isCliCi() {
  return Boolean(process.env.CI && !/^(false|0)$/i.test(process.env.CI));
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
      !isCliCi() &&
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

  async textarea(message: string, validate: (value: string) => string | undefined) {
    const answer = await multiline({
      message,
      showSubmit: true,
      validate: (value) => validate(value ?? ''),
      input: process.stdin,
      output: process.stderr,
    });
    if (isCancel(answer)) throw new CliCancelled();
    return answer;
  }

  async confirm(message: string) {
    const answer = await confirm({
      message: terminalText(message),
      active: '是',
      inactive: '否',
      initialValue: false,
      input: process.stdin,
      output: process.stderr,
    });
    if (isCancel(answer)) throw new CliCancelled();
    return answer;
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

  resource(name: string, kind: string, version: string, description: string, command: string) {
    name = terminalText(name);
    kind = terminalText(kind);
    version = terminalText(version);
    description = terminalText(description);
    command = terminalText(command);
    process.stdout.write(
      this.interactive
        ? `\n  ${styleText(['bold', 'cyan'], name)}  ${styleText('dim', `${kind} · ${version}`)}\n  ${description}\n  ${command}\n`
        : `${name}\t${kind}\t${version}\n  ${description}\n  ${command}\n`,
    );
  }

  async task<T>(
    message: string,
    complete: string,
    work: (update: (message: string) => void, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const progress = this.animated
      ? taskProgress(message, () => controller.abort(new CliCancelled()))
      : undefined;
    if (!progress && this.interactive) log.step(message, { output: process.stderr });
    try {
      const result = await work((message) => {
        if (progress) progress.update(terminalText(message));
        else this.message(terminalText(message));
      }, controller.signal);
      controller.signal.throwIfAborted();
      progress?.clear();
      if (this.interactive)
        log.success(styleText('dim', complete, { stream: process.stderr }), {
          output: process.stderr,
        });
      return result;
    } catch (error) {
      progress?.clear();
      controller.signal.throwIfAborted();
      if (this.interactive) log.error('未完成：' + message, { output: process.stderr });
      throw error;
    } finally {
      progress?.close();
    }
  }
}

// Clack 的 spinner 会在取消按键上直接退出，无法等待操作回滚或释放授权。
function taskProgress(message: string, cancel: () => void) {
  const input = process.stdin;
  const output = process.stderr;
  const raw = input.isRaw;
  const flowing = input.readableFlowing;
  const frames = unicode ? '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' : '-\\|/';
  let index = 0;
  const draw = () => {
    cursorTo(output, 0);
    clearLine(output, 0);
    const line = wrapTextWithPrefix(output, message, '  ').split('\n', 1)[0];
    const frame = styleText('cyan', frames[index++ % frames.length], { stream: output });
    output.write(frame + line.slice(1));
  };
  const keypress = (_input: string, key: Key) => {
    if ((key.ctrl && key.name === 'c') || key.name === 'escape') cancel();
  };
  emitKeypressEvents(input);
  input.on('keypress', keypress);
  input.setRawMode(true);
  input.resume();
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  draw();
  const timer = setInterval(draw, 80);
  return {
    update(value: string) {
      message = value;
    },
    clear() {
      clearInterval(timer);
      cursorTo(output, 0);
      clearLine(output, 0);
    },
    close() {
      process.off('SIGTERM', cancel);
      process.off('SIGINT', cancel);
      input.off('keypress', keypress);
      input.setRawMode(raw);
      if (!flowing) input.pause();
    },
  };
}

/** 人读表格写到 stdout：末列不补齐，说明逐行缩进写在所属行之后。 */
export function printTable(header: string[], rows: { cells: string[]; notes?: string[] }[]) {
  const widths = header.map((label, column) =>
    rows.reduce((width, row) => Math.max(width, row.cells[column].length), label.length),
  );
  const line = (cells: string[]) =>
    cells.map((cell, i) => (i === cells.length - 1 ? cell : cell.padEnd(widths[i]))).join('  ');
  process.stdout.write(line(header) + '\n');
  for (const row of rows) {
    process.stdout.write(terminalText(line(row.cells)) + '\n');
    for (const note of row.notes ?? []) process.stdout.write(`  ${terminalText(note)}\n`);
  }
}
