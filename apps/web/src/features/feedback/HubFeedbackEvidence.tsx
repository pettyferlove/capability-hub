import {
  hubFeedbackAreas,
  hubFeedbackKinds,
  hubFeedbackStatuses,
  hubFeedbackSurfaces,
} from '@capability-hub/contracts';
import type { HubFeedbackDetailResponse } from '@capability-hub/contracts/http';
import type { ReactNode } from 'react';
import { CopyButton } from '../../shared/components/CopyButton.js';
import { bytesLabel } from '../../shared/format/labels.js';
import { cn } from '../../shared/styles/cn.js';
import { monoStyles, subtleStyles } from '../../shared/styles/recipes.js';
import { feedbackChannels } from './HubFeedbackList.js';

const diagnosticLabels: Readonly<Record<string, string>> = {
  kind: '客户端',
  page: '页面',
  query: '页面参数',
  web_build: '网页构建',
  hub_version: 'Hub 版本',
  asset_slug: '资产标识',
  viewport: '窗口尺寸',
  width: '宽',
  height: '高',
  device_pixel_ratio: '像素比',
  theme: '外观模式',
  palette: '配色',
  reduced_motion: '减少动态效果',
  language: '语言',
  timezone: '时区',
  online: '网络在线',
  failed_requests: '失败请求',
  page_errors: '页面错误',
  at: '时间',
  method: '方法',
  path: '路径',
  status: 'HTTP 状态',
  code: '错误码',
  request_id: '请求编号',
  telemetry_session_id: '浏览器诊断会话',
  event: '事件',
  type: '错误类型',
  stack: '调用栈',
  cli_version: 'CLI 版本',
  node_version: 'Node.js 版本',
  platform: '平台',
  arch: '架构',
  os_release: '系统版本',
  interactive: '交互模式',
  ci: 'CI 环境',
  yes: '自动确认',
  credential_type: '凭据类型',
  hub_origin: 'Hub 地址',
  last_failure: '最近失败命令',
  command: '命令',
  options: '选项',
  arguments: '参数',
  exit_code: '退出码',
  message: '错误信息',
};

const fieldGrid = 'grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-label';

function EvidenceField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-ink">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{children}</dd>
    </>
  );
}

function DiagnosticFieldList({ value }: { value: object }) {
  return (
    <dl className={fieldGrid}>
      {Object.entries(value as Record<string, unknown>).map(([key, data]) => (
        <EvidenceField key={key} label={diagnosticLabels[key] ?? key}>
          <DiagnosticValue name={key} value={data} />
        </EvidenceField>
      ))}
    </dl>
  );
}

function DiagnosticValue({ name, value }: { name: string; value: unknown }) {
  if (Array.isArray(value)) {
    const items: unknown[] = value;
    return items.length ? (
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="border-l border-line pl-2">
            <DiagnosticValue name={name} value={item} />
          </li>
        ))}
      </ul>
    ) : (
      '无'
    );
  }
  if (typeof value === 'object' && value !== null) return <DiagnosticFieldList value={value} />;
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value !== 'string' && typeof value !== 'number') return '—';
  if (typeof value === 'string' && (name === 'request_id' || name === 'telemetry_session_id')) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <code className={monoStyles}>{value}</code>
        <CopyButton text={value} label={name === 'request_id' ? '复制请求编号' : '复制会话编号'} />
      </span>
    );
  }
  return value;
}

export function HubFeedbackEvidence({ detail }: { detail: HubFeedbackDetailResponse }) {
  const { submission, submitter, diagnostics } = detail;
  const client = submission?.client;
  const browser = [client?.browser_name, client?.browser_version].filter(Boolean).join(' ');
  return (
    <div className="space-y-3 rounded-xl border border-line bg-page px-4 py-3">
      {submission && (
        <details>
          <summary className="cursor-pointer text-label font-medium">提交上下文</summary>
          <dl className={cn(fieldGrid, 'mt-3')}>
            <EvidenceField label="提交人">
              {submitter
                ? `${submitter.display_name} · ${submitter.auth_provider === 'ldap' ? 'LDAP 账号' : '本地账号'}`
                : '账号不可用'}
            </EvidenceField>
            <EvidenceField label="渠道">{feedbackChannels[submission.channel]}</EvidenceField>
            <EvidenceField label="凭据">
              {submission.credential_type === 'session' ? '网页会话' : '个人访问令牌'}
              {submission.token_name && ` · ${submission.token_name}`}
            </EvidenceField>
            <EvidenceField label="提交时间">
              <time dateTime={submission.received_at}>
                {new Date(submission.received_at).toLocaleString('zh-CN')}
              </time>
            </EvidenceField>
            <EvidenceField label="Hub 版本">{submission.hub_version}</EvidenceField>
            <EvidenceField label="Hub 提交">{submission.hub_commit}</EvidenceField>
            <EvidenceField label="网页构建">{submission.web_build ?? '—'}</EvidenceField>
            <EvidenceField label="浏览器">{browser || '—'}</EvidenceField>
            <EvidenceField label="系统">{client?.os_name ?? '—'}</EvidenceField>
            <EvidenceField label="提交请求编号">
              <DiagnosticValue name="request_id" value={submission.request_id} />
            </EvidenceField>
          </dl>
        </details>
      )}
      <details>
        <summary className="cursor-pointer text-label font-medium">诊断信息</summary>
        <div className="mt-3 space-y-3">
          {diagnostics ? (
            <DiagnosticFieldList value={diagnostics.client} />
          ) : (
            <p className={subtleStyles}>提交人未附上客户端诊断。</p>
          )}
          {submission && (
            <p className={subtleStyles}>
              在服务端日志中按 <code className={monoStyles}>request_id</code> 检索。
              {detail.channel === 'web' && (
                <>
                  网页反馈也可按 <code className={monoStyles}>telemetry_session_id</code>{' '}
                  查找浏览器诊断。
                </>
              )}
            </p>
          )}
        </div>
      </details>
    </div>
  );
}

function markdownBlock(label: string, text: string, language = '') {
  const longest = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 2);
  const fence = '`'.repeat(longest + 1);
  return `## ${label}\n\n${fence}${language}\n${text}\n${fence}`;
}

export function hubFeedbackMarkdown(detail: HubFeedbackDetailResponse) {
  const internal = new Set(
    detail.events.filter((event) => event.visibility === 'internal').map((event) => event.id),
  );
  const attachments = detail.attachments
    .filter((file) => !file.event_id || !internal.has(file.event_id))
    .map(
      (file) =>
        `${file.name} (${file.media_type}, ${bytesLabel(file.size)})${file.removed_at ? '，已移除' : ''}`,
    )
    .join('\n');
  return [
    `# 平台反馈 #${detail.number}`,
    markdownBlock('标题', detail.title),
    `${hubFeedbackStatuses[detail.status]} · ${hubFeedbackKinds[detail.kind]} · ${hubFeedbackSurfaces[detail.surface]}${detail.area ? ` / ${hubFeedbackAreas[detail.area]}` : ''}`,
    markdownBlock('问题描述', detail.description_redacted_at ? '内容已隐去' : detail.description),
    detail.steps && markdownBlock('复现步骤', detail.steps),
    detail.expected && markdownBlock('预期结果', detail.expected),
    detail.submission?.request_id && `提交请求编号：\`${detail.submission.request_id}\``,
    detail.diagnostics &&
      markdownBlock('诊断信息', JSON.stringify(detail.diagnostics, null, 2), 'json'),
    markdownBlock('附件清单', attachments || '无'),
  ]
    .filter(Boolean)
    .join('\n\n');
}
