import { categoryLabel } from '../../shared/format/labels.js';
import { ScenarioSummary } from '../../shared/components/ScenarioSummary.js';
import { BusinessAssessment } from './BusinessAssessment.js';
import { jsonObject, type Json } from './presentation.js';

const strings = (value: Json | undefined) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function fieldText(value: Json | undefined) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** 策略、扫描告警取自冻结记录；模型只能补充已核实的引用和追问。 */
export function PublicationReviewReport({
  value,
  onEvidence,
}: {
  value: Json;
  onEvidence?: (path: string, start: number, end: number) => void;
}) {
  const report = jsonObject(value);
  const snapshot = jsonObject(report.snapshot);
  const before = jsonObject(snapshot.before);
  const after = jsonObject(snapshot.proposed);
  const definitions = Array.isArray(snapshot.proposed_scenarios)
    ? snapshot.proposed_scenarios.flatMap((raw) => {
        const item = jsonObject(raw);
        return typeof item.name === 'string' && typeof item.description === 'string'
          ? [{ name: item.name, description: item.description }]
          : [];
      })
    : [];
  const questions = new Map<string, string>();
  const rawQuestions = jsonObject(report.assessment).warning_questions;
  if (Array.isArray(rawQuestions))
    for (const raw of rawQuestions) {
      const item = jsonObject(raw);
      if (typeof item.finding_id === 'string' && typeof item.question === 'string')
        questions.set(item.finding_id, item.question);
    }
  return (
    <div className="space-y-4 break-words" aria-label="发布审核简报">
      <section className="space-y-2 rounded-xl border border-separator bg-page p-4">
        <h3 className="font-semibold">本次分发变化</h3>
        <p>
          {fieldText(before.visibility_label ?? '首次发布')} →{' '}
          <strong>{fieldText(after.visibility_label)}</strong> · {fieldText(snapshot.changed_files)}{' '}
          个文件变化
        </p>
        <p>
          受众新增 · {fieldText(snapshot.added_audience_label || '无')} · 移除 ·{' '}
          {fieldText(snapshot.removed_audience_label || '无')}
        </p>
        <p>
          申请分类 · {before.category ? categoryLabel(fieldText(before.category)) + ' → ' : ''}
          {categoryLabel(fieldText(after.category))}
        </p>
        {strings(before.scenario_ids).length > 0 && (
          <div>
            基线场景
            <ScenarioSummary policy={{ scenario_ids: strings(before.scenario_ids) }} />
          </div>
        )}
        {(strings(after.scenario_ids).length > 0 || definitions.length > 0) && (
          <div>
            申请场景
            <ScenarioSummary
              policy={{
                scenario_ids: strings(after.scenario_ids),
                proposed_scenarios: definitions,
              }}
            />
          </div>
        )}
        {typeof before.purpose === 'string' && before.purpose !== after.purpose && (
          <p>原共享目的 · {before.purpose}</p>
        )}
        <p>本次共享目的 · {fieldText(after.purpose)}</p>
        {typeof after.requires_api_key === 'boolean' && (
          <p>认证声明 · {after.requires_api_key ? '需要 API Key' : '未声明需要 API Key'}</p>
        )}
        {typeof snapshot.nomination_reason === 'string' && (
          <p>通用提名理由 · {snapshot.nomination_reason}</p>
        )}
      </section>
      <BusinessAssessment value={value} onEvidence={onEvidence} />
      {Array.isArray(report.warnings) && report.warnings.length > 0 && (
        <details className="rounded-xl border border-separator p-4" open>
          <summary className="cursor-pointer font-semibold">
            本次扫描告警 · {report.warnings.length} 项
          </summary>
          <ul className="mt-3 space-y-3">
            {report.warnings.map((raw) => {
              const item = jsonObject(raw);
              const id = fieldText(item.finding_id);
              const path = fieldText(item.file);
              const line = typeof item.line === 'number' ? item.line : 0;
              return (
                <li className="space-y-1" key={id}>
                  {onEvidence && line > 0 ? (
                    <button
                      type="button"
                      className="text-brand underline"
                      onClick={() => onEvidence(path, line, line)}
                    >
                      {path}:{line}
                    </button>
                  ) : (
                    <span>
                      {path}
                      {line > 0 && ':' + line}
                    </span>
                  )}
                  <p>{fieldText(item.evidence_summary)}</p>
                  <p>{questions.get(id) ?? '请人工核对该告警的用途、影响和接受依据。'}</p>
                  <small className="break-all font-mono text-muted-ink">{id}</small>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <details className="text-caption text-muted-ink">
        <summary className="cursor-pointer">核对简报依据</summary>
        <dl className="mt-2 grid gap-2 break-all">
          {[
            ['申请', snapshot.publication_request_id],
            ['申请修订', snapshot.request_revision],
            ['内容摘要', snapshot.content_digest],
            ['策略摘要', snapshot.policy_digest],
            ['发布基线', snapshot.base_release_id ?? '首次发布'],
            ['扫描记录', snapshot.scan_run_id],
            ['扫描规则', snapshot.ruleset_version],
          ].map(([label, item]) => (
            <div key={fieldText(label)}>
              <dt>{fieldText(label)}</dt>
              <dd>{fieldText(item)}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
