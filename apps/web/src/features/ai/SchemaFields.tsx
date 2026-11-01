import { useEffect, useState } from 'react';
import { controlStyles, fieldStyles, stackStyles } from './styles.js';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
const labels: Record<string, string> = {
  prompt: '你的问题',
  topic: '讨论主题',
  resource_ref: '参考资源（可选）',
  require_approval: '保存前由我确认',
  mcp_endpoint: 'MCP 工具目录（可选）',
  skill_ref: '参考 Skill（可选）',
  approved: '采用这份草案',
  comment: '补充意见',
  version_id: '固定版本 ID',
  feedback_id: '反馈 ID',
  apply_feedback: '将反馈标记为处理中，并写入处理建议（需维护权限）',
};
function enumLabel(value: Json | undefined): string {
  return value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
}

function object(value: Json | undefined): Record<string, Json> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/**
 * 由 JSON Schema 生成表单初值，优先级：`default` 最高，其次仅为 `required` 字段合成空值（枚举取首项，
 * 其余按类型给 `false`／`0`／空对象／空数组／空串）。可选且无默认值的字段直接不出现，因此提交体
 * 不会带上服务端没要求的键。
 */
export function initialValues(schema: Json): Record<string, Json> {
  const properties = object(object(schema).properties);
  const required = object(schema).required;
  return Object.fromEntries(
    Object.entries(properties).flatMap(([key, value]) => {
      const field = object(value);
      if (field.default !== undefined) return [[key, field.default]];
      if (!Array.isArray(required) || !required.includes(key)) return [];
      if (Array.isArray(field.enum) && field.enum.length) return [[key, field.enum[0]!]];
      return [
        [
          key,
          field.type === 'boolean'
            ? false
            : field.type === 'number' || field.type === 'integer'
              ? 0
              : field.type === 'object'
                ? {}
                : field.type === 'array'
                  ? []
                  : '',
        ],
      ];
    }),
  );
}

function JsonField({
  value,
  onChange,
  disabled,
}: {
  value: Json | undefined;
  onChange: (value: Json) => void;
  disabled: boolean;
}) {
  const serialized = JSON.stringify(value ?? null, null, 2);
  const [text, setText] = useState(serialized);
  useEffect(() => setText(serialized), [serialized]);
  return (
    <textarea
      className={controlStyles}
      rows={6}
      value={text}
      disabled={disabled}
      onChange={(event) => {
        setText(event.target.value);
        try {
          const parsed = JSON.parse(event.target.value) as Json;
          event.target.setCustomValidity('');
          onChange(parsed);
        } catch {
          event.target.setCustomValidity('请输入有效的 JSON');
        }
      }}
    />
  );
}

/**
 * 只渲染契约响应 schema 的子集（boolean、enum、number、object/array 等走 JSON 文本域、其余为文本域），
 * 按需展示必填标记与 `description`。服务端未声明的字段类型一律降级为文本，不会报错。
 */
export function SchemaFields({
  schema,
  value,
  onChange,
  disabled = false,
  names,
}: {
  schema: Json;
  value: Record<string, Json>;
  onChange: (value: Record<string, Json>) => void;
  disabled?: boolean;
  /** 白名单：只渲染这些键；省略则全部渲染，渲染顺序始终跟随 schema 的 properties 顺序。 */
  names?: string[];
}) {
  const fields = object(object(schema).properties);
  const required = object(schema).required;
  return (
    <div className={stackStyles}>
      {Object.entries(fields)
        .filter(([key]) => !names || names.includes(key))
        .map(([key, raw]) => {
          const field = object(raw);
          const label = typeof field.title === 'string' ? field.title : (labels[key] ?? key);
          const update = (item: Json) => onChange({ ...value, [key]: item });
          const current = value[key];
          if (field.type === 'boolean')
            return (
              <label className="flex flex-row items-center gap-2.5 text-body" key={key}>
                <input
                  type="checkbox"
                  name={key}
                  className="size-4 shrink-0 accent-brand"
                  checked={current === true}
                  disabled={disabled}
                  onChange={(event) => update(event.target.checked)}
                />
                {label}
              </label>
            );
          return (
            <label className={fieldStyles} key={key}>
              <span>{label}</span>
              {Array.isArray(field.enum) ? (
                <select
                  className={controlStyles}
                  name={key}
                  value={enumLabel(current)}
                  disabled={disabled}
                  onChange={(event) =>
                    update(
                      (field.enum as Json[]).find(
                        (item) => enumLabel(item) === event.target.value,
                      ) ?? event.target.value,
                    )
                  }
                >
                  {field.enum.map((item) => (
                    <option key={enumLabel(item)} value={enumLabel(item)}>
                      {enumLabel(item)}
                    </option>
                  ))}
                </select>
              ) : field.type === 'object' ||
                field.type === 'array' ||
                field.$ref ||
                field.anyOf ||
                field.oneOf ? (
                <JsonField value={current} onChange={update} disabled={disabled} />
              ) : field.type === 'number' || field.type === 'integer' ? (
                <input
                  className={controlStyles}
                  name={key}
                  type="number"
                  value={typeof current === 'number' ? current : ''}
                  disabled={disabled}
                  onChange={(event) => update(Number(event.target.value))}
                  min={typeof field.minimum === 'number' ? field.minimum : undefined}
                  max={typeof field.maximum === 'number' ? field.maximum : undefined}
                />
              ) : (
                <textarea
                  className={controlStyles}
                  name={key}
                  placeholder={
                    key === 'prompt'
                      ? '描述你想解决的问题，或从上方示例开始…'
                      : key === 'topic'
                        ? '描述主题、目标和约束，让多个 Agent 一起完善方案…'
                        : key === 'comment'
                          ? '补充你的判断或修改建议（可选）'
                          : undefined
                  }
                  rows={key.endsWith('_ref') || key === 'mcp_endpoint' || key === 'comment' ? 2 : 4}
                  value={
                    typeof current === 'string'
                      ? current
                      : current === undefined
                        ? ''
                        : JSON.stringify(current)
                  }
                  disabled={disabled}
                  required={Array.isArray(required) && required.includes(key)}
                  maxLength={typeof field.maxLength === 'number' ? field.maxLength : undefined}
                  onChange={(event) => update(event.target.value)}
                />
              )}
              {typeof field.description === 'string' && (
                <small className="text-muted-ink">{field.description}</small>
              )}
            </label>
          );
        })}
    </div>
  );
}
