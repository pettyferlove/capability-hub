import type { AiExecutionResponse, AiExecutionViewResponse } from '@capability-hub/contracts';
import {
  BookOpen,
  Compass,
  FileText,
  FolderOpen,
  GitCompareArrows,
  MessageSquare,
  Plug,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wrench,
  type IconComponent,
} from '../../shared/icons/lucide.js';
import { activityItems } from './activity.js';
import { eventLabel, jsonObject, stepLabels, toolLabels } from './presentation.js';

type Status = AiExecutionResponse['status'];

/** 点阵在运行中可切换的图形，与当前动作类型对应。 */
export type Glyph = 'work' | 'read' | 'search' | 'browse' | 'think' | 'report';

/** 研判报告风险等级文案；未登记的等级由调用方回退为空。 */
export const riskLabels: Record<string, string> = {
  low: '较低风险',
  medium: '需要关注',
  high: '高风险',
  unknown: '证据有限',
};

/**
 * 当前可展示的研判报告：最终结果优先，其次是已保存的报告成果，最后是待确认交互里附带的报告。
 * 字段缺失时返回空串或 `undefined`，不做 schema 校验。
 */
export function reportOf(view?: AiExecutionViewResponse) {
  const report =
    view?.execution.result ??
    view?.artifacts.find((a) => a.name === 'assessment')?.content ??
    jsonObject(view?.interactions.find((i) => i.status === 'pending')?.request).assessment;
  const assessment = jsonObject(jsonObject(report).assessment);
  return {
    risk: typeof assessment.risk === 'string' ? assessment.risk : '',
    findings: Array.isArray(assessment.findings) ? assessment.findings.length : undefined,
    summary: typeof assessment.summary === 'string' ? assessment.summary : '',
  };
}

/** 非运行态的一行结论：待确认与成功时给出采纳情况与风险，其余状态给出固定提示。 */
export function briefLine(
  view: AiExecutionViewResponse | undefined,
  status: Status | undefined,
  risk: string,
) {
  if (status === 'waiting_input' || status === 'succeeded') {
    const result = jsonObject(view?.execution.result);
    const decision =
      result.approved === true ? '已采纳' : result.approved === false ? '未采纳' : '报告就绪';
    return [decision, riskLabels[risk]].filter(Boolean).join(' · ');
  }
  if (status === 'queued') return '任务已排队';
  if (status === 'failed' || status === 'timed_out') return '查看失败原因';
  if (status === 'cancelled') return '任务已取消';
  return '';
}

const tools: Record<string, { Icon: IconComponent; glyph: Glyph }> = {
  'publication-scenarios': { Icon: Compass, glyph: 'search' },
  'resource-overview': { Icon: BookOpen, glyph: 'read' },
  'mcp-declarations': { Icon: Plug, glyph: 'read' },
  'list-files': { Icon: FolderOpen, glyph: 'browse' },
  'read-file': { Icon: FileText, glyph: 'read' },
  'search-files': { Icon: Search, glyph: 'search' },
  'scan-findings': { Icon: ShieldCheck, glyph: 'browse' },
  'compare-release': { Icon: GitCompareArrows, glyph: 'browse' },
  'read-feedback': { Icon: MessageSquare, glyph: 'read' },
};

/** 工具调用对应的图标，未登记的工具统一用扳手。 */
export function toolIcon(name: string): IconComponent {
  return tools[name]?.Icon ?? Wrench;
}

/** 流式文本里最新的一句：去掉 Markdown 标记，使状态卡跟随 Agent 当前的思路而不是截断的段尾。 */
export function latestThought(text: string) {
  const sentence = text
    .split(/(?<=[。！？!?；\n])/)
    .map((part) =>
      part
        .replace(/[*_`#>]/g, '')
        .replace(/^\s*(?:[-+]|\d+\.)\s+/, '')
        .trim(),
    )
    .filter(Boolean)
    .at(-1);
  return sentence ?? '';
}

/** 运行中的单个动作，`key` 在同一动作内保持稳定，用于切换动画。 */
export interface BriefAction {
  key: string;
  label: string;
  detail?: string;
  Icon: IconComponent;
  glyph: Glyph;
}

/** 运行中的最近动作：报告整理优先，其次是最新的工具调用或流式思考，最后回退到步骤事件。 */
export function liveAction(view: AiExecutionViewResponse): BriefAction {
  const activity = activityItems(view).at(-1);
  const step = [...view.activity].reverse().find((e) => e.type.startsWith('step.'));
  const stepId = step?.data.step_id;
  if (stepId === 'publication-suggestion' || stepId === 'repair-output')
    return { key: stepId, label: stepLabels[stepId], Icon: ScrollText, glyph: 'report' };
  if (
    stepId === 'assessment' ||
    (activity?.kind === 'message' && activity.block.message_id.startsWith('assessment:'))
  )
    return { key: 'assessment', label: '整理研判报告', Icon: ScrollText, glyph: 'report' };
  if (activity?.kind === 'tool') {
    const tool = tools[activity.name];
    return {
      key: activity.id,
      label: toolLabels[activity.name] ?? activity.name,
      detail: activity.display,
      Icon: tool?.Icon ?? Wrench,
      glyph: tool?.glyph ?? 'work',
    };
  }
  const thought = activity?.kind === 'message' ? latestThought(activity.block.text) : '';
  if (activity?.kind === 'message' && thought)
    return { key: activity.id, label: thought, Icon: Sparkles, glyph: 'think' };
  return {
    key: 'step',
    label: (step && eventLabel(step)) || '正在查阅证据',
    Icon: Search,
    glyph: 'work',
  };
}

/** 侧边状态卡「最近动作」的一行。`thought` 为真时 `label` 是 Agent 的原话而非动作名。 */
export interface TrailItem {
  id: string;
  label: string;
  detail?: string;
  Icon: IconComponent;
  state: 'running' | 'completed' | 'failed' | 'interrupted' | 'waiting';
  thought?: boolean;
  /** 工具调用耗时（毫秒），只有起止事件都在时才有值。 */
  duration?: number;
}

/**
 * 最近 `limit` 条可读动作：工具调用、Agent 思考（取每段输出的最新一句）、报告整理与人工确认。
 * 尚无文字的输出段被跳过；未完成的输出段在执行已不在运行时记为中断。
 */
export function recentTrail(view: AiExecutionViewResponse, limit = 5): TrailItem[] {
  const running = view.execution.status === 'running';
  const items: TrailItem[] = [];
  for (const item of activityItems(view)) {
    if (item.kind === 'tool') {
      const started = item.startedAt ? Date.parse(item.startedAt) : NaN;
      const ended = item.endedAt ? Date.parse(item.endedAt) : NaN;
      items.push({
        id: item.id,
        label: toolLabels[item.name] ?? item.name,
        detail: item.display,
        Icon: tools[item.name]?.Icon ?? Wrench,
        state: item.state,
        duration: Number.isFinite(ended - started) ? Math.max(0, ended - started) : undefined,
      });
    } else if (item.kind === 'message') {
      const state = item.block.complete ? 'completed' : running ? 'running' : 'interrupted';
      if (item.block.message_id.startsWith('assessment:'))
        items.push({ id: item.id, label: '整理研判报告', Icon: ScrollText, state });
      else {
        const thought = latestThought(item.block.text);
        if (thought)
          items.push({ id: item.id, label: thought, Icon: Sparkles, state, thought: true });
      }
    } else {
      const response = jsonObject(item.interaction.response);
      const pending = item.interaction.status === 'pending';
      items.push({
        id: item.id,
        label: '人工确认',
        detail: pending
          ? '等待人工决定'
          : response.approved === true
            ? '已采纳'
            : response.approved === false
              ? '未采纳'
              : '已结束',
        Icon: UserRound,
        state: pending ? 'waiting' : 'completed',
      });
    }
  }
  return items.slice(-limit);
}

/** 计时文案：不足一小时为 `m:ss`，否则 `h:mm:ss`；负值按 0 处理以容忍时钟偏差。 */
export function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
