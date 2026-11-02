/**
 * 新建执行表单：从运营中心的操作目录里选 `operation_id` 与模型档案，
 * 按该操作的 `input_schema` 收集输入，经 {@link useAiCommand} 向 `/api/ai/executions` 发起创建。
 *
 * 输入字段按 schema 属性推导：`prompt`/`topic` 之一作为主输入置于输入框正文，
 * `require_approval` 与模型、提交按钮同在输入框底部工具条，
 * 其余必填字段直接展示，可选字段收进「参考资源与工具」折叠区；没有主输入的操作把全部字段放进输入框。
 * 示例提示词按 `operation_id` 提供，仅当存在主输入时可用。
 */
import { useId, useRef, useState } from 'react';
import { aiExecutionResponseSchema, type AiCatalogResponse } from '@capability-hub/contracts';
import { useAiCommand } from '../../ai/use-ai-command.js';
import { SelectField } from '../../../shared/components/SelectField.js';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  LoaderCircle,
  Send,
  Settings2,
  ShieldCheck,
} from '../../../shared/icons/lucide.js';
import { cn } from '../../../shared/styles/cn.js';
import { btnStyles, btnPrimaryStyles } from '../../../shared/styles/recipes.js';
import { SchemaFields, initialValues, requiredInputNames } from '../../ai/SchemaFields.js';
import { jsonObject, operationLabels, operationMeta } from '../../ai/presentation.js';
import {
  disclosureChevronStyles,
  disclosureStyles,
  eyebrowStyles,
  fillStyles,
  scrollStyles,
} from '../../ai/styles.js';
import {
  chipStyles,
  composerStyles,
  composerToolbarStyles,
  dotFieldStyles,
  modelSelectStyles,
  operationStyles,
  taskColumnStyles,
} from './styles.js';

const examples: Record<string, { title: string; prompt: string }[]> = {
  assistant: [
    {
      title: '试试工具调用',
      prompt: '请调用文本统计工具，统计这段文字的字符数和行数：\n让能力被发现，让经验被复用。',
    },
    {
      title: '梳理一个想法',
      prompt: '我想为团队建立一个可复用的 Skill 目录，请列出三个最值得先解决的问题。',
    },
    { title: '解释一个概念', prompt: '用一个具体例子，解释 Agent、工具调用和人工确认如何配合。' },
  ],
  'agent-lab': [
    {
      title: '设计团队工作流',
      prompt: '为一个 10 人研发团队设计 Skill 共享流程，兼顾提交便利、内容质量和维护成本。',
    },
    {
      title: '完善发布方案',
      prompt: '制定一份内部工具发布方案，包含试用、反馈收集和验收标准，并标明待核实的假设。',
    },
    {
      title: '检查实施风险',
      prompt: '评估将重复性的文档检查交给 Agent 的实施方案，明确适用范围、风险和人工确认点。',
    },
  ],
};

/**
 * 新建表单：切换任务类型会重置输入为对应 schema 的初始值；无可用模型档案或操作时
 * 提交按钮禁用，创建成功后把新执行 id 交给 `onCreated`，由页面跳转到详情。
 * 在输入框内按 ⌘/Ctrl + Enter 等同提交，仍经过表单原生校验。
 */
export function NewExecution({
  catalog,
  onCreated,
}: {
  catalog: AiCatalogResponse;
  /** 创建成功后回传执行 id，页面据此导航到 `?execution=`。 */
  onCreated: (id: string) => void;
}) {
  const [operation, setOperation] = useState(catalog.operations[0]?.id ?? '');
  const [profile, setProfile] = useState(catalog.default_profile);
  const [input, setInput] = useState(() =>
    initialValues(catalog.operations[0]?.input_schema ?? {}),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const command = useAiCommand();
  const modelLabelId = useId();
  const definition = catalog.operations.find((item) => item.id === operation);
  const fields = Object.keys(jsonObject(jsonObject(definition?.input_schema).properties));
  const primary = fields.includes('prompt')
    ? 'prompt'
    : fields.includes('topic')
      ? 'topic'
      : undefined;
  const required = requiredInputNames(definition?.input_schema ?? {});
  const advanced = primary
    ? fields.filter(
        (key) => key !== primary && key !== 'require_approval' && !required.includes(key),
      )
    : [];
  const mainFields = fields.filter((key) => key !== 'require_approval' && !advanced.includes(key));
  const ready = !!profile && !!definition;
  const submit = async () => {
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    try {
      const result = aiExecutionResponseSchema.parse(
        await command('/api/ai/executions', {
          operation_id: operation,
          model_profile: profile,
          input,
        }),
      );
      onCreated(result.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '启动失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      ref={form}
      className={fillStyles}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && ready && !busy) {
          event.preventDefault();
          form.current?.requestSubmit();
        }
      }}
    >
      <div className={scrollStyles}>
        <div className={cn(taskColumnStyles, 'relative isolate py-6 sm:py-8')}>
          <span aria-hidden="true" className={dotFieldStyles} />
          <p className={eyebrowStyles}>New task</p>
          <h2 className="mt-2 text-2xl font-semibold leading-snug tracking-tight">
            一个想法，<span className="text-brand">多一种可能。</span>
          </h2>
          <p className="mt-2 max-w-140 leading-relaxed text-muted-ink">
            选择一位 Agent 并描述目标，过程中的思考、工具调用与需要你决定的节点都会实时呈现。
          </p>
          <div className="mt-6 grid gap-2.5 sm:grid-cols-2" role="group" aria-label="选择任务类型">
            {catalog.operations.map((item) => {
              const meta = operationMeta[item.id];
              const Icon = meta?.Icon ?? Bot;
              const pressed = operation === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={operationStyles}
                  aria-pressed={pressed}
                  disabled={busy}
                  onClick={() => {
                    setOperation(item.id);
                    setInput(initialValues(item.input_schema));
                  }}
                >
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-xl transition-colors',
                      pressed ? 'bg-brand text-on-brand' : 'bg-brand-soft text-brand',
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="flex items-center justify-between gap-2 text-body">
                      {operationLabels[item.id] ?? item.title}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'grid size-4.5 shrink-0 place-items-center rounded-full border transition-colors',
                          pressed
                            ? 'border-brand bg-brand text-on-brand'
                            : 'border-[color:var(--line)] text-transparent',
                        )}
                      >
                        <Check size={11} />
                      </span>
                    </strong>
                    <span className="mt-1 block text-caption leading-relaxed text-muted-ink">
                      {meta?.description ?? item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {definition && (
            <div className="mt-5 flex flex-col gap-3">
              <div className={composerStyles}>
                <div className="px-4 pt-4 pb-3 sm:px-5">
                  <SchemaFields
                    schema={definition.input_schema}
                    names={mainFields}
                    value={input}
                    onChange={setInput}
                    disabled={busy}
                  />
                  {primary && examples[operation] && (
                    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="任务示例">
                      <span className="text-caption text-muted-ink">试试</span>
                      {examples[operation].map((example) => (
                        <button
                          key={example.title}
                          type="button"
                          disabled={busy}
                          className={chipStyles}
                          onClick={() => {
                            setInput({ ...input, [primary]: example.prompt });
                            form.current
                              ?.querySelector<HTMLTextAreaElement>(`textarea[name="${primary}"]`)
                              ?.focus();
                          }}
                        >
                          {example.title}
                          <ArrowRight size={12} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className={composerToolbarStyles}>
                  {fields.includes('require_approval') && (
                    <div className="mr-auto [&_label]:text-caption [&_label]:text-muted-ink">
                      <SchemaFields
                        schema={definition.input_schema}
                        names={['require_approval']}
                        value={input}
                        onChange={setInput}
                        disabled={busy}
                      />
                    </div>
                  )}
                  <div className="ml-auto flex w-full min-w-0 items-center gap-2 sm:w-auto">
                    <span id={modelLabelId} className="sr-only">
                      运行模型
                    </span>
                    <SelectField
                      name="model_profile"
                      aria-labelledby={modelLabelId}
                      className={modelSelectStyles}
                      value={profile}
                      disabled={busy || !catalog.profiles.length}
                      onValueChange={setProfile}
                      optionIcons={Object.fromEntries(
                        catalog.profiles.map((item) => [item.id, Bot]),
                      )}
                    >
                      {catalog.profiles.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label} · {item.model}
                        </option>
                      ))}
                    </SelectField>
                    <button
                      type="submit"
                      className={cn(btnStyles, btnPrimaryStyles, 'h-9 min-h-9 shrink-0 px-4 py-0')}
                      disabled={busy || !ready}
                      title="⌘/Ctrl + Enter"
                    >
                      {busy ? (
                        <LoaderCircle size={15} className="motion-safe:animate-spin" />
                      ) : (
                        <Send size={15} />
                      )}
                      {busy ? '正在创建…' : '开始任务'}
                    </button>
                  </div>
                </div>
              </div>
              {error && (
                <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-danger">
                  {error}
                </p>
              )}
              {!catalog.profiles.length && (
                <p role="status" className="rounded-xl bg-warning-soft px-4 py-3 text-warning">
                  尚未配置模型，请联系管理员启用。
                </p>
              )}
              {primary && advanced.length > 0 && (
                <details className={disclosureStyles}>
                  <summary>
                    <Settings2 size={15} />
                    参考资源与工具<span className="text-caption text-muted-ink">可选</span>
                    <ChevronDown size={14} className={disclosureChevronStyles} />
                  </summary>
                  <div className="p-4">
                    <SchemaFields
                      schema={definition.input_schema}
                      names={advanced}
                      value={input}
                      onChange={setInput}
                      disabled={busy}
                    />
                  </div>
                </details>
              )}
            </div>
          )}
          <p className="mt-6 flex items-center gap-2 text-caption leading-relaxed text-muted-ink">
            <ShieldCheck size={14} className="shrink-0" />
            能力演示空间 · 每次任务独立执行，记录自动保存。
          </p>
        </div>
      </div>
    </form>
  );
}
