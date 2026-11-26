import type { ManagementEvaluationsResponse } from '@capability-hub/contracts';
import type { ContentFile } from '@capability-hub/domain/content';
import { fail } from '@capability-hub/domain/errors';
import { evaluationDimensions, evaluationRubric } from '@capability-hub/domain/evaluation';
import { archive } from '@capability-hub/infrastructure/content/zip-archive';

type Detail = ManagementEvaluationsResponse['items'][number];
type Judgment = NonNullable<Detail['stages'][number]['assertion_results']>[number]['with_skill'];
const maxBytes = 1024 * 1024;
const status = {
  scored: '已评分',
  insufficient: '样本不足',
  not_applicable: '不适用',
  failed: '失败',
  pending: '未评估',
};
const limitation = {
  static_only: '仅静态检查',
  scripts_not_executed: '未执行脚本',
  paper_run_only: '仅纸面推演',
  client_routing_may_differ: '实际客户端的路由选择可能不同',
};
const flags = {
  coverage_limited: '材料覆盖受限',
  script_unverified: '脚本未经执行验证',
  manipulation_suspected: '疑似操纵评测',
  limited_uplift: '增益有限',
  negative_uplift: '负增益',
};
const confidence = { high: '高', medium: '中', low: '低' };
const verdict = { pass: '满足', partial: '部分满足', fail: '未满足', na: '不适用' };

function checkSize(bytes: number) {
  if (bytes > maxBytes) fail(413, 'PACKAGE_LIMIT', '评测迭代包的文本总量超过 1 MiB');
}

// 动态内容只进入缩进代码块；包括单独的 CR 在内，每个换行后的文字都仍是字面文本。
function field(label: string, value: string) {
  checkSize(value.length);
  return '    ' + label + '：' + value.replace(/\r\n|[\r\n]/g, '$&    ');
}

function judgment(label: string, evidence?: Judgment) {
  if (!evidence) return field(label, '缺少判定');
  if (!evidence.valid || !evidence.quote.trim()) return field(label, '无有效引文，无法判定');
  return field(label, (evidence.passed ? '通过' : '未通过') + '；引文：' + evidence.quote);
}

function* checkEvidence(check: Detail['dimensions'][number]['checks'][number]) {
  yield field('检查项', check.label + '（' + check.id + '）');
  yield field('判定', verdict[check.verdict]);
  if (check.note) yield field('理由', check.note);
  for (const { path, start_line, end_line } of check.evidence) {
    yield field('证据位置', `${path}:${start_line}-${end_line}`);
  }
}

function* improvements(detail: Detail) {
  let count = 0;
  for (const dimension of detail.dimensions) {
    for (const check of dimension.checks) {
      if (!check.suggestion?.trim()) continue;
      yield `\n### 建议 ${++count}\n`;
      yield field('改进建议', check.suggestion);
      yield field('维度', dimension.label);
      yield* checkEvidence(check);
    }
  }
  if (!count) yield '本次没有记录具体改进建议。';
}

function* dimensionReport(detail: Detail) {
  for (const id of evaluationDimensions) {
    yield '\n### ' + evaluationRubric[id].label + '\n';
    const dimension = detail.dimensions.find((item) => item.id === id);
    if (!dimension) {
      yield '本次没有该维度的记录。';
      continue;
    }
    if (dimension.label !== evaluationRubric[id].label) yield field('记录名称', dimension.label);
    yield field('状态', status[dimension.status]);
    yield field('评分', dimension.score === null ? '缺分' : dimension.score + ' 分');
    yield field('置信度', dimension.confidence ? confidence[dimension.confidence] : '未提供');
    if (dimension.summary) yield field('说明', dimension.summary);
    for (const flag of dimension.flags ?? []) yield field('局限或提示', flags[flag]);
    for (const check of dimension.checks) {
      if (!check.suggestion?.trim()) {
        yield '';
        yield* checkEvidence(check);
      }
    }
  }
}

function* report(slug: string, detail: Detail) {
  yield '# Skill 迭代报告\n';
  yield '本报告只对应下列固定版本与评测记录。任务判断来自纸面推演，不是脚本执行结果或安全认证。';
  yield '请按证据位置核对固定版本，选取适用的建议修改下一版 Skill；评测输入未变时，Hub 可能复用已有结果。';
  yield '\n## 评测标识\n';
  yield field('资源标识', slug);
  yield field('版本标签', detail.version_label);
  yield field('版本 ID', detail.version_id);
  yield field('评测 ID', detail.id);
  yield field('评测标准', detail.rubric_version);
  if (detail.scan_ruleset) yield field('扫描规则', detail.scan_ruleset);
  yield field('内容摘要', detail.content_digest);
  yield field('评测时间', detail.evaluated_at ?? '未记录');
  yield field('范围', detail.scope === 'static' ? '静态检查' : '完整评测');
  yield field('结果状态', detail.state === 'partial' ? '部分完成；缺少的结果不代表零分' : '已完成');
  for (const item of detail.limitations) yield field('方法局限', limitation[item]);
  yield '\n## 改进建议\n';
  yield* improvements(detail);
  yield '\n## 五维结果与其他检查';
  yield* dimensionReport(detail);
  yield '\n## 纸面任务\n';
  const tasks = detail.cases?.tasks ?? [];
  if (!tasks.length) yield '本次没有记录纸面任务，未附任务文件。';
  else {
    yield '`evals/evals.json` 只含本次选取的用例和纸面断言。请选择适用任务，逐条合并到下一版 Skill 的作者用例集，不要覆盖原文件。引用的输入文件不在包内。';
    for (const [i, task] of tasks.entries()) {
      yield `\n### 任务 ${i + 1}\n`;
      yield field('用例 ID', task.id);
      yield field('来源', task.origin === 'author' ? '作者用例' : '评测生成');
      yield field('请求', task.prompt);
      yield field('预期交付', task.expected || '未提供');
      for (const path of task.files ?? []) yield field('输入文件引用', path);
      if (task.script_dependent) yield field('局限', '依赖脚本；本次未执行');
      const results = detail.stages.find(
        (stage) => stage.id === 'task-run-' + (i + 1),
      )?.assertion_results;
      for (const [index, assertion] of task.assertions.entries()) {
        yield '';
        yield field('断言 ' + (index + 1), assertion);
        yield judgment('带 Skill', results?.[index]?.with_skill);
        yield judgment('无 Skill', results?.[index]?.without_skill);
      }
    }
  }
  yield '\n## 触发用例\n';
  const triggers = detail.cases?.trigger ?? [];
  if (!triggers.length) yield '本次没有记录触发用例，未附触发用例文件。';
  else {
    yield '`trigger-cases.json` 是本次评测生成的路由样本，供人工复核描述与触发边界，不会自动导入 Hub。';
    for (const item of triggers) {
      yield '';
      yield field('用例 ID', item.id);
      yield field('类别', item.kind === 'should_trigger' ? '应触发' : '近似但不应触发');
      yield field('语言', item.language === 'zh' ? '中文' : '英文');
      yield field('请求', item.query);
      const confusion = detail.confusions?.find((entry) => entry.case_id === item.id);
      if (confusion) yield field('被选中的混淆项', confusion.name);
    }
  }
}

/** 仅打包已授权投影中的报告与用例，不读取资源文件，也不重新运行评测。 */
export async function evaluationIterationBundle(
  slug: string,
  detail: Detail,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const files: ContentFile[] = [];
  let total = 0;
  function add(path: string, lines: Iterable<string>) {
    const parts: string[] = [];
    for (const line of lines) {
      total += Buffer.byteLength(line) + 1;
      checkSize(total);
      parts.push(line);
    }
    files.push({ path, bytes: Buffer.from(parts.join('\n') + '\n'), executable: false });
  }
  add('report.md', report(slug, detail));
  const cases = detail.cases;
  if (cases?.tasks.length) {
    const evals = cases.tasks.map(({ prompt, expected, files, assertions }) => ({
      prompt,
      expected_output: expected,
      files: files ?? [],
      assertions,
    }));
    add('evals/evals.json', [JSON.stringify({ evals }, null, 2)]);
  }
  if (cases?.trigger.length) {
    const triggers = cases.trigger.map(({ id, kind, language, query }) => {
      const confusion = detail.confusions?.find((entry) => entry.case_id === id);
      return { id, kind, language, query, ...(confusion && { confusion_name: confusion.name }) };
    });
    add('trigger-cases.json', [JSON.stringify({ cases: triggers }, null, 2)]);
  }
  return archive(files, signal);
}
