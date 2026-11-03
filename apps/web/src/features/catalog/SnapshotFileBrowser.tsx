import { VersionLabel } from '../../shared/components/VersionLabel.js';
import {
  detailFileWorkspaceStyles,
  detailFileExplorerStyles,
  detailFileSearchStyles,
  fileListStyles,
  detailFileNoMatchStyles,
  detailFilePreviewStyles,
  detailFilePreviewHeadStyles,
  detailPreviewActionsStyles,
  detailPreviewModesStyles,
  detailFilePreviewContentStyles,
  markdownStyles,
  detailFileSourceStyles,
  detailFileProofStyles,
} from './styles.js';
import { iconBtnStyles, activeStyles, subtleStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import type { AssetResponse } from '@capability-hub/contracts/http';
import { Download, FileText, Search, X } from '../../shared/icons/lucide.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CopyButton } from '../../shared/components/CopyButton.js';
import { ErrorState } from '../../shared/components/ErrorState.js';
import { Message } from '../../shared/components/Message.js';
import {
  SafeMarkdown,
  markdownBody,
  scrollMarkdownAnchor,
} from '../../shared/components/SafeMarkdown.js';
import { CodeSkeleton } from '../../shared/components/Skeleton.js';
import { bytesLabel } from '../../shared/format/labels.js';
import { useHub } from '../../shared/context/HubContext.js';
import { useSnapshotFile } from './use-snapshot-file.js';

/**
 * 固定版本的文件浏览器：左侧按 `asset.files` 过滤，右侧预览单个文件。
 * 只有 `active` 时才会请求正文，非 Markdown 或 `source` 模式直接给原文；
 * 搜索词与预览滚动位置按 `path`（滚动还带 `mode`）分别记忆，切回同一文件时恢复。
 */
export function SnapshotFileBrowser({
  asset,
  path,
  anchor,
  active,
  mode,
  onModeChange,
  onOpen,
}: {
  asset: AssetResponse;
  path: string;
  anchor?: string;
  active: boolean;
  mode: 'read' | 'source';
  onModeChange: (mode: 'read' | 'source') => void;
  onOpen: (path: string, anchor?: string) => void;
}) {
  const { refresh } = useHub();
  const preview = useSnapshotFile(asset.current_release.version_id, active ? path : null, refresh);
  const [search, setSearch] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const positionKey = `${path}:${mode}`;
  const markdown = /\.(md|markdown)$/i.test(path);
  const rendered = markdown && mode === 'read';
  const files = asset.files.filter((file) =>
    file.path.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const download = `/api/versions/${asset.current_release.version_id}/files?path=${encodeURIComponent(path)}`;
  useEffect(() => {
    setSearch((value) => (path.toLowerCase().includes(value.trim().toLowerCase()) ? value : ''));
  }, [path]);
  useLayoutEffect(() => {
    const container = list.current;
    const selected = container?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!active || !container || !selected) return;
    const bounds = container.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    if (item.top < bounds.top) container.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) container.scrollTop += item.bottom - bounds.bottom;
  }, [path, search, active]);
  useLayoutEffect(() => {
    if (!active || preview.loading || !content.current) return;
    content.current.scrollTop = positions.current.get(positionKey) ?? 0;
    const article = content.current.querySelector<HTMLElement>('[data-markdown]');
    if (anchor && rendered && article) scrollMarkdownAnchor(article, anchor);
  }, [active, path, anchor, positionKey, preview.loading, preview.text, rendered]);
  return (
    <section className={detailFileWorkspaceStyles} aria-label="固定版本文件浏览器">
      <div className={detailFileExplorerStyles}>
        <label className={detailFileSearchStyles}>
          <Search size={14} />
          <input
            type="search"
            aria-label="搜索快照文件"
            placeholder="查找文件…"
            maxLength={200}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && search) {
                event.stopPropagation();
                setSearch('');
              }
            }}
          />
          {search && (
            <button
              type="button"
              className={iconBtnStyles}
              aria-label="清除文件搜索"
              onClick={() => setSearch('')}
            >
              <X size={13} />
            </button>
          )}
          <span>{search ? `${files.length}/${asset.files.length}` : asset.files.length}</span>
        </label>
        <div className={fileListStyles} ref={list}>
          {files.map((file) => (
            <button
              type="button"
              className={path === file.path ? activeStyles : ''}
              key={file.path}
              onClick={() => onOpen(file.path)}
              title={file.path}
              aria-label={'预览文件 ' + file.path}
              aria-pressed={path === file.path}
            >
              <FileText size={16} />
              <span>
                <strong>{file.path.split('/').at(-1)}</strong>
                <small>
                  {file.path.includes('/')
                    ? file.path.slice(0, file.path.lastIndexOf('/'))
                    : bytesLabel(file.size)}
                </small>
              </span>
            </button>
          ))}
          {!files.length && (
            <p className={cn(subtleStyles, detailFileNoMatchStyles)}>没有匹配的文件</p>
          )}
        </div>
      </div>
      <div className={detailFilePreviewStyles}>
        <div className={detailFilePreviewHeadStyles}>
          <code title={path}>{path}</code>
          <div className={detailPreviewActionsStyles}>
            {markdown && (
              <div className={detailPreviewModesStyles} role="group" aria-label="文件预览方式">
                <button
                  type="button"
                  aria-pressed={mode === 'read'}
                  onClick={() => onModeChange('read')}
                >
                  阅读
                </button>
                <button
                  type="button"
                  aria-pressed={mode === 'source'}
                  onClick={() => onModeChange('source')}
                >
                  源码
                </button>
              </div>
            )}
            {preview.text !== undefined && !preview.error && <CopyButton text={preview.text} />}
            <a aria-label="下载当前预览文件" title="下载原始文件" href={download}>
              <Download size={15} />
            </a>
          </div>
        </div>
        <div
          className={detailFilePreviewContentStyles}
          ref={content}
          tabIndex={0}
          aria-label={'文件内容 ' + path}
          aria-busy={preview.loading || preview.refreshing}
          onScroll={(event) => positions.current.set(positionKey, event.currentTarget.scrollTop)}
        >
          {preview.loading ? (
            <CodeSkeleton />
          ) : preview.error ? (
            preview.unavailable ? (
              <Message>
                {preview.error} <a href={download}>下载该文件</a>
              </Message>
            ) : (
              <ErrorState message={preview.error} retry={preview.retry} />
            )
          ) : rendered ? (
            <article data-markdown className={markdownStyles}>
              <SafeMarkdown
                text={markdownBody(preview.text ?? '')}
                currentFile={path}
                paths={asset.files.map((file) => file.path)}
                onOpen={onOpen}
              />
            </article>
          ) : (
            <pre className={detailFileSourceStyles}>{preview.text}</pre>
          )}
        </div>
        <div className={detailFileProofStyles}>
          <span>{bytesLabel(asset.files.find((file) => file.path === path)?.size ?? 0)}</span>
          <span>
            固定版本 <VersionLabel value={asset.current_release.version_label} />
          </span>
        </div>
      </div>
    </section>
  );
}
