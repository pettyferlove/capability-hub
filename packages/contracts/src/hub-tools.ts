/** MCP 工具与接入页面共用的名称和用途。 */
export const hubTools = [
  {
    name: 'search_skills',
    title: '找到适用的 Skill',
    description: '按任务搜索有权访问的 Skill，返回固定版本。',
    action: 'read',
  },
  {
    name: 'load_skill',
    title: '加载经验与方法',
    description: '读取 SKILL.md 正文、文件清单和摘要。',
    action: 'read',
  },
  {
    name: 'read_skill_file',
    title: '按需读取参考文件',
    description: '继续读取同一版本的参考资料与脚本内容。',
    action: 'read',
  },
  {
    name: 'search_mcp',
    title: '找到可用的 MCP',
    description: '搜索 MCP 服务和已经审核的安装选项。',
    action: 'read',
  },
  {
    name: 'activate_mcp',
    title: '准备接入 MCP',
    description: '生成接入方案与配置，交由客户端确认并连接。',
    action: 'client',
  },
  {
    name: 'get_mcp_config',
    title: '生成客户端配置',
    description: '按客户端和安装项生成配置及变量说明。',
    action: 'read',
  },
  {
    name: 'install_skill',
    title: '安装完整 Skill',
    description: '交付固定版本完整文件与校验信息，由 Agent 确认位置后写入。',
    action: 'client',
  },
  {
    name: 'share_skill',
    title: '分享项目中的经验',
    description: '将 Skill 文件提交校验与扫描，进入网页发布流程。',
    action: 'contribute',
  },
  {
    name: 'report_asset_feedback',
    title: '反馈问题与建议',
    description: '经用户授权，上报具体版本的缺陷、能力缺口和改进建议，仅提交脱敏摘要。',
    action: 'contribute',
  },
  {
    name: 'rate_asset',
    title: '推荐有用的资源',
    description: '推荐或取消推荐一个 Skill / MCP 资源。',
    action: 'contribute',
  },
] as const;
