import { Command, CommanderError, Option } from 'commander';
import { agentClientIds } from '@capability-hub/contracts';
import packageJson from '../package.json' with { type: 'json' };
import { terminalText } from './api-client.js';
import { runCommand, type CliOptions } from './cli-commands.js';
import { CliUi } from './cli-ui.js';
import { withCliUpdateNotice } from './update-notice.js';

/** 命令定义与帮助共用一份参数声明；退出由 main 处理，便于嵌入与测试。 */
export async function runCli(arguments_: readonly string[] = process.argv.slice(2)) {
  let exitCode: number | undefined;
  const program = new Command()
    .name('capability-hub')
    .description('Capability Hub · 连接 Agent、发现资源与安装 Skill')
    .version(packageJson.version, '-V, --cli-version', '查看 CLI 版本')
    .helpOption('-h, --help', '查看帮助')
    .helpCommand('help [command]', '查看指定命令的参数和示例')
    .configureHelp({ showGlobalOptions: true })
    .configureOutput({
      outputError: (message, write) => write(terminalText(message).trimEnd() + '\n'),
    })
    .showHelpAfterError('运行 capability-hub help <命令> 查看参数和示例。')
    .exitOverride()
    .option('--url <URL>', 'Hub 的 HTTP(S) 根地址')
    .option('--config-dir <PATH>', '独立凭据目录（默认 ~/.config/capability-hub）')
    .option('--no-interactive', '禁用输入向导和进度动画，适用于脚本')
    .option('--no-animation', '关闭进度动画，保留输入向导和静态状态')
    .addHelpText(
      'after',
      `
快速开始：
  capability-hub connect --url https://hub.example.com --client codex
  capability-hub login --url https://hub.example.com
  capability-hub search "code review"

连接 Agent 用 connect；登录 CLI 后可 search、add 和 mcp-config。
公开 Skill 的 add 无需登录，但须提供 --url。
交互终端省略命令可打开菜单；使用 help <命令> 查看详细示例。
读取命令也可使用 CAPABILITY_HUB_TOKEN，但必须显式提供 --url。
--version 指资源版本；查看 CLI 版本请用 -V / --cli-version。
`,
    );

  function command(name: string, description: string, examples: string) {
    return program.command(name).description(description).addHelpText('after', `\n${examples}\n`);
  }

  function clientOption() {
    return new Option('--client <CLIENT>', '目标 Agent 客户端；交互终端可选择').choices([
      ...agentClientIds,
    ]);
  }

  function scopeOption() {
    return new Option('--scope <SCOPE>', '配置范围（默认 project；向导中可选择）').choices([
      'project',
      'user',
    ]);
  }

  async function execute(command: Command, args: string[] = []) {
    const flags = command.optsWithGlobals<CliOptions>();
    const ui = new CliUi(
      flags.interactive !== false && !flags.json && command.name() !== 'bridge',
      flags.animation !== false,
    );
    ui.intro(command.name());
    const run = () => runCommand(command.name(), args, flags, ui);
    exitCode = command.name() === 'bridge' ? await run() : await withCliUpdateNotice(run);
  }

  command(
    'connect',
    '连接 Agent 并写入 MCP 配置',
    '示例：\n  capability-hub connect --url https://hub.example.com --client codex\n  capability-hub connect --url https://hub.example.com --client cursor --scope user --no-browser\n\n缺少 --url / --client 时可在终端输入。默认仅申请读取权限。\n已有不同配置须显式使用 --replace；验证成功后才写入。',
  )
    .addOption(clientOption())
    .addOption(scopeOption())
    .option('--contribute', '额外申请分享、推荐与反馈权限')
    .option('--no-browser', '仅显示授权链接，不自动打开浏览器')
    .option('--config-file <PATH>', '客户端配置文件；部分客户端的用户范围必须提供')
    .option('--replace', '允许替换同名 MCP 配置，并备份原文件')
    .action(async (_options: CliOptions, command: Command) => execute(command));

  command(
    'status',
    '检查 connect 连接与工具发现',
    '示例：\n  capability-hub status --url https://hub.example.com --client codex\n\n需要先完成 connect；此命令不修改配置。',
  )
    .addOption(clientOption())
    .action(async (_options: CliOptions, command: Command) => execute(command));

  command(
    'login',
    '为 CLI 搜索与安装授权',
    '示例：\n  capability-hub login --url https://hub.example.com\n\n打开终端给出的链接，核对授权码并批准。凭据只保存在私有文件中。\n此登录用于 search、add、mcp-config；Agent 连接请用 connect。',
  ).action(async (_options: CliOptions, command: Command) => execute(command));

  command(
    'search',
    '搜索可见 Skill / MCP 资源',
    '示例：\n  capability-hub search "code review"\n  capability-hub search review --url https://hub.example.com --json\n\n使用 login 保存的凭据，或 CAPABILITY_HUB_TOKEN + --url。\n--json 输出原始结果；此模式不进入交互向导。',
  )
    .argument('[query...]', '查询词；多个词以空格连接')
    .option('--json', '输出 JSON，便于脚本处理')
    .action(async (query: string[], _options: CliOptions, command: Command) =>
      execute(command, query),
    );

  command(
    'add',
    '下载、校验并安装 Skill',
    '示例：\n  capability-hub add example-skill --version 1.0.0 --url https://hub.example.com --to .agents/skills --dry-run\n  capability-hub add --ticket <URL> --to .agents/skills\n\n公开 Skill 无需登录，但须提供 --url。票据模式必须显式提供 --to，且不使用 NAME 或 --version。\n只写入明确指定的 PATH/NAME，不执行内容。已有目录须显式 --replace 并保留备份；请先用 --dry-run 核对本地差异。',
  )
    .argument('[name]', 'Skill 资源名称')
    .option('--version <VERSION>', '明确的资源版本；交互终端可从可见版本选择')
    .option('--ticket <URL>', 'install_skill 返回的一次性票据地址；无需登录')
    .option('--to <PATH>', '安装父目录，必须明确指定或输入')
    .option('--dry-run', '校验并预览差异，不写入文件；使用票据时不下载归档')
    .option('--replace', '允许替换已有安装，并保留原目录备份')
    .action(async (name: string | undefined, _options: CliOptions, command: Command) =>
      execute(command, name === undefined ? [] : [name]),
    );

  command(
    'outdated',
    '检查已安装的 Skill，不改动本地目录',
    '示例：\n  capability-hub outdated --url https://hub.example.com --to .agents/skills --to .claude/skills\n  capability-hub outdated --json --exit-code\n\n默认扫描当前项目已存在的预设技能目录；未登录时用 --url 匿名检查公开 Skill。',
  )
    .option(
      '--to <DIR>',
      '技能父目录，可重复指定',
      (directory: string, directories: string[] = []) => {
        directories.push(directory);
        return directories;
      },
    )
    .option('--json', '输出 JSON 数组')
    .option('--exit-code', '有可用更新或不可用安装时返回 2；unknown_source 仅报告，不影响退出码')
    .option('--fail-on-modified', '存在 modified 状态时返回 3，优先于 --exit-code 的 2')
    .action(async (options: { to?: string[] }, command: Command) => execute(command, options.to));

  command(
    'hub-config',
    '离线生成 Hub 配置或接入说明',
    '示例：\n  capability-hub hub-config --url https://hub.example.com --client codex\n  capability-hub hub-config --url https://hub.example.com --client pi --scope user --conversation\n\n不读取凭据、不请求 Hub、不写文件。配置或对话说明写到 stdout，提示写到 stderr。',
  )
    .addOption(clientOption())
    .addOption(scopeOption())
    .addOption(
      new Option('--method <METHOD>', '接入方式')
        .choices(['oauth', 'assistant', 'token'])
        .default('oauth'),
    )
    .option('--contribute', '在接入说明中申请分享、推荐与反馈权限')
    .option('--conversation', '输出可交给 Agent 的完整接入说明')
    .action(async (_options: CliOptions, command: Command) => execute(command));

  command(
    'mcp-config',
    '生成 MCP 资源的客户端配置',
    '示例：\n  capability-hub mcp-config example-service --version 1.0.0 --client cursor\n  capability-hub mcp-config example-service --version 1.0.0 --client pi --option remote-1 --scope user\n\n使用 CLI 登录凭据或环境令牌。JSON/TOML 写到 stdout，不自动写入客户端。\n有多个受支持的安装项时，须通过 --option 或终端选择明确指定。',
  )
    .argument('[name]', 'MCP 资源名称')
    .option('--version <VERSION>', '明确的资源版本；交互终端可选择')
    .addOption(clientOption())
    .addOption(scopeOption())
    .option('--option <ID>', 'MCP 安装项标识')
    .action(async (name: string | undefined, _options: CliOptions, command: Command) =>
      execute(command, name === undefined ? [] : [name]),
    );

  command(
    'bridge',
    '为 Agent 提供 stdio → Hub MCP 桥接',
    '由 connect 生成的配置自动调用，通常无需手动运行。\n必须提供 --url 和 --client；始终禁用交互，stdout 仅用于 MCP 协议。',
  )
    .addOption(clientOption())
    .action(async (_options: CliOptions, command: Command) => execute(command));

  program.action(async (_options: CliOptions, command: Command) => {
    const flags = command.opts<CliOptions>();
    const ui = new CliUi(flags.interactive !== false, flags.animation !== false);
    if (!ui.interactive) {
      program.outputHelp();
      return;
    }
    ui.intro();
    const selected = await ui.choose(
      '命令',
      '你想做什么？',
      [
        { title: 'Agent 接入', commands: ['connect', 'status'] },
        { title: 'CLI 资源', commands: ['login', 'search', 'add', 'outdated'] },
        { title: '配置生成', commands: ['hub-config', 'mcp-config'] },
      ].flatMap((group) => [
        { value: group.title, label: group.title, disabled: true },
        ...program.commands
          .filter((item) => group.commands.includes(item.name()))
          .map((item) => ({
            value: item.name(),
            label: item.name(),
            hint: item.description(),
            gapAfter: item.name() === group.commands.at(-1),
          })),
      ]),
    );
    exitCode = await withCliUpdateNotice(() => runCommand(selected, [], flags, ui));
  });

  try {
    await program.parseAsync([...arguments_], { from: 'user' });
  } catch (error) {
    if (!(error instanceof CommanderError) || error.exitCode !== 0) throw error;
  }
  return exitCode;
}
