import type { AiExecutionViewResponse } from '@capability-hub/contracts';
import {
  Bot,
  Check,
  Lightbulb,
  LoaderCircle,
  Pencil,
  ShieldCheck,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { agentLabels } from './presentation.js';
import { roleState } from './activity.js';
import { StreamingText } from './StreamingText.js';
import { agentCardStyles, agentToneStyles } from './styles.js';

const roles = {
  assistant: { Icon: Bot, phase: '任务执行', number: 'AI' },
  planner: { Icon: Lightbulb, phase: '方案规划', number: '01' },
  editor: { Icon: Pencil, phase: '并行审查', number: '02' },
  reviewer: { Icon: ShieldCheck, phase: '并行审查', number: '03' },
};
function roleInfo(id: string) {
  const key = Object.hasOwn(roles, id) ? (id as keyof typeof roles) : 'assistant';
  const role = roles[key];
  if (
    id === 'resource-audit' ||
    id === 'feedback-triage' ||
    id === 'publication-review' ||
    id === 'assessment'
  )
    return {
      ...role,
      ...agentLabels[id],
      Icon: id === 'assessment' ? Pencil : ShieldCheck,
      phase: id === 'assessment' ? '报告整理' : '查阅证据',
      tone: agentToneStyles[id === 'assessment' ? 'editor' : 'reviewer'],
    };
  return { ...role, ...agentLabels[key], tone: agentToneStyles[key] };
}

/**
 * 「多 Agent 协作」的角色板，展示规划、表达、风险三个角色的实时进度；其它操作类型返回 `null`。
 */
export function AgentRoster({ view }: { view: AiExecutionViewResponse }) {
  if (view.execution.operation_id !== 'agent-lab') return null;
  return (
    <section aria-label="协作角色" className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-body font-semibold">这次任务的协作团队</h3>
        <span className="text-caption text-muted-ink">规划后，表达与风险并行审查</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {(['planner', 'editor', 'reviewer'] as const).map((role) => {
          const info = roleInfo(role);
          const state = roleState(view, role);
          return (
            <div
              key={role}
              className={cn(
                'relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border px-3 py-3',
                info.tone.border,
                info.tone.header,
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg',
                  info.tone.mark,
                )}
              >
                <info.Icon size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold">{info.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-caption text-muted-ink">
                  {state === '进行中' && (
                    <LoaderCircle size={11} className="motion-safe:animate-spin" />
                  )}
                  {state}
                </p>
              </div>
              <span className="font-mono text-caption text-muted-ink/70">{info.number}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * 单个角色的输出卡片：角色由 `message_id` 冒号前的段位决定，未登记的角色按助手样式兜底；
 * 研判报告不展示正文，只用 `reportReady` 指路「成果」，其余角色在生成中且面板可见时逐字显示。
 */
export function AgentMessageCard({
  block,
  reportReady,
  running,
  active,
}: {
  block: AiExecutionViewResponse['execution']['message_blocks'][number];
  /** 研判报告是否已可查看，只有报告角色用到。 */
  reportReady: boolean;
  /** 执行是否仍在运行，决定「生成中／已停止」与是否继续流式显示。 */
  running: boolean;
  /** 所在面板当前可见；为假时停止逐字动画以省掉后台渲染。 */
  active: boolean;
}) {
  const role = block.message_id.split(':')[0];
  const info = roleInfo(role);
  const streaming = running && !block.complete;
  return (
    <article className={cn(agentCardStyles, info.tone.border)} aria-label={info.title}>
      <header
        className={cn(
          'relative flex flex-wrap items-center gap-3 border-b border-[color:var(--line)] px-4 py-3',
          info.tone.header,
        )}
      >
        <span
          className={cn('absolute inset-y-0 left-0 w-0.5', info.tone.rail)}
          aria-hidden="true"
        />
        <span
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl',
            info.tone.mark,
          )}
        >
          <info.Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-body font-semibold">{info.title}</h2>
            <span className="text-caption text-muted-ink">{info.phase}</span>
          </div>
          <p className="mt-0.5 text-caption text-muted-ink">{info.description}</p>
        </div>
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2 py-1 text-caption',
            info.tone.mark,
          )}
        >
          {streaming ? (
            <>
              <LoaderCircle size={12} className="motion-safe:animate-spin" />
              生成中
            </>
          ) : block.complete ? (
            <>
              <Check size={12} />
              已输出
            </>
          ) : (
            '已停止'
          )}
        </span>
      </header>
      <div className="px-5 py-4 sm:px-6 sm:py-5">
        {role === 'assessment' ? (
          <p className="text-muted-ink">
            {reportReady
              ? '报告已整理，可在「成果」中查看发现、建议和证据引用。'
              : running
                ? '正在整理并校验研判报告…'
                : '报告整理已结束，处理状态见运行详情。'}
          </p>
        ) : (
          <StreamingText text={block.text} live={streaming && active} />
        )}
      </div>
    </article>
  );
}
