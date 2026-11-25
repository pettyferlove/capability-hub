import type { AiCallFailureReason } from '@capability-hub/contracts';
import {
  factsText,
  issuePath,
  issueRule,
  rejectionLabel,
  type OutputCheck,
} from './call-failure.js';

/** 输出被拒的结论只含固定分类、规则说明与字段位置，不含模型原文。 */
export function OutputRejection({
  check,
  reason,
  limit,
}: {
  check: OutputCheck;
  reason?: AiCallFailureReason;
  /** 终止卡片只列出前几项字段问题，表格行展示全部。 */
  limit?: number;
}) {
  const issues = check.issues ?? [];
  const shown = limit === undefined ? issues : issues.slice(0, limit);
  const meta = [check.rule && '规则 ' + check.rule, factsText(check.facts)].filter(Boolean);
  return (
    <div className="min-w-0 space-y-1">
      <strong className="block font-medium text-danger">
        输出被拒：{rejectionLabel(check, reason)}
      </strong>
      {check.message && <p className="[overflow-wrap:anywhere]">{check.message}</p>}
      {!!meta.length && (
        <p className="font-mono text-caption text-muted-ink [overflow-wrap:anywhere]">
          {meta.join(' · ')}
        </p>
      )}
      {check.json_offset !== undefined && (
        <p className="text-caption">解析停在第 {check.json_offset} 个字符</p>
      )}
      {!!shown.length && (
        <ul aria-label="字段问题" className="space-y-0.5 text-caption">
          {shown.map((issue, index) => (
            <li key={index} className="[overflow-wrap:anywhere]">
              <code className="font-mono">{issuePath(issue.path)}</code>{' '}
              <span>{issueRule(issue)}</span>
            </li>
          ))}
          {issues.length > shown.length && (
            <li className="text-muted-ink">另有 {issues.length - shown.length} 项字段问题</li>
          )}
        </ul>
      )}
    </div>
  );
}
