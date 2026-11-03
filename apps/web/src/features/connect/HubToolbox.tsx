import { hubTools } from '@capability-hub/contracts';
import { useState } from 'react';
import { DialogTitle } from '../../shared/components/DialogTitle.js';
import { Overlay } from '../../shared/components/Overlay.js';
import {
  BookOpen,
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
import { cn } from '../../shared/styles/cn.js';
import {
  btnStyles,
  sheetScrollStyles,
  subtleStyles,
  tagStyles,
} from '../../shared/styles/recipes.js';

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

const toolGroups = [
  {
    title: '搜索和使用',
    scope: '基础权限',
    tools: hubTools.filter((tool) => tool.action !== 'contribute'),
  },
  {
    title: '分享、推荐与反馈',
    scope: '需额外授权',
    tools: hubTools.filter((tool) => tool.action === 'contribute'),
  },
];

/** 客户端本地执行的工具随基础权限提供，只有写入 Hub 的操作需要贡献权限。 */
export function HubToolbox() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          btnStyles,
          'col-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:self-center',
        )}
        onClick={() => setOpen(true)}
      >
        <BookOpen size={15} />
        查看 MCP 工具
      </button>
      <Overlay open={open} onClose={close} label="Hub MCP 工具" variant="sheet">
        <DialogTitle title="Hub MCP 工具" onClose={close} />
        <div
          className={cn(
            sheetScrollStyles,
            'space-y-6 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand',
          )}
          role="region"
          aria-label="工具清单"
          tabIndex={0}
        >
          <p className={subtleStyles}>在客户端的 MCP 工具列表中，可按名称核对已授权的工具。</p>
          {toolGroups.map(({ title, scope, tools }) => (
            <section key={title} aria-label={title}>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold">{title}</h3>
                <span className={tagStyles}>{scope}</span>
                <span className="ml-auto text-caption text-muted-ink">{tools.length} 个工具</span>
              </div>
              <ul className="divide-y divide-line" role="list">
                {tools.map((tool) => {
                  const Icon = icons[tool.name];
                  return (
                    <li key={tool.name} className="flex items-start gap-3 py-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-page text-muted-ink">
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <strong className="text-label font-semibold">{tool.title}</strong>
                          <code className="text-caption text-muted-ink [overflow-wrap:anywhere]">
                            {tool.name}
                          </code>
                        </div>
                        <p className={cn(subtleStyles, 'mt-1')}>{tool.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className={cn(subtleStyles, 'flex items-start gap-2 border-t border-line pt-4')}>
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            安装与连接由客户端确认。分享的 Skill 需经过扫描和发布审核。
          </p>
        </div>
      </Overlay>
    </>
  );
}
