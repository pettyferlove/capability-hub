// 安装统一使用 pnpm 和仓库锁文件。
if (!process.env.npm_config_user_agent?.startsWith('pnpm/')) {
  console.error('本项目使用 pnpm，请运行 pnpm install --frozen-lockfile');
  process.exit(1);
}
