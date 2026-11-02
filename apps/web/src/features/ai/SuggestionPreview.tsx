import type { PublicationSuggestion } from '@capability-hub/contracts';
import { categoryLabels } from './publication-suggestion.js';
import { ScenarioSummary } from '../../shared/components/ScenarioSummary.js';

/**
 * 发布建议的只读预览：分类、关键词与用途，不接受编辑；写入表单由调用方负责。
 */
export function SuggestionPreview({ fields }: { fields: PublicationSuggestion }) {
  return (
    <section
      className="grid gap-3 rounded-xl border border-brand/20 bg-brand-soft/35 p-4"
      aria-label="建议发布信息"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">建议发布信息</h3>
        <span className="text-caption text-brand">分类 · {categoryLabels[fields.category]}</span>
      </div>
      {fields.category === 'scenario' && <ScenarioSummary policy={fields} />}
      {fields.scenario_reason && <p>{fields.scenario_reason}</p>}
      <div className="flex flex-wrap gap-1.5">
        {fields.keywords.map((word) => (
          <span
            key={word}
            className="max-w-full break-words rounded-full border border-brand/15 bg-paper px-2.5 py-1 text-caption"
          >
            {word}
          </span>
        ))}
      </div>
      <p className="break-words leading-relaxed">{fields.purpose}</p>
    </section>
  );
}
