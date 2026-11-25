import { AiError, OutputRejectedError } from '@capability-hub/ai';
import type { EvaluationPool, EvaluationStageResult } from '@capability-hub/application';
import type { RecordStore } from '@capability-hub/application/ports';
import { sha256 } from '@capability-hub/domain/canonical';
import {
  evaluationContentBudget,
  evaluationThresholds,
  triggeringResult,
} from '@capability-hub/domain/evaluation';
import type { ResourceEvaluationRecord, VersionRecord } from '@capability-hub/domain/models';
import {
  routingInstructions,
  routingSchema,
  triggerCasesInstructions,
  triggerCasesSchema,
} from '@capability-hub/hub-agents';
import type { z } from 'zod';
import { fitJsonFields, fitLines, wireTextBytes, type EvaluationCall } from './model-input.js';
import { redactedLine, redactedLines } from './skill-packing.js';

type TriggerCases = NonNullable<ResourceEvaluationRecord['cases']>['trigger'];
type Choices = Awaited<ReturnType<EvaluationPool['choices']>>;
const limits = evaluationThresholds.triggering;

/** 两类请求共享去重集合，署名或错标语言的问句不能证明路由能力。 */
export function filterTriggerCases(raw: z.infer<typeof triggerCasesSchema>['cases'], slug: string) {
  const seen = new Set<string>();
  const cases: TriggerCases = [];
  const counts = new Map<string, number>();
  const name = slug.normalize('NFKC').toLowerCase();
  const spacedName = name.replaceAll('-', ' ');
  let implicit = 0;
  for (const candidate of raw) {
    const query = candidate.query.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    const key = query.toLowerCase();
    const length = [...query].length;
    if (
      length < limits.minChars ||
      length > limits.maxChars ||
      seen.has(key) ||
      key.includes(name) ||
      key.includes(spacedName)
    )
      continue;
    const han = query.match(/\p{Script=Han}/gu)?.length ?? 0;
    const words = query.match(/\p{Script=Latin}+/gu)?.length ?? 0;
    if (candidate.language === 'zh' ? !han : !words || words < han) continue;
    const group = candidate.kind + '/' + candidate.language;
    const count = counts.get(group) ?? 0;
    const maximum = candidate.language === 'zh' ? limits.chinesePerKind : limits.englishPerKind;
    if (count >= maximum) continue;
    seen.add(key);
    counts.set(group, count + 1);
    cases.push({
      id: 'q' + (cases.length + 1),
      kind: candidate.kind,
      language: candidate.language,
      query,
    });
    if (candidate.kind === 'should_trigger' && candidate.implicit) implicit++;
  }
  const positive = cases.filter((item) => item.kind === 'should_trigger').length;
  const negative = cases.length - positive;
  return {
    cases,
    positive,
    negative,
    sufficient: implicit >= limits.minImplicit && Math.min(positive, negative) >= limits.minPerKind,
  };
}

/** 题目只从正文、直接引用及包内路径生成；资源名由服务端在收回题目后使用。 */
export async function generateTriggerCases(
  call: EvaluationCall,
  pool: EvaluationPool,
  row: ResourceEvaluationRecord,
  version: VersionRecord,
  material: string,
  limited = false,
): Promise<EvaluationStageResult> {
  const directory = version.files.map((file) => redactedLines(file.path)[0] + '\n').join('');
  const prefix = '<材料>\n文件目录\n';
  const heading = '正文与直接引用\n';
  const end = '</材料>';
  const available = evaluationContentBudget - wireTextBytes(prefix + heading + end);
  const directoryBudget = Math.max(Math.floor(available / 8), available - wireTextBytes(material));
  const sentDirectory = fitLines(directory, directoryBudget);
  const sentMaterial = fitLines(material, available - wireTextBytes(sentDirectory));
  const coverageLimited =
    limited ||
    sentMaterial !== material ||
    directory !== sentDirectory ||
    directory.includes(redactedLine);
  const generated = await call(
    'trigger-cases',
    triggerCasesInstructions,
    prefix + sentDirectory + heading + sentMaterial + end,
    triggerCasesSchema,
  );
  const result = filterTriggerCases(generated.cases, version.metadata.name);
  const context = await pool.select(row, version);
  return {
    cases: { trigger: result.cases, tasks: row.cases?.tasks ?? [] },
    context,
    coverageLimited,
    ...(!result.sufficient && {
      dimension: {
        ...triggeringResult(0, result.positive, 0, result.negative, coverageLimited),
        status: 'insufficient',
        score: null,
        confidence: null,
        checks: [],
      },
    }),
  };
}

function routingInput(query: string, options: Choices, seed: string) {
  const ordered = options
    .map((option) => ({ ...option, key: sha256(seed + '|' + option.name) }))
    .sort((a, b) => a.key.localeCompare(b.key));
  const choices = ordered.map(({ name }) => ({ name, description: '' }));
  const budget = evaluationContentBudget - wireTextBytes(JSON.stringify({ query, choices }));
  const descriptions = fitJsonFields(
    ordered.map((option) => option.description),
    budget,
  );
  choices.forEach((choice, i) => {
    choice.description = descriptions[i];
  });
  return {
    input: JSON.stringify({ query, choices }),
    limited: ordered.some((option, i) => option.description !== descriptions[i]),
  };
}

/** 路由只派发名录快照的可见字段。提交出站预占时重新确认干扰项的受众。 */
export async function routeCases(
  call: EvaluationCall,
  pool: EvaluationPool,
  store: RecordStore,
  row: ResourceEvaluationRecord,
  version: VersionRecord,
  description: (version: VersionRecord) => Promise<string>,
): Promise<EvaluationStageResult> {
  const cases = row.cases?.trigger ?? [];
  if (
    !cases.length ||
    row.dimensions.find((dim) => dim.id === 'triggering')?.status === 'insufficient'
  )
    return { skipped: true };
  const snapshot = await store.tx(async () => ({
    revision: await store.revision(),
    options: await pool.choices(row, version),
  }));
  const options = await Promise.all(
    snapshot.options.map(async (option) => ({
      ...option,
      description: option.version ? await description(option.version) : option.description,
    })),
  );
  let visibleRevision = snapshot.revision;
  const selected = options.flatMap((choice) => (choice.releaseId ? [choice.releaseId] : []));
  const authorize = async () => {
    if (!selected.length) return;
    const revision = await store.revision();
    // 资产、发布、来源和版本变更都会推进目录修订，同一修订可复用上次的冻结名录授权。
    if (revision === visibleRevision) return;
    const current = await pool.choices(row, version);
    const visible = new Set(current.map((choice) => choice.releaseId));
    if (selected.some((id) => !visible.has(id)))
      throw new AiError('AI_FORBIDDEN', '干扰项的分发范围已改变');
    visibleRevision = revision;
  };
  let limited =
    row.stages.some((stage) => stage.id === 'trigger-cases' && stage.coverage_limited) ||
    options.some((option, index) => option.description !== snapshot.options[index].description);
  const resources = options.flatMap((option) => (option.version ? [option.version.id] : []));
  let hit = 0;
  let avoided = 0;
  const confusions: NonNullable<ResourceEvaluationRecord['confusions']> = [];
  for (let start = 0; start < cases.length; start += 2) {
    const results = await Promise.allSettled(
      cases.slice(start, start + 2).map(async (item, offset) => {
        const seed = sha256(row.id + '|' + (start + offset));
        const request = routingInput(item.query, options, seed);
        const result = await call(
          'trigger-routing',
          routingInstructions,
          request.input,
          routingSchema,
          {
            authorize,
            resources,
            accept: ({ choice }) => {
              if (choice !== null && !options.some((option) => option.name === choice))
                throw new OutputRejectedError('routing-choice', '选择不在本轮候选清单', {
                  candidates: options.length,
                });
            },
          },
        );
        const picked = options.find((option) => option.name === result.choice);
        return { item, picked, limited: request.limited };
      }),
    );
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
      const { item, picked } = result.value;
      limited ||= result.value.limited;
      if (item.kind === 'should_trigger') {
        if (picked?.name === version.metadata.name) hit++;
        else if (picked?.releaseId)
          confusions.push({ case_id: item.id, release_id: picked.releaseId });
      } else if (picked?.name !== version.metadata.name) {
        avoided++;
      }
    }
  }
  const positive = cases.filter((item) => item.kind === 'should_trigger').length;
  return {
    dimension: triggeringResult(hit, positive, avoided, cases.length - positive, limited),
    confusions,
    coverageLimited: limited,
    ...(row.context && { context: { ...row.context, distractor_release_ids: selected } }),
  };
}
