import {
  keywordFieldStyles,
  keywordCountStyles,
  keywordEditorStyles,
  keywordTagStyles,
  keywordBrowseStyles,
  keywordSuggestionsStyles,
  keywordSuggestionsHeadingStyles,
  keywordSuggestionsStatusStyles,
  textBtnStyles,
  fieldErrorStyles,
} from '../styles/recipes.js';
import type { KeywordOptionsResponse } from '@capability-hub/contracts/http';
import { Check, ChevronDown, X } from '../icons/lucide.js';
import { useEffect, useId, useRef, useState } from 'react';
import { useQuery } from '../api/use-query.js';
import { keywordSeparators, mergeKeywords } from './keyword-input.js';

export function KeywordField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const emitted = useRef(JSON.stringify(value));
  const [tags, setTags] = useState(value);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(-1);
  const [refresh, setRefresh] = useState(0);
  const normalizedDraft = draft.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const searchable = normalizedDraft.length <= 128 && !keywordSeparators.test(draft);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(normalizedDraft), 200);
    return () => clearTimeout(timer);
  }, [normalizedDraft]);
  const {
    data,
    loading,
    error: optionsError,
  } = useQuery<KeywordOptionsResponse>(
    open && searchable && search === normalizedDraft
      ? '/api/management/keywords?' + new URLSearchParams({ q: search, limit: '20' }).toString()
      : null,
    refresh,
  );
  const options = data?.items ?? [];
  const selected = new Set(tags.map((tag) => tag.toLowerCase()));
  const pending = loading || search !== normalizedDraft;
  const activeOption = open && !pending ? options[active] : undefined;
  useEffect(() => setActive(-1), [draft, data]);

  useEffect(() => {
    const key = JSON.stringify(value);
    if (key !== emitted.current) {
      emitted.current = key;
      setTags(value);
      setDraft('');
      setError('');
      input.current?.setCustomValidity('');
    }
  }, [value]);

  function emit(values: string[]) {
    emitted.current = JSON.stringify(values);
    onChange(values);
  }
  function update(text: string, commit = false) {
    const result = mergeKeywords(tags, text);
    setError(result.error);
    input.current?.setCustomValidity(result.error);
    if (result.error) {
      setDraft(text);
      return;
    }
    // 未按回车的末项也计入提交值。
    emit(result.values);
    if (commit) {
      setTags(result.values);
      setDraft('');
    } else setDraft(text);
  }
  function remove(index: number) {
    const next = tags.filter((_, i) => i !== index);
    setTags(next);
    const result = mergeKeywords(next, draft);
    setError(result.error);
    input.current?.setCustomValidity(result.error);
    emit(result.values);
    input.current?.focus();
  }
  function choose(keyword: string) {
    // 选择联想项时用完整关键词替换输入片段，避免片段被一并保存。
    update(keyword, true);
    setActive(-1);
    input.current?.focus();
  }
  function moveOption(direction: number) {
    setOpen(true);
    if (pending || tags.length >= 20) return;
    const start = active < 0 ? (direction > 0 ? -1 : 0) : active;
    for (let step = 1; step <= options.length; step++) {
      const index = (start + direction * step + options.length) % options.length;
      if (!selected.has(options[index].toLowerCase())) {
        setActive(index);
        document.getElementById(`${id}-option-${index}`)?.scrollIntoView({ block: 'nearest' });
        break;
      }
    }
  }

  return (
    <div
      className={keywordFieldStyles}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
        setActive(-1);
        if (!composing.current) update(draft, true);
      }}
    >
      <label htmlFor={id}>
        检索关键词{' '}
        <span className={keywordCountStyles} aria-hidden="true">
          {mergeKeywords(tags, draft).values.length}/20
        </span>
      </label>
      <div
        className={keywordEditorStyles}
        data-invalid={!!error || undefined}
        onClick={(event) => {
          if (event.target === event.currentTarget) input.current?.focus();
        }}
      >
        {tags.map((term, index) => (
          <span className={keywordTagStyles} key={term.toLowerCase()}>
            <span>{term}</span>
            <button type="button" aria-label={`移除关键词 ${term}`} onClick={() => remove(index)}>
              <X size={13} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={input}
          value={draft}
          maxLength={2700}
          aria-invalid={!!error || undefined}
          aria-describedby={`${id}-hint`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && searchable}
          aria-controls={open && searchable ? `${id}-options` : undefined}
          aria-activedescendant={activeOption ? `${id}-option-${active}` : undefined}
          autoComplete="off"
          placeholder={tags.length ? '搜索或添加关键词…' : '搜索已有关键词，也可输入新词'}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const text = event.target.value;
            setOpen(true);
            update(text, !composing.current && keywordSeparators.test(text));
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            update(event.currentTarget.value, keywordSeparators.test(event.currentTarget.value));
          }}
          onPaste={(event) => {
            const text = event.clipboardData.getData('text');
            if (!keywordSeparators.test(text)) return;
            event.preventDefault();
            const start = event.currentTarget.selectionStart ?? draft.length;
            const end = event.currentTarget.selectionEnd ?? start;
            update(draft.slice(0, start) + text + draft.slice(end), true);
          }}
          onKeyDown={(event) => {
            // Chrome 组合中 key 是 Unidentified，只留 229 可识别。
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- 组合识别没有未废弃的等价字段。
            if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              moveOption(event.key === 'ArrowDown' ? 1 : -1);
            } else if (event.key === 'Enter' && activeOption) {
              event.preventDefault();
              choose(activeOption);
            } else if (event.key === 'Enter' || keywordSeparators.test(event.key)) {
              event.preventDefault();
              update(draft, true);
            } else if (event.key === 'Backspace' && !draft && tags.length) {
              event.preventDefault();
              remove(tags.length - 1);
            } else if (event.key === 'Escape' && (open || draft)) {
              event.preventDefault();
              event.stopPropagation();
              if (open) setOpen(false);
              else update('', false);
            }
          }}
        />
        <button
          type="button"
          className={keywordBrowseStyles}
          aria-label="选择已有关键词"
          aria-expanded={open && searchable}
          onClick={() => {
            input.current?.focus();
            setOpen(!open);
          }}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      {open && searchable && (
        <div className={keywordSuggestionsStyles}>
          <div className={keywordSuggestionsHeadingStyles}>
            <strong>{normalizedDraft ? '匹配的已有关键词' : '已有关键词'}</strong>
            <span>选择复用 · {tags.length >= 20 ? '已达上限' : '↑ ↓ 选择，回车确认'}</span>
          </div>
          <div id={`${id}-options`} role="listbox" aria-label="已有关键词" aria-multiselectable>
            {!pending &&
              !optionsError &&
              options.map((keyword, index) => {
                const isSelected = selected.has(keyword.toLowerCase());
                return (
                  <button
                    id={`${id}-option-${index}`}
                    key={keyword}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isSelected || tags.length >= 20}
                    tabIndex={-1}
                    data-active={active === index || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (!isSelected && tags.length < 20) choose(keyword);
                    }}
                  >
                    <span>{keyword}</span>
                    {isSelected && <Check size={13} aria-hidden="true" />}
                  </button>
                );
              })}
          </div>
          <div className={keywordSuggestionsStatusStyles} role="status">
            {pending ? (
              '正在查找已有关键词…'
            ) : optionsError ? (
              <>
                暂时无法加载，仍可手动输入。
                <button
                  type="button"
                  className={textBtnStyles}
                  onClick={() => setRefresh((n) => n + 1)}
                >
                  重试
                </button>
              </>
            ) : !options.length ? (
              normalizedDraft ? (
                '没有匹配项，按回车添加新关键词。'
              ) : (
                '暂无可复用的关键词，可直接输入新词。'
              )
            ) : normalizedDraft &&
              !options.some(
                (keyword) => keyword.toLowerCase() === normalizedDraft.toLowerCase(),
              ) ? (
              '未选中建议项时，按回车添加输入的新词。'
            ) : null}
          </div>
        </div>
      )}
      <small id={`${id}-hint`} className={error ? fieldErrorStyles : ''} aria-live="polite">
        {error || '可直接选择已有关键词；回车或逗号添加新词，支持批量粘贴，最多 20 个。'}
      </small>
    </div>
  );
}
