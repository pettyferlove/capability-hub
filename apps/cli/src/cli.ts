import { Command, CommanderError, Option } from 'commander';
import { resolve } from 'node:path';
import {
  agentClientIds,
  assetSlugSchema,
  hubFeedbackAreas,
  hubFeedbackKinds,
  hubFeedbackSurfaces,
} from '@capability-hub/contracts';
import packageJson from '../package.json' with { type: 'json' };
import { terminalText } from './api-client.js';
import { runCommand, type CliOptions } from './cli-commands.js';
import { CliCancelled, CliUi } from './cli-ui.js';
import { hubUrl } from './credentials.js';
import { recordLastFailure } from './diagnostics.js';
import { defaultConfigDirectory } from './feedback-files.js';
import { withCliUpdateNotice } from './update-notice.js';

function commandPath(command: Command) {
  const names: string[] = [];
  for (let item = command; item.parent; item = item.parent) names.unshift(item.name());
  return names.join(' ');
}

function parsedOptionNames(command: Command) {
  const names = new Set<string>();
  for (let item: Command | null = command; item; item = item.parent) {
    for (const option of item.options) {
      if (option.long && item.getOptionValueSource(option.attributeName()) === 'cli')
        names.add(option.long);
    }
  }
  return [...names];
}

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

连接 Agent 用 connect；登录 CLI 后可 search、show、add、mcp-config 和 feedback。
公开 Skill 的 show 和 add 无需登录，但须提供 --url；list 和 remove 只处理本地目录。
交互终端省略命令可打开菜单；使用 help <命令> 查看详细示例。
读取命令和平台反馈也可使用 CAPABILITY_HUB_TOKEN，但必须显式提供 --url。
--version 指资源版本；查看 CLI 版本请用 -V / --cli-version。
`,
    );

  function command(name: string, description: string, examples: string, parent = program) {
    return parent.command(name).description(description).addHelpText('after', `\n${examples}\n`);
  }

  function clientOption() {
    return new Option('--client <CLIENT>', '目标 Agent 客户端；交互终端可选择').choices([
      ...agentClientIds,
    ]);
  }

  function scopeOption(description = '配置范围（默认 project；向导中可选择）') {
    return new Option('--scope <SCOPE>', description).choices(['project', 'user']);
  }

  function skillDirectoriesOption() {
    return new Option('--to <DIR>', '技能父目录，可重复指定').argParser(
      (directory: string, directories: string[] = []) => [...directories, directory],
    );
  }

  async function execute(command: Command, args: string[] = [], menuUi?: CliUi) {
    const path = commandPath(command);
    const flags = command.optsWithGlobals<CliOptions>();
    const ui =
      menuUi ??
      new CliUi(
        flags.interactive !== false && !flags.json && path !== 'bridge',
        flags.animation !== false,
      );
    if (!menuUi) ui.intro(path);
    const options = parsedOptionNames(command);
    const run = () => runCommand(path, args, flags, ui, options);
    try {
      exitCode = path === 'bridge' ? await run() : await withCliUpdateNotice(run);
    } catch (error) {
      if (
        path !== 'bridge' &&
        !flags.dryRun &&
        !(error instanceof CliCancelled || error instanceof CommanderError)
      ) {
        const directory = flags.configDir ? resolve(flags.configDir) : defaultConfigDirectory();
        const slug = ['add', 'mcp-config', 'show', 'remove'].includes(path)
          ? assetSlugSchema.safeParse(args[0])
          : undefined;
        let origin: string | undefined;
        try {
          if (flags.url !== undefined) origin = hubUrl(flags.url);
        } catch {
          // 无效地址可能含凭据，不进入失败记录。
        }
        await recordLastFailure(
          directory,
          {
            command: path,
            options,
            arguments: slug?.success ? [slug.data] : [],
            origin,
          },
          error,
        ).catch(() => {});
      }
      throw error;
    }
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
    'show',
    '阅读固定版本 Skill 的正文或附属文件',
    '示例：\n  capability-hub show example-skill --url https://hub.example.com\n  capability-hub show example-skill --version 1.0.0 --file references/guide.md\n\n默认显示当前发布的 SKILL.md。正文写到 stdout；版本写到 stderr，交互终端另列文件清单。\n读取多个文件时用 --version 固定同一版本。只读取、不写文件；终端控制字符会被替换，需要原始文件时用 add。',
  )
    .argument('[name]', 'Skill 资源名称')
    .option('--version <VERSION>', '资源版本（默认当前发布）')
    .option('--file <PATH>', '版本清单中的文件路径（默认 SKILL.md）')
    .action(async (name: string | undefined, _options: CliOptions, command: Command) =>
      execute(command, name === undefined ? [] : [name]),
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
    .addOption(skillDirectoriesOption())
    .option('--json', '输出 JSON 数组')
    .option(
      '--exit-code',
      '有更新的发布（含本地已修改的安装）、已弃用或不可用时返回 2；unknown_source 和 other_hub 仅报告',
    )
    .option('--fail-on-modified', '任一安装有本地修改（含已弃用的）时返回 3，优先于 2')
    .action(async (options: { to?: string[] }, command: Command) => execute(command, options.to));

  command(
    'list',
    '离线列出已安装的 Skill 及本地修改',
    '示例：\n  capability-hub list\n  capability-hub list --to .claude/skills --json\n\n默认扫描当前项目已存在的预设技能目录；只读来源记录并比对本地文件，不连接 Hub，也不判断来源是否为当前 Hub。',
  )
    .addOption(skillDirectoriesOption())
    .option('--json', '输出 JSON 数组')
    .action(async (options: { to?: string[] }, command: Command) => execute(command, options.to));

  command(
    'remove',
    '删除 CLI 安装的 Skill 或其替换备份',
    '示例：\n  capability-hub remove example-skill --to .agents/skills --dry-run\n  capability-hub remove example-skill --to .agents/skills --backups\n\n只删除带有效来源记录的安装，本地有修改时须显式 --force。\n--backups 只清理 NAME 的 add --replace 备份，不动当前安装。',
  )
    .argument('[name]', 'Skill 资源名称')
    .option('--to <PATH>', '安装父目录，必须明确指定或输入')
    .option('--dry-run', '预览将删除的目录，不改动文件')
    .option('--force', '本地有修改时仍删除')
    .option('--backups', '只清理 NAME 的 add --replace 备份，仍需提供 NAME')
    .action(async (name: string | undefined, _options: CliOptions, command: Command) =>
      execute(command, name === undefined ? [] : [name]),
    );

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
    .addOption(scopeOption('配置范围（省略时由 Hub 根据安装项选择）'))
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

  const feedback = command(
    'feedback',
    '提交或跟进 Capability Hub 的平台问题',
    '示例：\n  capability-hub feedback\n  capability-hub feedback list --status all\n  capability-hub feedback show 42\n\n不带子命令时打开交互向导。需要 CLI 登录，或 CAPABILITY_HUB_TOKEN + --url。',
  ).action(async (_options: CliOptions, command: Command) => execute(command));

  const jsonOption = () => new Option('--json', '输出 JSON，便于脚本处理');
  const yesOption = () => new Option('--yes', '经用户确认后提交，无需再次询问');
  const requestIdOption = () =>
    new Option('--request-id <UUID>', '同一次写入的重试键；重新确认发送时请勿复用');
  const attachOption = () =>
    new Option('--attach <PATH>', '本地附件文件，最多指定 5 次').argParser(
      (path: string, paths: string[] = []) => {
        paths.push(path);
        return paths;
      },
    );

  command(
    'new',
    '预览或提交平台反馈',
    '示例：\n  capability-hub feedback new --kind bug --surface mcp --title "接入失败" --description-file - --last-error --dry-run --json < report.md\n\n将预览交给用户确认后，再用相同参数去掉 --dry-run 并加 --yes。',
    feedback,
  )
    .option('--title <TEXT>', '反馈标题')
    .addOption(new Option('--description <TEXT>', '问题描述').conflicts('descriptionFile'))
    .option('--description-file <PATH>', '从 UTF-8 普通文件或标准输入（-）读取描述')
    .addOption(
      new Option('--kind <KIND>', '反馈类型（默认 bug）').choices(Object.keys(hubFeedbackKinds)),
    )
    .addOption(
      new Option('--surface <SURFACE>', '问题位置（默认 cli）').choices(
        Object.keys(hubFeedbackSurfaces),
      ),
    )
    .addOption(new Option('--area <AREA>', '所属模块').choices(Object.keys(hubFeedbackAreas)))
    .option('--blocking', '问题阻塞继续使用')
    .addOption(attachOption())
    .option('--last-error', '附带本机最近一次失败的诊断记录')
    .option('--no-diagnostics', '不附带任何诊断信息')
    .option('--dry-run', '预览反馈资料和附件清单，不请求 Hub')
    .addOption(yesOption())
    .addOption(jsonOption())
    .action(async (_options: CliOptions, command: Command) => execute(command));

  command(
    'list',
    '列出我的反馈并标明未读',
    '示例：\n  capability-hub feedback list --status all',
    feedback,
  )
    .addOption(
      new Option('--status <STATUS>', '按开放或已结束筛选')
        .choices(['open', 'closed', 'all'])
        .default('open'),
    )
    .addOption(jsonOption())
    .action(async (_options: CliOptions, command: Command) => execute(command));

  command(
    'show',
    '查看反馈详情和公开时间线并标记已读',
    '示例：\n  capability-hub feedback show 42',
    feedback,
  )
    .argument('<ref>', '反馈编号或 ID')
    .option('--after <SEQUENCE>', '从上一页返回的事件序号之后继续查看')
    .addOption(jsonOption())
    .action(async (ref: string, _options: CliOptions, command: Command) => execute(command, [ref]));

  command(
    'reply',
    '为我的反馈补充留言和附件',
    '示例：\n  capability-hub feedback reply 42 --message-file follow-up.md --yes',
    feedback,
  )
    .argument('<ref>', '反馈编号或 ID')
    .addOption(new Option('--message <TEXT>', '留言内容').conflicts('messageFile'))
    .option('--message-file <PATH>', '从 UTF-8 普通文件或标准输入（-）读取留言')
    .addOption(attachOption())
    .addOption(requestIdOption())
    .addOption(yesOption())
    .addOption(jsonOption())
    .action(async (ref: string, _options: CliOptions, command: Command) => execute(command, [ref]));

  command(
    'close',
    '确认问题已解决并关闭反馈',
    '示例：\n  capability-hub feedback close 42 --yes',
    feedback,
  )
    .argument('<ref>', '反馈编号或 ID')
    .addOption(requestIdOption())
    .addOption(yesOption())
    .addOption(jsonOption())
    .action(async (ref: string, _options: CliOptions, command: Command) => execute(command, [ref]));

  program.action(async (_options: CliOptions, command: Command) => {
    const flags = command.opts<CliOptions>();
    const ui = new CliUi(flags.interactive !== false, flags.animation !== false);
    if (!ui.interactive) {
      program.outputHelp();
      return;
    }
    ui.intro();
    const menuCommands = new Map(
      [...program.commands, ...feedback.commands].map((item) => [commandPath(item), item]),
    );
    const selected = await ui.choose(
      '命令',
      '你想做什么？',
      [
        { title: 'Agent 接入', commands: ['connect', 'status'] },
        { title: 'CLI 资源', commands: ['login', 'search', 'show', 'add'] },
        { title: '本地安装', commands: ['list', 'outdated', 'remove'] },
        { title: '配置生成', commands: ['hub-config', 'mcp-config'] },
        { title: '问题反馈', commands: ['feedback', 'feedback list'] },
      ].flatMap((group) => [
        { value: group.title, label: group.title, disabled: true },
        ...group.commands.map((path) => ({
          value: path,
          label: path === 'feedback' ? '提交反馈' : path === 'feedback list' ? '我的反馈' : path,
          hint: menuCommands.get(path)!.description(),
          gapAfter: path === group.commands.at(-1),
        })),
      ]),
    );
    await execute(menuCommands.get(selected)!, [], ui);
  });

  try {
    await program.parseAsync([...arguments_], { from: 'user' });
  } catch (error) {
    if (!(error instanceof CommanderError) || error.exitCode !== 0) throw error;
  }
  return exitCode;
}
