import type { AgentClient } from '@capability-hub/contracts';
import type { DiscoveryResultResponse } from '@capability-hub/contracts/http';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { downloadSkillBundle } from '../../shared/api/client.js';
import { AgentClientSelect } from '../../shared/components/AgentClientSelect.js';
import { CodeBlock } from '../../shared/components/CodeBlock.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { Message } from '../../shared/components/Message.js';
import { Overlay } from '../../shared/components/Overlay.js';
import { ScriptBadge } from '../../shared/components/ScriptBadge.js';
import { Segmented } from '../../shared/components/Segmented.js';
import { VersionLabel } from '../../shared/components/VersionLabel.js';
import {
  Bot,
  Download,
  FileArchive,
  Layers3,
  LoaderCircle,
  Terminal,
  X,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import {
  btnPrimaryStyles,
  btnStyles,
  iconBtnStyles,
  installationContentStyles,
  subtleStyles,
} from '../../shared/styles/recipes.js';
import {
  bundleEntryStyles,
  bundleMethodBarStyles,
  bundleMethodStyles,
  bundleRowStyles,
  bundleSelectActionStyles,
  bundleVersionStyles,
} from './styles.js';
import { agentSkillInstallPrompt, cliSkillCommand } from './installation-methods.js';
import type { DiscoveryTask } from './use-discovery.js';

const title = '批量获取 Skill';

type Delivery = 'zip' | 'cli' | 'agent';
const deliveryMethods: { id: Delivery; label: ReactNode }[] = [
  {
    id: 'zip',
    label: (
      <>
        <FileArchive size={15} />
        ZIP 下载
      </>
    ),
  },
  {
    id: 'cli',
    label: (
      <>
        <Terminal size={15} />
        CLI 安装
      </>
    ),
  },
  {
    id: 'agent',
    label: (
      <>
        <Bot size={15} />
        交给 Agent
      </>
    ),
  },
];

/** 只处理本轮展示的 Skill；结果被替换后，旧选择不转交给新的一轮。 */
export function DiscoverySkillActions({ task }: { task: DiscoveryTask }) {
  const [openFor, setOpenFor] = useState<DiscoveryTask>();
  const { skills, hasMcp } = useMemo(() => {
    const shown = [...task.items, ...task.partial];
    const slugs = new Set<string>();
    const skills = shown.filter((item) => {
      if (item.kind !== 'skill' || slugs.has(item.slug)) return false;
      slugs.add(item.slug);
      return true;
    });
    return { skills, hasMcp: shown.some((item) => item.kind === 'mcp') };
  }, [task]);
  if (skills.length < 2) return null;
  return (
    <>
      <button
        type="button"
        className={cn(btnStyles, 'min-h-8 gap-1.5 px-2.5 py-1 text-brand')}
        aria-haspopup="dialog"
        onClick={() => setOpenFor(task)}
      >
        <Download size={14} />
        {title}（{skills.length}）
      </button>
      {openFor === task && (
        <SkillDialog
          skills={skills}
          partial={task.partial}
          hasMcp={hasMcp}
          onClose={() => setOpenFor(undefined)}
        />
      )}
    </>
  );
}

function SkillDialog({
  skills,
  partial,
  hasMcp,
  onClose,
}: {
  skills: DiscoveryResultResponse[];
  partial: DiscoveryResultResponse[];
  hasMcp: boolean;
  onClose: () => void;
}) {
  const [ids, setIds] = useState(() => skills.map((item) => item.version_id));
  const [delivery, setDelivery] = useState<Delivery>('zip');
  const [client, setClient] = useState<AgentClient>('codex');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useLayoutEffect(() => () => pending.current?.abort(), []);
  const selected = skills.filter((item) => ids.includes(item.version_id));
  const allSelected = selected.length === skills.length;
  function select(next: string[]) {
    setIds(next);
    setError('');
  }
  function close() {
    pending.current?.abort();
    onClose();
  }
  async function download() {
    if (pending.current || !selected.length) return;
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError('');
    try {
      const blob = await downloadSkillBundle(
        selected.map((item) => item.version_id),
        request.signal,
      );
      if (request.signal.aborted) return;
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      try {
        link.href = url;
        link.download = 'capability-hub-skills.zip';
        document.body.append(link);
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch (failure) {
      if (!request.signal.aborted)
        setError(failure instanceof Error ? failure.message : '下载失败');
    } finally {
      if (!request.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <Overlay open label={title} variant="palette" onClose={close}>
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-paper px-4 py-3.5 sm:px-6">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-brand-tint text-brand">
          <Layers3 size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[length:19px] leading-6 font-semibold">{title}</h2>
          <p className={subtleStyles}>下载和安装都使用清单中的固定版本。</p>
        </div>
        <button type="button" className={iconBtnStyles} aria-label="关闭" onClick={close}>
          <X size={18} />
        </button>
      </header>
      <div className="px-4 pt-3 pb-3.5 sm:px-6">
        <fieldset className="min-w-0 rounded-none border-0 p-0" disabled={busy}>
          <legend className="sr-only">选择要获取的固定版本</legend>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
            <span className="font-medium tabular-nums text-muted-ink" aria-live="polite">
              已选 {selected.length} / {skills.length} 个 Skill
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className={bundleSelectActionStyles}
                aria-disabled={allSelected || undefined}
                tabIndex={allSelected ? -1 : undefined}
                onClick={() => {
                  if (!allSelected) select(skills.map((item) => item.version_id));
                }}
              >
                全选
              </button>
              <button
                type="button"
                className={bundleSelectActionStyles}
                aria-disabled={!selected.length || undefined}
                tabIndex={!selected.length ? -1 : undefined}
                onClick={() => {
                  if (selected.length) select([]);
                }}
              >
                清空选择
              </button>
            </div>
          </div>
          <div className="max-h-[min(36dvh,18rem)] divide-y divide-line overflow-y-auto [scrollbar-width:thin]">
            {skills.map((item) => (
              <label key={item.version_id} className={bundleRowStyles}>
                <input
                  type="checkbox"
                  checked={ids.includes(item.version_id)}
                  onChange={(event) =>
                    select(
                      event.currentTarget.checked
                        ? [...ids, item.version_id]
                        : ids.filter((id) => id !== item.version_id),
                    )
                  }
                />
                <span className={bundleEntryStyles}>
                  <span
                    aria-hidden="true"
                    className="grid size-7 place-items-center rounded-[7px] bg-surface-chip-soft max-[520px]:row-span-2"
                  >
                    <Glyph seed={item.slug} kind="skill" size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <strong className="min-w-0 font-mono text-[length:13px] leading-5 font-semibold">
                        {item.slug}
                      </strong>
                      {item.has_scripts && <ScriptBadge />}
                      {(partial.includes(item) || item.judgment?.fit === 'partial') && (
                        <span className="text-caption font-normal text-muted-ink">部分匹配</span>
                      )}
                    </span>
                    {!!item.unverified.length && (
                      <span className="block font-normal text-muted-ink">
                        仍需核对：{item.unverified.join('、')}
                      </span>
                    )}
                  </span>
                  <span className={bundleVersionStyles}>
                    版本 <VersionLabel value={item.version_label} />
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {hasMcp && (
          <p className={cn(subtleStyles, 'mt-2')}>此批次不含 MCP；请在对应结果卡查看接入方式。</p>
        )}
      </div>
      <section
        aria-label="获取所选 Skill"
        className="min-w-0 border-t border-line bg-surface-bubble px-4 pb-4 sm:px-6 sm:pb-5"
      >
        <div inert={busy}>
          <Segmented
            id="skill-bundle-delivery"
            label="获取方式"
            value={delivery}
            onChange={setDelivery}
            options={deliveryMethods}
            className={bundleMethodBarStyles}
            itemClassName={bundleMethodStyles}
            indicatorClassName="rounded-none bg-transparent [box-shadow:inset_0_-2px_0_var(--brand)] forced-colors:hidden"
          />
        </div>
        {delivery === 'zip' ? (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pt-4">
            <div className="min-w-0">
              {selected.length ? (
                <>
                  <p className="font-mono text-body font-medium">capability-hub-skills.zip</p>
                  <p className={subtleStyles}>每个 Skill 独立成目录，不执行脚本。</p>
                </>
              ) : (
                <p className={subtleStyles}>请选择至少一个 Skill，再下载压缩包。</p>
              )}
            </div>
            <button
              type="button"
              className={cn(btnStyles, btnPrimaryStyles, 'aria-disabled:cursor-wait')}
              disabled={!selected.length}
              aria-disabled={busy || undefined}
              aria-busy={busy || undefined}
              onClick={() => void download()}
            >
              {busy ? (
                <LoaderCircle size={15} className="motion-safe:animate-spin" />
              ) : (
                <Download size={15} />
              )}
              {busy ? '正在准备 ZIP…' : '下载 ZIP'}
            </button>
            {error && (
              <div className="w-full">
                <Message error>{error}</Message>
              </div>
            )}
          </div>
        ) : (
          <InstallCommands
            key={delivery}
            delivery={delivery}
            selected={selected}
            client={client}
            onClientChange={setClient}
          />
        )}
      </section>
    </Overlay>
  );
}

type Method = 'preview' | 'install';
const cliMethods: { id: Method; label: string }[] = [
  { id: 'preview', label: '预览命令' },
  { id: 'install', label: '安装命令' },
];

function InstallCommands({
  delivery,
  selected,
  client,
  onClientChange,
}: {
  delivery: 'cli' | 'agent';
  selected: DiscoveryResultResponse[];
  client: AgentClient;
  onClientChange: (client: AgentClient) => void;
}) {
  const [method, setMethod] = useState<Method>('preview');
  const origin = window.location.origin;
  const code =
    delivery === 'agent'
      ? agentSkillInstallPrompt(selected, origin, client)
      : selected
          .map((item) => {
            const command = cliSkillCommand(item.slug, item.version_label, origin, client);
            return method === 'preview' ? `${command} --dry-run` : command;
          })
          .join('\n');
  return (
    <div
      className={cn(
        installationContentStyles,
        'pt-4',
        delivery === 'agent' && '[&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere]',
      )}
    >
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3 [&>label]:min-w-40 [&>label]:flex-1">
        <AgentClientSelect value={client} onChange={onClientChange} />
        {delivery === 'cli' && (
          <Segmented
            id="skill-bundle-command"
            label="CLI 命令类型"
            value={method}
            options={cliMethods}
            onChange={setMethod}
          />
        )}
      </div>
      {selected.length ? (
        <CodeBlock
          key={code}
          title={
            delivery === 'agent'
              ? '复制到 Agent 对话'
              : method === 'preview'
                ? '仅预览，不安装'
                : '核对预览后，在项目根目录运行'
          }
          code={code}
        />
      ) : (
        <p className={subtleStyles}>请先选择要安装的 Skill。</p>
      )}
      <p className={subtleStyles}>
        {delivery === 'agent'
          ? '使用已获得本站访问权限的 Agent。'
          : '受限 Skill 需先授权 CLI 访问本站。'}{' '}
        <a className="text-brand underline" href="/connect">
          接入与授权说明
        </a>
      </p>
    </div>
  );
}
