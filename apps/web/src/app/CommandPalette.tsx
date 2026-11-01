import {
  paletteSearchStyles,
  kbdStyles,
  paletteResultsStyles,
  paletteResultCopyStyles,
  paletteStatusStyles,
  paletteFooterStyles,
} from './styles.js';
import type { SearchResultResponse } from '@capability-hub/contracts/http';
import { type AssetResponse } from '@capability-hub/contracts/http';
import {
  ArrowUpRight,
  Bot,
  Compass,
  Search,
  ShieldCheck,
  UploadCloud,
} from '../shared/icons/lucide.js';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../shared/api/client.js';
import { Overlay } from '../shared/components/Overlay.js';
import { assetHref } from '../shared/navigation/history-route.js';
import { navigate } from '../shared/navigation/history-navigation.js';
import { useHub } from '../shared/context/HubContext.js';
interface PaletteLink {
  label: string;
  description?: string;
  href: string;
  icon: typeof Search;
}
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useHub();
  const [q, setQ] = useState(''),
    [index, setIndex] = useState(0),
    [result, setResult] = useState<{ query: string; items: AssetResponse[]; error?: string }>();
  const composing = useRef(false);
  const activeOption = useRef<HTMLButtonElement>(null);
  const resultsId = useId();
  const term = q.trim();
  useEffect(() => {
    if (open) {
      composing.current = false;
      setQ('');
      setIndex(0);
      setResult(undefined);
    }
  }, [open]);
  useEffect(() => {
    if (!open || !term) return;
    const controller = new AbortController();
    setIndex(0);
    const timer = setTimeout(() => {
      api<SearchResultResponse>('/api/assets?limit=8&q=' + encodeURIComponent(term), {
        signal: controller.signal,
      })
        .then((d) => {
          if (controller.signal.aborted) return;
          setResult({ query: term, items: d.items });
          setIndex(0);
        })
        .catch((e: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              query: term,
              items: [],
              error: e instanceof Error ? e.message : '搜索暂时不可用，请稍后重试',
            });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, term]);
  const actions = [
    { label: '浏览能力库', href: '/discover', icon: Compass },
    { label: '发布资产', href: '/publish', icon: UploadCloud },
    { label: '处理审核', href: '/review', icon: ShieldCheck },
    { label: '接入 Agent', href: '/connect', icon: Bot },
  ].filter((item) => me || item.href === '/discover' || item.href === '/connect');
  const current = result?.query === term ? result : undefined;
  const loading = !!term && !current;
  const links: PaletteLink[] = term
    ? (current?.items ?? []).map((a) => ({
        label: a.slug,
        description: a.description,
        href: assetHref(a.slug),
        icon: Search,
      }))
    : actions;
  useEffect(() => {
    if (open) activeOption.current?.scrollIntoView({ block: 'nearest' });
  }, [open, index, current]);
  function go(i: number) {
    if (links[i]) {
      navigate(links[i].href);
      onClose();
    }
  }
  return (
    <Overlay open={open} onClose={onClose} label="搜索与快速导航" variant="palette">
      <div className={paletteSearchStyles}>
        <Search size={21} />
        <input
          autoFocus
          aria-label="搜索能力或操作"
          value={q}
          maxLength={500}
          onChange={(e) => {
            setQ(e.target.value);
            setIndex(0);
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          placeholder="搜索能力或前往…"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={resultsId}
          aria-activedescendant={links[index] ? resultsId + '-' + index : undefined}
          onKeyDown={(e) => {
            // 输入法组合期间回车只确认输入，不打开结果；Chrome 组合中 key 是 Unidentified，只留 229 可识别。
            // eslint-disable-next-line @typescript-eslint/no-deprecated -- 组合识别没有未废弃的等价字段。
            if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndex((i) => (links.length ? (i + 1) % links.length : 0));
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndex((i) => (links.length ? (i - 1 + links.length) % links.length : 0));
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              go(index);
            }
          }}
        />
        <button className={kbdStyles} onClick={onClose} aria-label="关闭命令面板">
          Esc
        </button>
      </div>
      <div
        className={paletteResultsStyles}
        id={resultsId}
        role="listbox"
        aria-label="搜索结果"
        aria-busy={loading}
      >
        {links.map((l, i) => (
          <button
            role="option"
            aria-selected={i === index}
            ref={i === index ? activeOption : undefined}
            id={resultsId + '-' + i}
            key={l.href}
            onMouseEnter={() => setIndex(i)}
            onClick={() => go(i)}
          >
            <l.icon size={17} />
            <span className={paletteResultCopyStyles}>
              <strong>{l.label}</strong>
              {l.description && <small>{l.description}</small>}
            </span>
            <ArrowUpRight size={15} />
          </button>
        ))}
      </div>
      {loading ? (
        <p className={paletteStatusStyles} role="status">
          正在搜索…
        </p>
      ) : current?.error ? (
        <p className={paletteStatusStyles} role="alert">
          {current.error}
        </p>
      ) : !links.length ? (
        <p className={paletteStatusStyles} role="status">
          没有匹配的可见资产
        </p>
      ) : null}
      <div className={paletteFooterStyles}>
        ↑ ↓ 选择 ↵ 打开 <span>只搜索你有权读取的能力</span>
      </div>
    </Overlay>
  );
}
