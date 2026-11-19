/** 最低版本表示下发命令的能力要求，不是 API 的访问门槛。 */
export interface CliCompatibility {
  recommended: string;
  minimum: string;
  minimum_reason: string;
}

/** 推荐值与 CLI 包版本一起维护；部署前该版本必须已发布。 */
export const cliCompatibility: Readonly<CliCompatibility> = {
  recommended: '0.2.2',
  minimum: '0.2.0',
  minimum_reason: '使用一次性票据安装 Skill 需要 add --ticket',
};

/** 网页构建号独立于发行版本，未交付网页时不发送。 */
export const hubVersionHeaders = {
  version: 'X-Capability-Hub-Version',
  webBuild: 'X-Capability-Hub-Web-Build',
  cli: 'X-Capability-Hub-CLI',
} as const;
