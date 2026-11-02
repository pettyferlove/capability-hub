import { useState } from 'react';
import type { PublicationDraftPolicy, ScenarioDefinition } from '@capability-hub/contracts';
import type { ScenarioResponse } from '@capability-hub/contracts/http';
import { useQuery } from '../../shared/api/use-query.js';
import { useHub } from '../../shared/context/HubContext.js';
import { Message } from '../../shared/components/Message.js';
import { cn } from '../../shared/styles/cn.js';
import {
  btnStyles,
  checkLabelStyles,
  chipsStyles,
  subtleStyles,
  textBtnStyles,
} from '../../shared/styles/recipes.js';

/** 已有 ID 与新定义共用申请的名额；复用同名词条时移除相应草稿。 */
export function PublicationScenarioFields({
  value,
  onChange,
}: {
  value: PublicationDraftPolicy;
  onChange: (patch: Partial<PublicationDraftPolicy>) => void;
}) {
  const { refresh } = useHub();
  const {
    data: scenarios,
    error,
    loading,
  } = useQuery<ScenarioResponse[]>('/api/scenarios', refresh);
  const [query, setQuery] = useState('');
  const selected = value.scenario_ids;
  const drafts = value.proposed_scenarios ?? [];
  const full = selected.length + drafts.length >= 20;
  const term = query.trim().toLowerCase();
  const matches = scenarios?.filter(
    (s) => selected.includes(s.id) || (s.name + ' ' + s.description).toLowerCase().includes(term),
  );
  function edit(index: number, patch: Partial<ScenarioDefinition>) {
    onChange({
      proposed_scenarios: drafts.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }
  return (
    <fieldset data-review-target="scenarios" tabIndex={-1} className="grid gap-3">
      <legend>适用场景</legend>
      <label>
        查找已有场景
        <input
          type="search"
          value={query}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="按任务名称或说明搜索"
        />
      </label>
      {error && <Message error>{error}</Message>}
      {loading && <small>正在读取场景…</small>}
      {scenarios && !error && !loading && !matches?.length && (
        <small>{scenarios.length ? '没有匹配的已有场景。' : '尚无已登记场景。'}</small>
      )}
      <div className={chipsStyles}>
        {matches?.map((s) => (
          <label className={checkLabelStyles} key={s.id} title={s.description}>
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              disabled={full && !selected.includes(s.id)}
              onChange={(e) =>
                onChange({
                  scenario_ids: e.target.checked
                    ? [...selected, s.id]
                    : selected.filter((id) => id !== s.id),
                })
              }
            />
            <span>{s.name}</span>
          </label>
        ))}
        {scenarios &&
          selected
            .filter((id) => !scenarios.some((s) => s.id === id))
            .map((id) => (
              <button
                key={id}
                type="button"
                className={textBtnStyles}
                onClick={() => onChange({ scenario_ids: selected.filter((entry) => entry !== id) })}
              >
                移除失效场景 {id}
              </button>
            ))}
      </div>
      {drafts.map((item, index) => {
        const existing = scenarios?.find((s) => s.name === item.name.trim());
        const remaining = drafts.filter((_, i) => i !== index);
        return (
          <div className="grid gap-2 rounded-xl border border-separator bg-paper p-3" key={index}>
            <label>
              新场景名称
              <input
                required
                maxLength={80}
                value={item.name}
                onChange={(e) => edit(index, { name: e.target.value })}
                placeholder="例如：数据库迁移演练"
              />
            </label>
            <label>
              适用说明
              <textarea
                required
                maxLength={2000}
                value={item.description}
                onChange={(e) => edit(index, { description: e.target.value })}
                placeholder="这个场景适用于什么任务？"
              />
            </label>
            {existing && (
              <button
                type="button"
                className={textBtnStyles}
                onClick={() =>
                  onChange({
                    scenario_ids: [...new Set([...selected, existing.id])],
                    proposed_scenarios: remaining,
                  })
                }
              >
                使用已有场景「{existing.name}」
              </button>
            )}
            <button
              type="button"
              className={textBtnStyles}
              onClick={() => onChange({ proposed_scenarios: remaining })}
            >
              移除此定义
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className={cn(btnStyles, 'justify-self-start')}
        disabled={full}
        onClick={() =>
          onChange({ proposed_scenarios: [...drafts, { name: query.trim(), description: '' }] })
        }
      >
        添加新场景
      </button>
      <small className={subtleStyles}>
        新场景随本次发布提交平台审核。通过后，名称和说明可供其他维护者复用。
      </small>
    </fieldset>
  );
}
