import { agentClientIds, agentClients, type AgentClient } from '@capability-hub/contracts';
import claudeCode from '@iconify-icons/thesvg-color/claude-code';
import codex from '@iconify-icons/thesvg-color/codex-light';
import cursor from '@iconify-icons/thesvg-color/cursor-light';
import gemini from '@iconify-icons/thesvg-color/gemini-cli';
import copilot from '@iconify-icons/thesvg-color/github-copilot-light';
import opencode from '@iconify-icons/thesvg-color/opencode';
import pi from '@iconify-icons/thesvg-color/pi';
import vscode from '@iconify-icons/thesvg-color/visual-studio-code';
import { cn } from '../styles/cn.js';
import { AppIcon } from './AppIcon.js';
import { Terminal } from './lucide.js';

const brands = {
  codex,
  'claude-code': claudeCode,
  cursor,
  opencode,
  pi,
  'gemini-cli': gemini,
  vscode,
  'copilot-cli': copilot,
} satisfies Record<AgentClient, typeof codex>;

/** 客户端自报名称仅用于展示；只匹配完整标识、显示名或 Hub 接入助手的命名。 */
export function connectionClient(name: string) {
  const label = name
    .trim()
    .toLowerCase()
    .replace(/ · 接入助手$/, '');
  return agentClientIds.find(
    (id) => id === label || agentClients[id].label.toLowerCase() === label,
  );
}

/** 品牌图标保留原色和独立底色，客户端名由相邻文字朗读。 */
export function ConnectionClientIcon({ name, large = false }: { name: string; large?: boolean }) {
  const client = connectionClient(name);
  const size = large ? 32 : 23;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid shrink-0 place-items-center',
        large
          ? 'size-11 rounded-xl max-md:[&_svg]:size-6 md:size-15 md:rounded-2xl'
          : 'size-10 rounded-xl',
        client ? 'border border-line bg-highlight' : 'bg-brand text-on-brand',
        large && !client && 'border border-line bg-paper text-brand',
        client === 'claude-code' && 'border-transparent bg-warning-soft',
      )}
    >
      {client ? <AppIcon icon={brands[client]} size={size} /> : <Terminal size={size} />}
    </span>
  );
}
