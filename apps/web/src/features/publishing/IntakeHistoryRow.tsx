import {
  intakeHistoryRowStyles,
  intakeContentGlyphStyles,
  intakeHistoryMainStyles,
  intakeHistoryTitleStyles,
  intakeKindStyles,
  intakeHistoryMetaStyles,
  intakeHistoryErrorStyles,
  intakeHistoryPhaseStyles,
  intakeHistoryDigestStyles,
  intakeHistoryStatusStyles,
  isErrorStyles,
  intakeRowArrowStyles,
} from './styles.js';
import { activeStyles, monoStyles, spinStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import type { IntakeListItemResponse } from '@capability-hub/contracts/http';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GitBranch,
  LoaderCircle,
  UploadCloud,
  Ban,
} from '../../shared/icons/lucide.js';
import { Glyph } from '../../shared/components/Glyph.js';
import { dateLabel } from '../../shared/format/labels.js';

export const statusLabels: Record<string, string> = {
  processing: '处理中',
  ready: '待提交审核',
  pending: '待审核',
  approved: '已审核发布',
  failed: '处理失败',
  rejected: '已退回',
  stale: '已失效',
  cancelled: '已撤回',
  deprecated: '资产已弃用',
  blocked: '资产已封禁',
};

export function IntakeHistoryRow({
  item,
  active,
  onSelect,
}: {
  item: IntakeListItemResponse;
  active?: boolean;
  onSelect: (id: string) => void;
}) {
  const error = item.status === 'failed' || item.status === 'rejected';
  const processing = item.status === 'processing';
  const StatusIcon = processing
    ? LoaderCircle
    : error
      ? AlertCircle
      : item.status === 'approved'
        ? CheckCircle2
        : ['stale', 'cancelled', 'deprecated', 'blocked'].includes(item.status)
          ? Ban
          : Clock3;
  const SourceIcon = item.source_kind === 'git' ? GitBranch : UploadCloud;
  return (
    <button
      type="button"
      className={cn(intakeHistoryRowStyles, active ? activeStyles : '')}
      data-status={item.status}
      onClick={() => onSelect(item.id)}
      aria-label={`${item.asset_slug} ${item.version_label} · ${statusLabels[item.status]} · ${dateLabel(item.created_at)}`}
    >
      <span
        className={intakeContentGlyphStyles}
        aria-hidden="true"
        title={item.content_digest ?? '内容摘要尚未生成'}
      >
        <Glyph
          seed={item.content_digest ?? item.asset_id}
          kind={item.kind}
          size={32}
          animate={false}
        />
      </span>
      <span className={intakeHistoryMainStyles}>
        <span className={intakeHistoryTitleStyles}>
          <strong>{item.asset_slug}</strong>
          <span className={intakeKindStyles}>{item.kind === 'skill' ? 'Skill' : 'MCP'}</span>
        </span>
        <span className={intakeHistoryMetaStyles}>
          <span className={monoStyles}>{item.version_label}</span>
          <span>
            <SourceIcon size={12} />
            {item.source_kind === 'git' ? 'Git 同步' : '文件上传'}
          </span>
          <time dateTime={item.created_at}>{dateLabel(item.created_at)}</time>
        </span>
        {item.status === 'failed' && item.error_message ? (
          <span className={intakeHistoryErrorStyles}>{item.error_message}</span>
        ) : processing ? (
          <span className={intakeHistoryPhaseStyles}>{item.phase}</span>
        ) : item.content_digest ? (
          <span className={cn(intakeHistoryDigestStyles, monoStyles)}>
            {item.content_digest.replace(/^sha256:/, '').slice(0, 12)}
            {item.file_count !== null && <span> · {item.file_count} 个文件</span>}
          </span>
        ) : null}
      </span>
      <span className={cn(intakeHistoryStatusStyles, error ? isErrorStyles : '')}>
        <StatusIcon size={13} className={processing ? spinStyles : undefined} />
        {statusLabels[item.status]}
      </span>
      <ChevronRight size={14} className={intakeRowArrowStyles} aria-hidden="true" />
    </button>
  );
}
