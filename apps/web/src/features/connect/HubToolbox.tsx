/**
 * Hub MCP 工具清单的静态侧栏：名称与说明都来自 `hubTools` 契约（`read` / `client` / `contribute`
 * 三类动作），本组件只按 `name` 映射图标并逐条渲染，不发请求。
 */
import {
  toolboxStyles,
  toolboxHeadingStyles,
  asideIconStyles,
  toolItemStyles,
  toolPermissionStyles,
  asideNoteStyles,
} from './styles.js';
import { subtleStyles, monoStyles } from '../../shared/styles/recipes.js';
import { hubTools } from '@capability-hub/contracts';
import {
  Bot,
  FileText,
  FolderOpen,
  PackagePlus,
  Plug,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  ThumbsUp,
  MessageSquare,
  type IconComponent,
} from '../../shared/icons/lucide.js';

const icons: Record<(typeof hubTools)[number]['name'], IconComponent> = {
  search_skills: Search,
  load_skill: FileText,
  read_skill_file: FolderOpen,
  search_mcp: Search,
  activate_mcp: Plug,
  get_mcp_config: Settings2,
  install_skill: PackagePlus,
  share_skill: Share2,
  rate_asset: ThumbsUp,
  report_asset_feedback: MessageSquare,
};
/**
 * 只有 `contribute` 类工具（分享、反馈、推荐）会写团队侧数据、需要额外权限，故只对它们
 * 提示权限；`read` 只查询，`client` 写的是本地配置。
 */
export function HubToolbox() {
  return (
    <section className={toolboxStyles} aria-label={`Hub MCP 的 ${hubTools.length} 个工具`}>
      <div className={toolboxHeadingStyles}>
        <span className={asideIconStyles}>
          <Bot size={23} />
        </span>
        <div>
          <h3>Hub MCP 工具</h3>
          <p className={subtleStyles}>{hubTools.length} 个工具，从发现到使用、分享与反馈</p>
        </div>
      </div>
      {hubTools.map((tool) => {
        const Icon = icons[tool.name];
        return (
          <div className={toolItemStyles} key={tool.name}>
            <span>
              <Icon size={18} />
            </span>
            <div>
              <strong className={monoStyles}>{tool.name}</strong>
              <p>{tool.description}</p>
              {tool.action === 'contribute' && (
                <small className={toolPermissionStyles}>需要分享、推荐与反馈权限</small>
              )}
            </div>
          </div>
        );
      })}
      <div className={asideNoteStyles}>
        <ShieldCheck size={16} />
        <span>
          Hub 校验权限并交付内容。Agent 在你的客户端确认安装与连接；分享继续经过扫描和独立审核。
        </span>
      </div>
    </section>
  );
}
