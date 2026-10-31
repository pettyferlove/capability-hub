import { createIcon, type IconComponent } from '../icons/AppIcon.js';
import codex from '@iconify-icons/devicon-plain/codex';
import vscode from '@iconify-icons/devicon-plain/vscode';
import claudeCode from '@iconify-icons/simple-icons/claudecode';
import cursor from '@iconify-icons/simple-icons/cursor';
import opencode from '@iconify-icons/simple-icons/opencode';
import gemini from '@iconify-icons/simple-icons/googlegemini';
import copilot from '@iconify-icons/simple-icons/githubcopilot';
import pi from '@iconify-icons/lucide/pi';
import type { AgentClient } from '@capability-hub/contracts';
// 品牌标识静态打包并继承主题文字色；Pi 使用 π 语义符号，不冒充品牌图标。
export const clientIcons = {
  codex: /* @__PURE__ */ createIcon(codex),
  'claude-code': /* @__PURE__ */ createIcon(claudeCode),
  cursor: /* @__PURE__ */ createIcon(cursor),
  opencode: /* @__PURE__ */ createIcon(opencode),
  pi: /* @__PURE__ */ createIcon(pi),
  'gemini-cli': /* @__PURE__ */ createIcon(gemini),
  vscode: /* @__PURE__ */ createIcon(vscode),
  'copilot-cli': /* @__PURE__ */ createIcon(copilot),
} satisfies Record<AgentClient, IconComponent>;
