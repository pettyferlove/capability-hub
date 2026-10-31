export type ConversationStep =
  | { kind: 'user' | 'agent'; text: string }
  | { kind: 'tool'; name: string; input: string; result?: string; status?: string }
  | { kind: 'confirmation'; title: string; text: string; action: string };

export const conversationExamples: {
  id: string;
  label: string;
  prompt: string;
  steps: ConversationStep[];
}[] = [
  {
    id: 'task',
    label: '实现风控规则',
    prompt: '给退款服务加一条规则：同一张卡在 10 分钟内第 3 次申请退款时拦截，转人工复核。',
    steps: [
      {
        kind: 'user',
        text: '给退款服务加一条规则：同一张卡在 10 分钟内第 3 次申请退款时拦截，转人工复核。',
      },
      { kind: 'agent', text: '我先查一下团队的风控规则规范和回测流程。' },
      {
        kind: 'tool',
        name: 'search_skills',
        input: '退款 · 风控规则',
        result: 'risk-rule-guide · v1.4.0',
      },
      {
        kind: 'tool',
        name: 'load_skill',
        input: 'risk-rule-guide · v1.4.0 · SKILL.md',
        result: '规则接入点：RefundRiskPolicy；重复请求不重复计数。',
      },
      {
        kind: 'tool',
        name: 'read_skill_file',
        input: 'risk-rule-guide/references/backtest.md',
        result: '检查窗口边界、幂等请求与并发退款。',
      },
      { kind: 'agent', text: '规范里有对应的回测服务，我用它检查这几个边界。' },
      {
        kind: 'tool',
        name: 'search_mcp',
        input: '风控 · 回测',
        result: 'risk-rules-api',
      },
      {
        kind: 'tool',
        name: 'get_mcp_config',
        input: 'risk-rules-api · Codex · 当前项目',
        result: '.codex/config.toml',
      },
      {
        kind: 'tool',
        name: 'activate_mcp',
        input: 'risk-rules-api',
        status: '配置就绪',
      },
      {
        kind: 'confirmation',
        title: '连接风控回测服务',
        text: '使用本机的 RISK_API_TOKEN 连接 risk-rules-api，运行这条规则的回测？',
        action: '连接并回测',
      },
      {
        kind: 'agent',
        text: '已在 RefundRiskPolicy 中加入规则。回测通过：前 2 次放行，第 3 次拦截；重复请求不重复计数，窗口过期后恢复。',
      },
    ],
  },
  {
    id: 'install',
    label: '安装 Java 规范',
    prompt: '把团队的 Java 编码规范装进当前项目，先让我确认安装目录。',
    steps: [
      { kind: 'user', text: '把团队的 Java 编码规范装进当前项目，先让我确认安装目录。' },
      { kind: 'agent', text: '我来找团队正在使用的那份规范。' },
      {
        kind: 'tool',
        name: 'search_skills',
        input: 'Java · 编码规范',
        result: 'java-conventions · v1.4.0',
      },
      {
        kind: 'tool',
        name: 'install_skill',
        input: 'java-conventions · v1.4.0',
        result: 'SKILL.md · references/style.md · references/testing.md',
      },
      {
        kind: 'confirmation',
        title: '安装 java-conventions',
        text: '将这 3 个文件写入 .agents/skills/java-conventions/？',
        action: '安装到项目',
      },
      {
        kind: 'agent',
        text: '已安装到 .agents/skills/java-conventions/。接下来这个项目的 Java 任务，我会按这份规范处理。',
      },
    ],
  },
  {
    id: 'share',
    label: '分享审查经验',
    prompt: '把刚才整理的接口审查经验分享给研发团队，也推荐这次用的审查 Skill。',
    steps: [
      { kind: 'user', text: '把刚才整理的接口审查经验分享给研发团队，也推荐这次用的审查 Skill。' },
      { kind: 'agent', text: '整理好了 api-review-guide，包含鉴权、错误码和兼容性检查清单。' },
      {
        kind: 'confirmation',
        title: '提交经验文件',
        text: '向研发团队提交 api-review-guide v1.0.0，并推荐 api-review-checklist v1.2.0？',
        action: '提交并推荐',
      },
      {
        kind: 'tool',
        name: 'share_skill',
        input: 'api-review-guide · v1.0.0 · 研发团队',
        status: '已接收',
      },
      {
        kind: 'tool',
        name: 'rate_asset',
        input: 'api-review-checklist · v1.2.0',
        status: '已推荐',
      },
      {
        kind: 'agent',
        text: '经验文件正在校验，通过后到发布页提交团队审核。',
      },
    ],
  },
];
