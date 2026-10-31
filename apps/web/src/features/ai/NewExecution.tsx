import { useId, useRef, useState } from 'react';
import { aiExecutionResponseSchema, type AiCatalogResponse } from '@capability-hub/contracts';
import { useAiCommand } from './use-ai-command.js';
import { SelectField } from '../../shared/components/SelectField.js';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Send,
  Settings2,
  Sparkles,
  Workflow,
} from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { btnStyles, btnPrimaryStyles } from '../../shared/styles/recipes.js';
import { SchemaFields, initialValues } from './SchemaFields.js';
import { jsonObject, operationLabels } from './presentation.js';
import {
  composerStyles,
  disclosureChevronStyles,
  disclosureStyles,
  eyebrowStyles,
  fillStyles,
  heroStyles,
  iconTileStyles,
  modelSelectStyles,
  operationStyles,
  scrollStyles,
  taskActionsStyles,
  taskColumnStyles,
  taskFooterStyles,
  taskSubmitStyles,
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
const descriptions: Record<string, string> = {
  assistant: '一个问题，实时回答。按需调用工具，辅助理解与整理。',
  'agent-lab': '生成草案、并行审查，再由你确认。体验完整协作流程。',
};

export function NewExecution({
  catalog,
  canExecute,
  onCreated,
}: {
  catalog: AiCatalogResponse;
  canExecute: boolean;
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
  const advanced = fields.filter((key) => key !== primary && key !== 'require_approval');
  const submit = async () => {
    if (busy) return;
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
    >
      <div className={scrollStyles}>
        <div className={heroStyles}>
          <div className="mb-4 flex items-center gap-3">
            <span className={cn(iconTileStyles, 'size-10 rounded-xl bg-brand text-on-brand')}>
              <Sparkles size={20} />
            </span>
            <div>
              <p className={eyebrowStyles}>Explore possibilities</p>
              <p className="mt-1 text-caption text-muted-ink">从提问开始，让协作发生</p>
            </div>
          </div>
          <h2 className="text-title leading-snug tracking-tight">
            一个想法，<span className="text-brand">多一种可能。</span>
          </h2>
          <p className="mt-3 text-muted-ink">体验 Agent 的实时回答、工具调用与协作决策。</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2" role="group" aria-label="选择任务类型">
            {catalog.operations.map((item) => {
              const Icon = item.id === 'agent-lab' ? Workflow : Bot;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={operationStyles}
                  aria-pressed={operation === item.id}
                  disabled={busy}
                  onClick={() => {
                    setOperation(item.id);
                    setInput(initialValues(item.input_schema));
                  }}
                >
                  <Icon size={20} className="mt-0.5 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">
                    <strong className="flex items-center justify-between gap-2 text-body">
                      {operationLabels[item.id] ?? item.title}
                      {operation === item.id && (
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand">
                          <Check size={12} />
                        </span>
                      )}
                    </strong>
                    <span className="mt-1.5 block text-caption leading-relaxed text-muted-ink">
                      {descriptions[item.id] ?? item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {primary && examples[operation] && (
            <div className="mt-5 mb-3 flex flex-wrap gap-2" aria-label="任务示例">
              {examples[operation].map((example) => (
                <button
                  key={example.title}
                  type="button"
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] px-3 py-1.5 text-caption text-muted-ink transition-colors hover:border-brand/40 hover:bg-brand-soft hover:text-brand"
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
          {definition && (
            <div className="mt-3 flex flex-col gap-4">
              <div className={composerStyles}>
                <SchemaFields
                  schema={definition.input_schema}
                  names={primary ? [primary] : undefined}
                  value={input}
                  onChange={setInput}
                  disabled={busy}
                />
                {primary && fields.includes('require_approval') && (
                  <div className="mt-4 border-t border-[color:var(--line)] pt-4">
                    <SchemaFields
                      schema={definition.input_schema}
                      names={['require_approval']}
                      value={input}
                      onChange={setInput}
                      disabled={busy}
                    />
                  </div>
                )}
              </div>
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
          <p className="mt-5 flex items-center gap-2 text-caption leading-relaxed text-muted-ink">
            <Workflow size={14} className="shrink-0" />
            能力演示空间 · 每次任务独立执行，记录自动保存。
          </p>
        </div>
      </div>
      <div className={taskFooterStyles}>
        <div className={cn(taskColumnStyles, 'py-4')}>
          {error && (
            <p role="alert" className="mb-3 text-danger">
              {error}
            </p>
          )}
          {!catalog.profiles.length && (
            <p role="status" className="mb-3 text-warning">
              尚未配置模型，请联系管理员启用。
            </p>
          )}
          <div className={taskActionsStyles}>
            <div className="min-w-0">
              <p id={modelLabelId} className="mb-2 text-caption font-medium text-muted-ink">
                运行模型
              </p>
              <SelectField
                name="model_profile"
                aria-labelledby={modelLabelId}
                className={modelSelectStyles}
                value={profile}
                disabled={busy || !catalog.profiles.length}
                onValueChange={setProfile}
                optionIcons={Object.fromEntries(catalog.profiles.map((item) => [item.id, Bot]))}
              >
                {catalog.profiles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} · {item.model}
                  </option>
                ))}
              </SelectField>
            </div>
            <button
              type="submit"
              className={cn(btnStyles, btnPrimaryStyles, taskSubmitStyles)}
              disabled={busy || !profile || !definition || !canExecute}
            >
              <Send size={15} />
              {busy ? '正在创建…' : '开始任务'}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
