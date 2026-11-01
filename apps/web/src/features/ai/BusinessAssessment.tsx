/**
 * 研判报告呈现组件：消费 Agent 产出（或人工交互 `request.assessment`）的 JSON 结果，
 * 渲染风险摘要、发现项、检查范围与局限，并用 {@link reportSuggestion} 判断是否带有发布建议。
 *
 * 入参为未校验的 `Json`，内部逐字段做类型收敛，缺字段时降级为「待核实」而非报错。
 */
import { reportSuggestion } from './publication-suggestion.js';
import { SuggestionPreview } from './SuggestionPreview.js';
import { AiText } from './AiText.js';
import { jsonObject, type Json } from './presentation.js';
import { ShieldCheck, FileText, Info } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { resultCardStyles } from './styles.js';

function label(value: Json | undefined) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

const risks: Record<string, string> = {
  low: '较低风险',
  medium: '需要关注',
  high: '高风险',
  unknown: '证据不足',
};

/**
 * 报告主体：`value` 为整份报告对象，`assessment` 缺失时各区块自动隐藏；
 * 已采纳但没有 `publication_suggestion` 的历史报告会提示改在新研判中重新生成。
 */
export function BusinessAssessment({ value }: { value: Json }) {
  const suggestion = reportSuggestion(value);
  const report = jsonObject(value);
  const assessment = jsonObject(report.assessment);
  const findings = Array.isArray(assessment.findings) ? assessment.findings : [];
  const inspected = Array.isArray(report.inspected) ? report.inspected : [];
  const limitations = Array.isArray(assessment.limitations) ? assessment.limitations : [];
  return (
    <div className="min-w-0 space-y-5 [overflow-wrap:anywhere]" aria-label="业务研判报告">
      <section className="rounded-2xl border border-brand/20 bg-brand-soft/40 p-4 @min-[640px]/execution:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-section">
            <ShieldCheck size={19} />
            研判摘要
          </h3>
          <span
            className={cn(
              'rounded-full px-3 py-1 text-caption font-semibold',
              assessment.risk === 'high' ? 'bg-danger-soft text-danger' : 'bg-paper text-brand',
            )}
          >
            {risks[label(assessment.risk)] ?? '待核实'}
          </span>
        </div>
        {typeof assessment.summary === 'string' && <AiText text={assessment.summary} />}
        {typeof report.approved === 'boolean' && (
          <p className="mt-4 border-t border-brand/15 pt-3 font-medium">
            {report.approved ? '人工已采纳' : '人工未采纳'}
            {report.feedback_applied === true ? ' · 已写入反馈处理建议' : ''}
          </p>
        )}
        {typeof report.comment === 'string' && report.comment && (
          <p className="mt-2 whitespace-pre-wrap">{report.comment}</p>
        )}
      </section>
      {suggestion && <SuggestionPreview fields={suggestion} />}
      {!suggestion && !report.feedback_id && report.approved === true && (
        <p className="rounded-xl border border-separator p-3 text-caption text-muted-ink">
          这份历史报告未生成发布建议。在「任务记录与模型设置」中发起新研判，即可生成分类、关键词和共享目的。
        </p>
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold">发现与建议</h3>
        <span className="text-muted-ink">
          {findings.length} 项发现 · {new Set(inspected.map((item) => jsonObject(item).path)).size}{' '}
          个已读文件
        </span>
      </div>
      {!findings.length && (
        <p className="text-muted-ink">本次检查未形成具体问题项；请结合下方检查范围与局限判断。</p>
      )}
      {findings.map((raw, index) => {
        const finding = jsonObject(raw);
        return (
          <section key={index} className={cn(resultCardStyles, 'p-5')}>
            <div className="mb-3 flex items-start gap-3">
              <span className="font-mono text-brand">{label(index + 1).padStart(2, '0')}</span>
              <h4 className="flex-1 font-semibold">{label(finding.title ?? '')}</h4>
              <span
                className={cn(
                  'rounded px-2 py-1 text-caption',
                  finding.severity === 'critical'
                    ? 'bg-danger-soft text-danger'
                    : 'bg-warning-soft text-warning',
                )}
              >
                {finding.severity === 'critical'
                  ? '严重'
                  : finding.severity === 'warning'
                    ? '需关注'
                    : '说明'}
              </span>
            </div>
            {typeof finding.explanation === 'string' && <AiText text={finding.explanation} />}
            <div className="mt-4 rounded-lg bg-page p-3">
              <p className="mb-1 font-medium">建议行动</p>
              <p className="whitespace-pre-wrap">{label(finding.recommendation ?? '')}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Array.isArray(finding.evidence) ? finding.evidence : []).map((raw, index) => {
                const item = jsonObject(raw);
                return (
                  <span
                    key={index}
                    className="inline-flex max-w-full items-center gap-1.5 rounded border border-[color:var(--line)] px-2 py-1 font-mono text-caption"
                  >
                    <FileText size={12} />
                    <span className="break-all">
                      {label(item.path)}:{label(item.start_line)}–{label(item.end_line)}
                    </span>
                  </span>
                );
              })}
            </div>
          </section>
        );
      })}
      <section className="rounded-xl border border-[color:var(--line)] p-5">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Info size={16} />
          检查范围与待验证事项
        </h3>
        <p className="mb-3 text-muted-ink">
          以下为实际读取范围，审计建议不代表执行验证或发布批准。
        </p>
        <div className="flex flex-wrap gap-2">
          {inspected.map((raw, index) => {
            const item = jsonObject(raw);
            return (
              <code key={index} className="break-all rounded bg-page px-2 py-1 text-caption">
                {label(item.path)}:{label(item.start_line)}–{label(item.end_line)}
              </code>
            );
          })}
        </div>
        {limitations.length > 0 && (
          <ul className="mt-4 list-disc space-y-2 pl-5">
            {limitations.map((item, index) => (
              <li key={index}>{label(item)}</li>
            ))}
          </ul>
        )}
      </section>
      {typeof assessment.suggested_resolution === 'string' && (
        <section className="rounded-xl border-l-2 border-brand bg-page p-5">
          <h3 className="mb-2 font-semibold">建议处理说明</h3>
          <AiText text={assessment.suggested_resolution} />
        </section>
      )}
    </div>
  );
}
