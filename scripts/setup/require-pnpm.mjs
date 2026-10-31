// 安装统一使用 pnpm 和仓库锁文件。
if (!process.env.npm_config_user_agent?.startsWith('pnpm/10.33.0 ')) {
  console.error('本项目使用 pnpm 10.33.0，请运行 corepack pnpm install --frozen-lockfile');
  process.exit(1);
}
