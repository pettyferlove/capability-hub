import { motion } from 'motion/react';
import { useState } from 'react';
import type { DiscoveryCriteria } from '@capability-hub/contracts';
import { contentTransition } from '../../shared/motion/transitions.js';
import { cn } from '../../shared/styles/cn.js';
import { LayoutGrid, ListFilter, X } from '../../shared/icons/lucide.js';
import {
  browseCardButtonStyles,
  browseCardDescStyles,
  browseCardStyles,
  browseCardTitleStyles,
  conditionCardStyles,
  conditionChoiceStyles,
  conditionEditorStyles,
  conditionHeadHintStyles,
  conditionHeadStyles,
  conditionHeadTitleStyles,
  conditionKeyStyles,
  conditionKeywordStyles,
  conditionKeywordsStyles,
  conditionNoteStyles,
  conditionRailStyles,
  conditionRowStyles,
  conditionValueStyles,
} from './styles.js';

type Field = 'kind' | 'category' | 'scenario' | 'audience' | 'scripts' | 'keywords';

function typeLabel(criteria: DiscoveryCriteria) {
  return criteria.kind === 'skill' ? 'Skill' : criteria.kind === 'mcp' ? 'MCP' : 'Skill 与 MCP';
}

/**
 * 本轮条件的只读摘要与直接改法：任一行都能就地改，改完按目录重新查询，不请求模型；
 * 必需项只能逐条移除，删除的那一条与会话里的依据一起作废。
 */
export function TaskConditions({
  busy,
  criteria,
  scenarios,
  onFilter,
  onBrowse,
}: {
  busy: boolean;
  criteria: DiscoveryCriteria;
  scenarios: { id: string; name: string }[];
  onFilter: (patch: Partial<DiscoveryCriteria>) => void;
  onBrowse: () => void;
}) {
  const [editing, setEditing] = useState<Field>();
  // 桌面默认展开条件；窄屏先读结果，条件以摘要形式展开。
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 851px)').matches);
  const [keywords, setKeywords] = useState(criteria.keywords.join(' '));
  const scenario = scenarios.find((item) => item.id === criteria.scenario_id);
  const choose = (patch: Partial<DiscoveryCriteria>) => {
    setEditing(undefined);
    onFilter(patch);
  };
  const row = (field: Field, key: string, value: React.ReactNode, editor: React.ReactNode) => (
    <>
      <button
        type="button"
        className={conditionRowStyles}
        aria-expanded={editing === field}
        onClick={() => {
          setKeywords(criteria.keywords.join(' '));
          setEditing(editing === field ? undefined : field);
        }}
      >
        <span className={conditionKeyStyles}>{key}</span>
        <span className={conditionValueStyles}>{value}</span>
      </button>
      {editing === field && <div className={conditionEditorStyles}>{editor}</div>}
    </>
  );
  const choice = (label: string, patch: Partial<DiscoveryCriteria>, chosen: boolean) => (
    <button
      key={label}
      type="button"
      className={conditionChoiceStyles}
      data-chosen={chosen ? '' : undefined}
      onClick={() => choose(patch)}
    >
      {label}
    </button>
  );
  return (
    <motion.aside
      className={conditionRailStyles}
      aria-label="本轮条件"
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...contentTransition, duration: 0.36, delay: 0.12 }}
    >
      <details
        className={conditionCardStyles}
        open={open}
        inert={busy}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className={conditionHeadStyles}>
          <span className={conditionHeadTitleStyles}>
            <ListFilter size={12} className="text-brand" aria-hidden="true" />
            本次检索条件
          </span>
          <span className={conditionHeadHintStyles}>可调整</span>
        </summary>
        <div className="flex flex-col gap-2.5 pt-2.5">
          {row(
            'kind',
            '类型',
            typeLabel(criteria),
            <>
              {choice('全部', { kind: null }, criteria.kind === null)}
              {choice('Skill', { kind: 'skill' }, criteria.kind === 'skill')}
              {choice('MCP', { kind: 'mcp' }, criteria.kind === 'mcp')}
            </>,
          )}
          {row(
            'category',
            '分类',
            criteria.category
              ? { general: '通用', scenario: '场景', uncategorized: '未分类' }[criteria.category]
              : '全部',
            <>
              {choice('全部', { category: null }, criteria.category === null)}
              {choice('通用', { category: 'general' }, criteria.category === 'general')}
              {choice('场景', { category: 'scenario' }, criteria.category === 'scenario')}
              {choice(
                '未分类',
                { category: 'uncategorized' },
                criteria.category === 'uncategorized',
              )}
            </>,
          )}
          {row(
            'scenario',
            '场景',
            scenario?.name ?? '全部场景',
            <>
              {choice('全部场景', { scenario_id: null }, !criteria.scenario_id)}
              {scenarios.map((item) =>
                choice(item.name, { scenario_id: item.id }, criteria.scenario_id === item.id),
              )}
            </>,
          )}
          {row(
            'audience',
            '可见范围',
            { readable: '全部可读', public: '仅公开', restricted: '仅受限' }[criteria.audience],
            <>
              {choice('全部可读', { audience: 'readable' }, criteria.audience === 'readable')}
              {choice('仅公开', { audience: 'public' }, criteria.audience === 'public')}
              {choice('仅受限', { audience: 'restricted' }, criteria.audience === 'restricted')}
            </>,
          )}
          {row(
            'scripts',
            '脚本',
            criteria.has_scripts === null ? '不限' : criteria.has_scripts ? '含脚本' : '不含脚本',
            <>
              {choice('不限', { has_scripts: null }, criteria.has_scripts === null)}
              {choice('含脚本', { has_scripts: true }, criteria.has_scripts === true)}
              {choice('不含脚本', { has_scripts: false }, criteria.has_scripts === false)}
            </>,
          )}
          {row(
            'keywords',
            '关键词',
            criteria.keywords.length ? (
              <span className={conditionKeywordsStyles}>
                {criteria.keywords.map((keyword) => (
                  <span key={keyword} className={conditionKeywordStyles}>
                    {keyword}
                  </span>
                ))}
              </span>
            ) : (
              '未填'
            ),
            <form
              className="flex w-full items-center gap-1.5"
              onSubmit={(event) => {
                event.preventDefault();
                onFilter({
                  keywords: keywords
                    .split(/[\s·、,，]+/u)
                    .map((word) => word.trim())
                    .filter(Boolean)
                    .slice(0, 5),
                });
                setEditing(undefined);
              }}
            >
              <input
                value={keywords}
                onChange={(event) => setKeywords(event.target.value)}
                aria-label="关键词"
                className="min-w-0 flex-1 rounded-[6px] border border-solid border-[color:var(--stroke-card)] bg-surface-card px-2 py-1 text-[length:11px] text-ink outline-offset-1 focus-visible:outline-muted-ink"
                placeholder="用空格分隔，至多 5 个"
              />
              <button type="submit" className={conditionChoiceStyles}>
                应用
              </button>
            </form>,
          )}
          {!!criteria.requirements.length && (
            <div className="flex flex-wrap gap-1.5">
              {criteria.requirements.map((requirement) => (
                <span
                  key={requirement}
                  className={cn(conditionChoiceStyles, 'inline-flex items-center gap-1')}
                >
                  {requirement}
                  <button
                    type="button"
                    aria-label={'不再要求 ' + requirement}
                    onClick={() =>
                      onFilter({
                        requirements: criteria.requirements.filter((item) => item !== requirement),
                      })
                    }
                  >
                    <X size={10} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className={conditionNoteStyles}>点击任一条可修改条件，结果随之刷新</p>
        </div>
      </details>
      <div className={browseCardStyles}>
        <h3 className={browseCardTitleStyles}>没有合适的？</h3>
        <p className={browseCardDescStyles}>目录不依赖检索模型：按类型、分类与场景筛选就能看全。</p>
        <button type="button" className={browseCardButtonStyles} onClick={onBrowse}>
          <LayoutGrid size={11} aria-hidden="true" />
          浏览全部资源
        </button>
      </div>
    </motion.aside>
  );
}
