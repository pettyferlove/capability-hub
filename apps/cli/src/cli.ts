import { Command, CommanderError, Option } from 'commander';
import { agentClientIds } from '@capability-hub/contracts';
import packageJson from '../package.json' with { type: 'json' };
import { terminalText } from './api-client.js';
import { runCommand, type CliOptions } from './cli-commands.js';
import { CliUi } from './cli-ui.js';

/** 命令定义与帮助共用一份参数声明；退出由 main 处理，便于嵌入与测试。 */
export async function runCli(arguments_: readonly string[] = process.argv.slice(2)): Promise<void> {
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
    .addHelpText(
      'after',
      `
快速开始：
  capability-hub connect --url https://hub.example.com --client codex
  capability-hub login --url https://hub.example.com
  capability-hub search "code review"

连接 Agent 用 connect；登录 CLI 后可 search、add 和 mcp-config。
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
    const ui = new CliUi(flags.interactive !== false && !flags.json && command.name() !== 'bridge');
    ui.intro('Capability Hub · ' + command.name());
    await runCommand(command.name(), args, flags, ui);
  }

  command(
    'connect',
    '授权连接 Agent，并验证、写入 MCP 配置',
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
    '检查已授权的 Agent 连接与工具发现',
    '示例：\n  capability-hub status --url https://hub.example.com --client codex\n\n需要先完成 connect；此命令不修改配置。',
  )
    .addOption(clientOption())
    .action(async (_options: CliOptions, command: Command) => execute(command));

  command(
    'login',
    '通过浏览器批准 CLI 的资源读取权限',
    '示例：\n  capability-hub login --url https://hub.example.com\n\n打开终端给出的链接，核对授权码并批准。凭据只保存在私有文件中。\n此登录用于 search、add、mcp-config；Agent 连接请用 connect。',
  ).action(async (_options: CliOptions, command: Command) => execute(command));

  command(
    'search',
    '搜索可见资源；省略查询文本时列出资源',
    '示例：\n  capability-hub search "code review"\n  capability-hub search review --url https://hub.example.com --json\n\n使用 login 保存的凭据，或 CAPABILITY_HUB_TOKEN + --url。\n--json 输出原始结果；此模式不进入交互向导。',
  )
    .argument('[query...]', '查询词；多个词以空格连接')
    .option('--json', '输出 JSON，便于脚本处理')
    .action(async (query: string[], _options: CliOptions, command: Command) =>
      execute(command, query),
    );

  command(
    'add',
    '下载、校验并安装指定版本的 Skill',
    '示例：\n  capability-hub add example-skill --version 1.0.0 --to .agents/skills --dry-run\n  capability-hub add example-skill --version 1.0.0 --to .agents/skills\n\n只写入明确指定的 PATH/NAME，不执行内容。缺少参数时可在终端选择版本、输入路径。\n--dry-run 只预览；已有目录须显式 --replace 并保留备份；请先用 --dry-run 核对本地差异。',
  )
    .argument('[name]', 'Skill 资源名称')
    .option('--version <VERSION>', '明确的资源版本；交互终端可从可见版本选择')
    .option('--to <PATH>', '安装父目录，必须明确指定或输入')
    .option('--dry-run', '校验下载内容并预览差异，不写入文件')
    .option('--replace', '允许替换已有安装，并保留原目录备份')
    .action(async (name: string | undefined, _options: CliOptions, command: Command) =>
      execute(command, name === undefined ? [] : [name]),
    );

  command(
    'hub-config',
    '离线生成 Hub 自身的 MCP 配置或接入说明',
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
    '为已发布的 MCP 资源生成客户端配置',
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
    const ui = new CliUi(flags.interactive !== false);
    if (!ui.interactive) {
      program.outputHelp();
      return;
    }
    ui.intro('Capability Hub');
    const selected = await ui.choose(
      '命令',
      '你想做什么？',
      program.commands
        .filter((item) => item.name() !== 'bridge')
        .map((item) => ({ value: item.name(), label: item.name(), hint: item.description() })),
    );
    await runCommand(selected, [], flags, ui);
  });

  try {
    await program.parseAsync([...arguments_], { from: 'user' });
  } catch (error) {
    if (!(error instanceof CommanderError) || error.exitCode !== 0) throw error;
  }
}
