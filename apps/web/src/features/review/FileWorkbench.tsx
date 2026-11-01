/**
 * 变更文件工作台：左树右预览，变更清单来自 `ReviewResponse.diff`，能否出 diff 取决于两侧 manifest。
 * 选中文件时由 `fileText` 并发拉取候选与上一版正文（缺失的一侧跳过），切换或卸载即 abort，
 * 失败只影响当前文件，可用重试计数原地重取。
 */
import { fileFilterIcons } from '../../shared/components/select-icons.js';
import {
  reviewTreeFileStyles,
  reviewTreeFolderStyles,
  reviewFileWorkbenchStyles,
  reviewFileToolbarStyles,
  reviewFileSplitStyles,
  reviewFileExplorerStyles,
  fileExplorerSearchStyles,
  reviewFileTreeStyles,
  fileTreeEmptyStyles,
  fileTreeLegendStyles,
  addedStyles,
  modifiedStyles,
  removedStyles,
  reviewFileViewerStyles,
  fileViewerTitleStyles,
  fileViewerDownloadsStyles,
  fileViewerSubbarStyles,
  fileWrapToggleStyles,
  fileViewerLoadingStyles,
  filePreviewUnavailableStyles,
  reviewCodeScrollStyles,
  wrapLinesStyles,
  reviewCodeLinesStyles,
  reviewCodeLineStyles,
  lineOldStyles,
  lineNewStyles,
  lineSignStyles,
  filePreviewLimitStyles,
} from './styles.js';
import { selectedStyles, textBtnStyles, btnStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import type { ReviewResponse } from '@capability-hub/contracts/http';
import { diffLines } from 'diff';
import {
  Archive,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Download,
  FileCode2,
  Files,
  FileText,
  Folder,
  RefreshCw,
  Search,
  WrapText,
} from '../../shared/icons/lucide.js';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { fileText, PreviewUnavailable } from '../../shared/api/client.js';
import { SelectField } from '../../shared/components/SelectField.js';
import { CodeSkeleton } from '../../shared/components/Skeleton.js';
import { bytesLabel } from '../../shared/format/labels.js';
import type { ChangeFile } from './types.js';

const fileStatusStyles: Record<string, string> = {
  added: addedStyles,
  modified: modifiedStyles,
  removed: removedStyles,
};

type Tree = {
  name: string;
  path: string;
  children: Map<string, Tree>;
  file?: ChangeFile;
  count: number;
};

/**
 * 默认选中 `SKILL.md`、其次 `server.json`、再退到首个变更文件；`focus` 指向存在变更的文件时
 * 覆盖该默认值，并展开其所在目录把焦点移到预览标题；定位只认 `focus.path`，不存在则不理会。
 */
export function FileWorkbench({
  request: r,
  focus,
}: {
  request: ReviewResponse;
  focus?: { path: string };
}) {
  const files: ChangeFile[] = r.diff;
  const treeRef = useRef<HTMLDivElement>(null),
    selectedRef = useRef<HTMLButtonElement>(null),
    previewTitleRef = useRef<HTMLDivElement>(null);
  const [path, setPath] = useState(
      files.find((f) => f.path === 'SKILL.md')?.path ??
        files.find((f) => f.path === 'server.json')?.path ??
        files[0]?.path ??
        '',
    ),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('changed'),
    [next, setNext] = useState(''),
    [old, setOld] = useState(''),
    [loading, setLoading] = useState(false),
    [loadedPreview, setLoadedPreview] = useState(''),
    [error, setError] = useState(''),
    [unavailable, setUnavailable] = useState(false),
    [retry, setRetry] = useState(0),
    [mode, setMode] = useState('diff'),
    [highlightedPath, setHighlightedPath] = useState(''),
    [wrap, setWrap] = useState(true),
    [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => {
    const container = treeRef.current,
      element = selectedRef.current;
    if (!container || !element) return;
    const target = element.getBoundingClientRect(),
      bounds = container.getBoundingClientRect();
    if (target.top < bounds.top || target.bottom > bounds.bottom)
      container.scrollTop += target.top - bounds.top - container.clientHeight / 3;
  }, [path, expanded, search]);
  const selected = files.find((f) => f.path === path);
  const hasOld = !!r.current?.manifest?.files.some((f) => f.path === path),
    hasNext = !!r.candidate.manifest.files.some((f) => f.path === path);
  const previewKey = r.id + ':' + path;
  useEffect(() => {
    const focusPath = focus?.path;
    if (!focusPath || !files.some((f) => f.path === focusPath)) return;
    setPath(focusPath);
    setSearch('');
    setFilter('all');
    const parts = focusPath.split('/');
    parts.pop();
    setExpanded((previous) => {
      const result = new Set(previous);
      let path = '';
      for (const part of parts) {
        path = path ? path + '/' + part : part;
        result.add(path);
      }
      return result;
    });
    // 等待文件选择和 Tab 切换提交后，再把视线与键盘焦点带到预览标题。
    const frame = requestAnimationFrame(() => {
      const title = previewTitleRef.current;
      if (!title) return;
      title.focus({ preventScroll: true });
      title.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      setHighlightedPath(focusPath);
    });
    const timer = setTimeout(() => setHighlightedPath(''), 1800);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [focus]);
  useEffect(() => {
    if (!path) return;
    let live = true;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setUnavailable(false);
    Promise.all([
      hasNext ? fileText(r.version_id, path, true, controller.signal) : Promise.resolve(''),
      hasOld && r.current
        ? fileText(r.current.release.version_id, path, true, controller.signal)
        : Promise.resolve(''),
    ])
      .then(([candidate, previous]) => {
        if (live) {
          setNext(candidate);
          setOld(previous);
        }
      })
      .catch((e: unknown) => {
        if (live) {
          setError(e instanceof Error ? e.message : '无法加载文件内容');
          setUnavailable(e instanceof PreviewUnavailable);
        }
      })
      .finally(() => {
        if (live) {
          setLoadedPreview(previewKey);
          setLoading(false);
        }
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [r.id, path, retry]);
  const shown = useMemo(
    () =>
      files.filter(
        (f) =>
          (filter !== 'changed' || f.status !== 'unchanged') &&
          (!search || f.path.toLowerCase().includes(search.toLowerCase())),
      ),
    [files, filter, search],
  );
  const nodes = useMemo(() => {
    const root: Tree = { name: '', path: '', children: new Map(), count: 0 };
    for (const file of shown) {
      let at = root;
      let prefix = '';
      for (const part of file.path.split('/')) {
        prefix = prefix ? prefix + '/' + part : part;
        if (!at.children.has(part))
          at.children.set(part, { name: part, path: prefix, children: new Map(), count: 0 });
        at = at.children.get(part)!;
        at.count++;
      }
      at.file = file;
    }
    return [...root.children.values()].sort(sortTree);
  }, [shown]);
  const tree = (node: Tree, depth = 0): ReactNode =>
    node.file ? (
      <button
        key={node.path}
        className={cn(reviewTreeFileStyles, path === node.path ? selectedStyles : '')}
        ref={path === node.path ? selectedRef : undefined}
        style={{ paddingLeft: 12 + depth * 13 }}
        title={node.path}
        aria-label={'查看文件 ' + node.path}
        aria-current={path === node.path ? 'true' : undefined}
        onClick={() => setPath(node.path)}
      >
        <FileText size={13} />
        <span>{node.name}</span>
        <i className={fileStatusStyles[node.file.status]}>
          {
            ({ added: 'A', modified: 'M', removed: 'D', unchanged: '·' } as Record<string, string>)[
              node.file.status
            ]
          }
        </i>
      </button>
    ) : (
      <div key={node.path}>
        <button
          className={reviewTreeFolderStyles}
          style={{ paddingLeft: 9 + depth * 13 }}
          aria-expanded={expanded.has(node.path) || !!search}
          onClick={() =>
            setExpanded((previous) => {
              const value = new Set(previous);
              if (value.has(node.path)) value.delete(node.path);
              else value.add(node.path);
              return value;
            })
          }
        >
          {expanded.has(node.path) || search ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )}
          <Folder size={13} />
          <span>{node.name}</span>
          <small>{node.count}</small>
        </button>
        {(expanded.has(node.path) || search) &&
          [...node.children.values()].sort(sortTree).map((child) => tree(child, depth + 1))}
      </div>
    );
  const parts = useMemo(
    () =>
      mode === 'diff' && !error
        ? diffLines(old, next, { timeout: 150, maxEditLength: 5000 })
        : undefined,
    [old, next, mode, error],
  );
  const lines = useMemo(() => {
    let before = 0,
      after = 0;
    return parts?.flatMap((part) => {
      const text = part.value.split('\n');
      if (text.at(-1) === '') text.pop();
      return text.map((value) => ({
        text: value,
        before: part.added ? '' : String(++before),
        after: part.removed ? '' : String(++after),
        kind: part.added ? 'added' : part.removed ? 'removed' : 'context',
      }));
    });
  }, [parts]);
  const currentText = hasNext ? next : old;
  const previewLines =
    mode === 'diff' && lines
      ? lines
      : currentText
          .split('\n')
          .map((text, i) => ({ text, before: '', after: String(i + 1), kind: 'context' }));
  const overflow = previewLines.length > 800;
  return (
    <section className={cn(reviewFileWorkbenchStyles, 'scroll-mt-25')} id="review-files">
      <div className={reviewFileToolbarStyles}>
        <div>
          <Files size={17} />
          <strong>文件变更</strong>
          <span>
            {shown.length} / {files.length}
          </span>
        </div>
        <SelectField
          optionIcons={fileFilterIcons}
          aria-label="文件范围"
          value={filter}
          onValueChange={(nextValue) => setFilter(nextValue)}
        >
          <option value="changed">只看有变化的文件</option>
          <option value="all">全部文件</option>
        </SelectField>
      </div>
      <div className={reviewFileSplitStyles}>
        <aside className={reviewFileExplorerStyles}>
          <div className={fileExplorerSearchStyles}>
            <Search size={14} />
            <input
              aria-label="搜索变更文件"
              placeholder="查找路径或文件名…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className={reviewFileTreeStyles} ref={treeRef} aria-label="变更文件目录">
            {nodes.length ? (
              nodes.map((node) => tree(node))
            ) : (
              <div className={fileTreeEmptyStyles}>
                {search ? '没有匹配的文件' : '内容没有变化，本次主要审查分发策略。'}
                {filter === 'changed' && !search && (
                  <button className={textBtnStyles} onClick={() => setFilter('all')}>
                    查看内容快照
                  </button>
                )}
              </div>
            )}
          </div>
          <div className={fileTreeLegendStyles}>
            <span>
              <i className={addedStyles}>A</i>新增
            </span>
            <span>
              <i className={modifiedStyles}>M</i>修改
            </span>
            <span>
              <i className={removedStyles}>D</i>删除
            </span>
          </div>
        </aside>
        <div className={reviewFileViewerStyles}>
          <div
            ref={previewTitleRef}
            className={fileViewerTitleStyles}
            role="group"
            aria-label={'文件预览：' + path}
            tabIndex={-1}
            data-highlighted={highlightedPath === path || undefined}
          >
            <div>
              <FileCode2 size={15} />
              <code title={path}>{path || '选择一个文件'}</code>
            </div>
            <div className={fileViewerDownloadsStyles}>
              {hasNext && (
                <a
                  title="下载候选文件"
                  aria-label="下载候选文件"
                  href={`/api/management/versions/${r.version_id}/files?path=${encodeURIComponent(path)}`}
                >
                  <Download size={15} />
                </a>
              )}
              {hasOld && r.current && (
                <a
                  title="下载当前版本文件"
                  aria-label="下载当前版本文件"
                  href={`/api/management/versions/${r.current.release.version_id}/files?path=${encodeURIComponent(path)}`}
                >
                  <ArrowUpRight size={15} />
                </a>
              )}
            </div>
          </div>
          <div className={fileViewerSubbarStyles}>
            <div role="group" aria-label="文件预览方式">
              <button
                aria-pressed={mode === 'diff'}
                className={mode === 'diff' ? selectedStyles : ''}
                onClick={() => setMode('diff')}
              >
                差异
              </button>
              <button
                aria-pressed={mode === 'source'}
                className={mode === 'source' ? selectedStyles : ''}
                onClick={() => setMode('source')}
              >
                源文件
              </button>
            </div>
            <button
              className={fileWrapToggleStyles}
              aria-pressed={wrap}
              onClick={() => setWrap((value) => !value)}
              title="切换长行自动换行"
            >
              <WrapText size={13} />
              自动换行
            </button>
            <span>
              {selected?.status === 'added'
                ? '新增文件'
                : selected?.status === 'removed'
                  ? '已删除'
                  : selected?.status === 'modified'
                    ? '内容有修改'
                    : '内容未变'}{' '}
              · {bytesLabel(selected?.size ?? 0)}
            </span>
          </div>
          {loading || loadedPreview !== previewKey ? (
            <div className={fileViewerLoadingStyles}>
              <CodeSkeleton />
            </div>
          ) : error ? (
            <div className={filePreviewUnavailableStyles}>
              <Archive size={35} />
              <h4>{unavailable ? '此资源不适合文本预览' : '无法读取文件'}</h4>
              <p>{error}</p>
              {unavailable ? (
                <>
                  <p>可下载原始资源审查。平台不执行或递归展开。</p>
                  <code>{selected?.sha256}</code>
                </>
              ) : (
                <button className={btnStyles} onClick={() => setRetry((value) => value + 1)}>
                  <RefreshCw size={14} />
                  重新读取
                </button>
              )}
              {hasNext && unavailable && (
                <a
                  className={btnStyles}
                  href={`/api/management/versions/${r.version_id}/files?path=${encodeURIComponent(path)}`}
                >
                  <Download size={14} />
                  下载候选资源
                </a>
              )}
            </div>
          ) : (
            <>
              <div
                className={cn(reviewCodeScrollStyles, wrap ? wrapLinesStyles : '')}
                tabIndex={0}
                aria-label={'内容预览 ' + path}
              >
                <div className={reviewCodeLinesStyles}>
                  {previewLines.slice(0, 800).map((line, i) => (
                    <div key={i} className={cn(reviewCodeLineStyles, `group/${line.kind}`)}>
                      <span className={lineOldStyles}>{line.before}</span>
                      <span className={lineNewStyles}>{line.after}</span>
                      <span className={lineSignStyles}>
                        {line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}
                      </span>
                      <code>{line.text || ' '}</code>
                    </div>
                  ))}
                </div>
              </div>
              {(overflow || (mode === 'diff' && !parts)) && (
                <div className={filePreviewLimitStyles}>
                  {overflow ? '当前显示前 800 行，' : '差异计算达到限额，当前展示原文，'}
                  请下载完整文件完成所需审查。
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
function sortTree(a: Tree, b: Tree) {
  return Number(!!a.file) - Number(!!b.file) || a.name.localeCompare(b.name);
}
