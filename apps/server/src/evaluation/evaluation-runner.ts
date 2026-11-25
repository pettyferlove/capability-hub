import {
  AiError,
  OutputRejectedError,
  digest as profileDigest,
  type AiRuntime,
} from '@capability-hub/ai';
import {
  stageDimension,
  type EvaluationService,
  type EvaluationPool,
  type EvaluationStageResult,
} from '@capability-hub/application';
import type {
  BlobStorage,
  RecordStore,
  SkillStaticAnalyzer,
} from '@capability-hub/application/ports';
import { canonical, digest } from '@capability-hub/domain/canonical';
import {
  evaluationRubricVersion,
  evaluationRubric,
  instructionResult,
} from '@capability-hub/domain/evaluation';
import { fail, HubError } from '@capability-hub/domain/errors';
import { contentText } from '@capability-hub/domain/files';
import type { ContentFile } from '@capability-hub/domain/content';
import type {
  JobRecord,
  ResourceEvaluationRecord,
  VersionRecord,
} from '@capability-hub/domain/models';
import {
  resourceEvaluationOperation,
  instructionReviewInstructions,
  instructionReviewSchema,
  transparencyInstructions,
  transparencySchema,
} from '@capability-hub/hub-agents';
import type { ServerConfig } from '../config/server-config.js';
import { generateTriggerCases, routeCases } from './triggering.js';
import { generateTasks, runTask } from './task-runs.js';
import { sentEvidence, type EvaluationCall } from './model-input.js';
import { credentialFinding, packSkill, redactedLine, redactedLines } from './skill-packing.js';
import { scanHints, scoreTransparency } from './transparency.js';

type EvaluationJob = Extract<JobRecord, { kind: 'resource_evaluation' }>;

/** 把实际默认档案与操作版本冻结到摘要；关闭日额度时不选择档案。 */
export function evaluationModel(config: ServerConfig, runtime: AiRuntime) {
  const profile = runtime.config.profiles.find((p) => p.id === runtime.config.default_profile);
  if (!config.evaluationDailyRequests || !profile) return null;
  return {
    profileId: profile.id,
    digest: digest(
      canonical([
        evaluationRubricVersion,
        resourceEvaluationOperation.id,
        resourceEvaluationOperation.version,
        profileDigest(profile),
      ]),
    ),
  };
}

/** 每次认领只处理一个固定版本阶段，内容 I/O 和模型等待均在业务写事务之外。 */
export class EvaluationRunner {
  constructor(
    private readonly store: RecordStore,
    private readonly blobs: BlobStorage,
    private readonly evaluations: EvaluationService,
    private readonly analyze: SkillStaticAnalyzer,
    private readonly runtime: AiRuntime,
    private readonly pool: EvaluationPool,
  ) {}

  private async read(ref: string) {
    try {
      return await this.blobs.read(ref);
    } catch (error) {
      if (error instanceof HubError && error.status >= 500)
        throw new HubError(error.status, error.code, error.message, error.details, true);
      throw error;
    }
  }

  async process(job: EvaluationJob, signal = new AbortController().signal) {
    const row = await this.evaluations.stages.prepare(job);
    if (typeof row === 'string') return row;
    const version = await this.store.get('versions', row.version_id);
    if (!version) fail(409, 'EVALUATION_UNAVAILABLE', '评测版本已删除');
    if (job.input.stage === 'static') {
      const files: ContentFile[] = [];
      for (const file of version.files)
        files.push({
          path: file.path,
          executable: file.executable,
          bytes: await this.read(file.blob_ref),
        });
      return this.evaluations.stages.complete(job, { dimension: await this.analyze(files) });
    }
    return this.runModel(job, row, version, signal);
  }

  private async routingDescription(version: VersionRecord) {
    const description = version.metadata.description;
    if (redactedLines(description).includes(redactedLine)) return redactedLine;
    const file = version.files.find((item) => item.path === 'SKILL.md');
    const root = file && contentText(await this.read(file.blob_ref));
    const front = root?.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (!front) return redactedLine;
    const scans = await this.store.where('scans', 'version_id', version.id);
    const known = new Set(
      scans.flatMap((scan) =>
        scan.findings
          .filter((finding) => finding.file === 'SKILL.md' && credentialFinding(finding))
          .map((finding) => 'SKILL.md:' + finding.line),
      ),
    );
    // 扫描命中可能缺失或截断，头部按当前规则重检；YAML 折叠和别名会丢失来源行映射，头部任一行敏感即隐去描述。
    return redactedLines(front[0], 'SKILL.md', known).includes(redactedLine)
      ? redactedLine
      : description;
  }

  private async modelStage(
    call: EvaluationCall,
    stage: string,
    row: ResourceEvaluationRecord,
    version: VersionRecord,
  ): Promise<EvaluationStageResult> {
    if (stage === 'trigger-routing')
      return routeCases(call, this.pool, this.store, row, version, (option) =>
        this.routingDescription(option),
      );
    const scans = await this.store.where('scans', 'version_id', version.id);
    const findings =
      scans
        .filter((scan) => scan.ruleset_version === row.scan_ruleset && scan.state === 'passed')
        .sort((a, b) => b.finished_at.localeCompare(a.finished_at) || b.id.localeCompare(a.id))[0]
        ?.findings ?? [];
    const secretLines = new Set(
      scans.flatMap((scan) =>
        scan.findings.filter(credentialFinding).map((finding) => finding.file + ':' + finding.line),
      ),
    );
    const files = new Map(version.files.map((file) => [file.path, file]));
    const read = async (path: string, maxBytes = Infinity) => {
      const file = files.get(path);
      return file && file.size <= maxBytes ? this.read(file.blob_ref) : undefined;
    };
    const packed = await packSkill(read, secretLines, stage !== 'trigger-cases');
    if (stage === 'trigger-cases')
      return generateTriggerCases(call, this.pool, row, version, packed.material, packed.limited);
    const scriptCount = row.dimensions.find((d) => d.id === 'structure')?.metrics?.scripts;
    const hasScripts =
      scriptCount === undefined ? version.metadata.has_scripts === true : scriptCount > 0;
    if (stage === 'instructions') {
      const criteria = evaluationRubric.instructions.checks.map(({ id, criterion }) => ({
        id,
        criterion,
      }));
      const input =
        JSON.stringify({ checks: criteria, bundled_scripts: scriptCount }) +
        '\n<材料>\n' +
        packed.material +
        '</材料>';
      const samples = [];
      for (let i = 0; i < 2; i++) {
        const result = await call(
          'instructions',
          instructionReviewInstructions,
          input,
          instructionReviewSchema,
          {
            // 未知 ID 已由 Schema 枚举拒绝，这里只剩重复项导致的缺项。
            accept: ({ checks }) => {
              const ids = new Set(checks.map((c) => c.id));
              if (ids.size !== criteria.length)
                throw new OutputRejectedError('rubric-ids', '指令质量检查项不完整', {
                  expected: criteria.length,
                  distinct: ids.size,
                });
            },
          },
        );
        samples.push(
          result.checks.map((c) => ({ ...c, evidence: sentEvidence(c.evidence, packed.ranges) })),
        );
      }
      return { dimension: instructionResult(samples, packed.limited, scriptCount) };
    }
    if (stage === 'task-cases' || /^task-run-[1-4]$/.test(stage)) {
      const materialDigests = new Set(
        [...packed.materialFiles].map((path) => files.get(path)?.sha256),
      );
      const materialFiles = new Set(
        version.files.filter((file) => materialDigests.has(file.sha256)).map((file) => file.path),
      );
      return stage === 'task-cases'
        ? generateTasks(
            call,
            row,
            read,
            packed.material,
            packed.limited,
            secretLines,
            materialFiles,
          )
        : runTask(
            call,
            row,
            Number(stage.slice(-1)) - 1,
            read,
            packed.material,
            packed.limited,
            secretLines,
            materialFiles,
          );
    }
    if (stage !== 'transparency') throw new AiError('AI_CONFIGURATION', '评测阶段未知');
    const { hints, limited } = scanHints(findings);
    const declarations = {
      requires_api_key: row.requires_api_key,
      has_scripts: hasScripts,
      scan_hints: hints,
      coverage_limited: limited || packed.limited,
    };
    const input = '<材料>\n' + JSON.stringify(declarations) + '\n' + packed.material + '</材料>';
    const result = await call('transparency', transparencyInstructions, input, transparencySchema);
    return { dimension: scoreTransparency(result, packed.ranges, declarations.coverage_limited) };
  }

  private async runModel(
    job: EvaluationJob,
    row: ResourceEvaluationRecord,
    version: VersionRecord,
    signal: AbortSignal,
  ) {
    const stages = this.evaluations.stages;
    try {
      const profile = this.runtime.config.default_profile;
      if (!profile) fail(409, 'EVALUATOR_CHANGED', '默认评测器已移除');
      let outcome: 'succeeded' | 'failed' | 'cancelled' = 'succeeded';
      await this.runtime.runInline(
        {
          operationId: resourceEvaluationOperation.id,
          ownerId: 'system',
          profileId: profile,
          signal,
        },
        async (run) => {
          let ordinal = 0;
          const call: EvaluationCall = async (step, instructions, input, schema, options = {}) => {
            const stepId =
              step === 'trigger-routing' || step === 'instructions' ? step + '-' + ++ordinal : step;
            const result = await run.call(stepId, {
              operation: 'resource-evaluation/' + step,
              instructions,
              input,
              schema,
              signal,
              reserve: () => stages.reserve(job, run.executionId, options.authorize),
              accept: options.accept,
              subject: version.id,
              resources: options.resources,
            });
            return result.value;
          };
          return this.modelStage(call, job.input.stage, row, version);
        },
        async (result) => {
          outcome = await stages.complete(job, result);
        },
      );
      return outcome;
    } catch (error) {
      if (signal.aborted) return 'interrupted';
      if (error instanceof HubError) {
        if (error.code === 'EVALUATION_WINDOW_EXHAUSTED') {
          await stages.defer(job);
          return 'queued';
        }
        if (['EVALUATOR_CHANGED', 'EVALUATION_UNAVAILABLE'].includes(error.code)) {
          const status = await stages.prepare(job);
          if (typeof status === 'string') return status;
        }
        throw error;
      }
      if (!(error instanceof AiError)) throw error;
      return stages.complete(job, {
        dimension: {
          id: stageDimension(job.input.stage),
          status: 'failed',
          score: null,
          confidence: null,
          checks: [],
          failure_code: error.code,
        },
      });
    }
  }
}
