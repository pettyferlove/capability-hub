import { panelStyles, btnStyles, btnPrimaryStyles } from '../../shared/styles/recipes.js';
import {
  connectAccessStyles,
  accessMethodsStyles,
  accessMethodStyles,
  accessMethodIconStyles,
  accessMethodCopyStyles,
  accessMethodCheckStyles,
  accessMethodStepsStyles,
  accessMethodActionStyles,
} from './styles.js';
import { cn } from '../../shared/styles/cn.js';
import { ArrowRight, Check, Download, MessageSquare, Plug } from '../../shared/icons/lucide.js';
import { useId, useState } from 'react';

const accessMethods = [
  {
    id: 'conversation',
    label: 'Agent 对话',
    description: '复制指令给 Agent',
    icon: MessageSquare,
    steps: ['资源详情 → 使用与安装', '复制指令，发送给 Agent', '确认安装目录或 MCP 配置'],
    action: '查找可用资源',
    href: '/discover',
    hint: '公开资源无需登录；受限资源请使用 CLI 或 Hub MCP。',
  },
  {
    id: 'download',
    label: '直接下载',
    description: '下载固定版本资源包',
    icon: Download,
    steps: [
      '在目录中打开资源详情。',
      '下载当前版本，或查看历史版本。',
      '按资源说明完成安装或配置。',
    ],
    action: '浏览资源目录',
    href: '/discover',
    hint: '公开资源可直接下载；团队资源需登录并具有访问权限。',
  },
  {
    id: 'connection',
    label: 'CLI / Hub MCP',
    description: '接入有权限的团队资源',
    icon: Plug,
    steps: [
      '登录有访问权限的账号。',
      '按下方说明接入 Hub MCP 或 CLI。',
      '在对话或终端中搜索资源。',
    ],
    action: '查看接入配置',
    href: '#hub-connection',
    hint: 'Agent 通过浏览器授权连接；手动令牌在高级选项中管理。',
  },
] as const;

export function ConversationInstallIntro() {
  const id = useId();
  const [selected, setSelected] = useState<string>('conversation');
  const method = accessMethods.find((item) => item.id === selected)!;
  return (
    <section className={cn(panelStyles, connectAccessStyles)} aria-labelledby={id + '-heading'}>
      <h2 id={id + '-heading'}>选择获取方式</h2>
      <div className={accessMethodsStyles} role="radiogroup" aria-labelledby={id + '-heading'}>
        {accessMethods.map(({ id: value, label, description, icon: Icon }) => (
          <label className={accessMethodStyles} key={value}>
            <input
              type="radio"
              name={id + '-method'}
              value={value}
              checked={selected === value}
              aria-label={label}
              aria-describedby={id + '-' + value}
              onChange={() => setSelected(value)}
            />
            <span className={accessMethodIconStyles} aria-hidden="true">
              <Icon size={19} />
            </span>
            <span className={accessMethodCopyStyles}>
              <strong>{label}</strong>
              <small id={id + '-' + value}>{description}</small>
            </span>
            <span className={accessMethodCheckStyles} aria-hidden="true">
              <Check size={13} />
            </span>
          </label>
        ))}
      </div>
      <ol
        className={accessMethodStepsStyles}
        aria-live="polite"
        aria-label={method.label + '操作步骤'}
      >
        {method.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className={accessMethodActionStyles}>
        <a
          className={cn(btnStyles, btnPrimaryStyles)}
          href={method.href}
          aria-describedby={id + '-hint'}
        >
          {method.action}
          <ArrowRight size={15} aria-hidden="true" />
        </a>
        <p id={id + '-hint'}>{method.hint}</p>
      </div>
    </section>
  );
}
