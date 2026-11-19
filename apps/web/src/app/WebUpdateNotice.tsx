import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { webBuildUpdates } from '../shared/api/web-build.js';
import { ChevronDown, Clock3, RefreshCw, Sparkles, X } from '../shared/icons/lucide.js';
import { navigationEvent } from '../shared/navigation/history-navigation.js';
import { cn } from '../shared/styles/cn.js';
import { btnPrimaryStyles, btnStyles, iconBtnStyles } from '../shared/styles/recipes.js';
import {
  webUpdateGridStyles,
  webUpdateMarkStyles,
  webUpdateMenuItemStyles,
  webUpdateMenuStyles,
  webUpdateRefreshButtonStyles,
  webUpdateSurfaceStyles,
} from './styles.js';

const refreshDelaySeconds = 10;

function reloadCurrentPage() {
  location.reload();
}

/** 关闭只影响对应构建，不影响之后的部署提示。 */
export function WebUpdateNotice({ onReload = reloadCurrentPage }: { onReload?: () => void }) {
  const build = useSyncExternalStore(webBuildUpdates.subscribe, webBuildUpdates.getSnapshot);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  if (!build || dismissed.has(build)) return null;
  return (
    <WebUpdateCard
      key={build}
      build={build}
      onReload={onReload}
      onDismiss={() => setDismissed((previous) => new Set([...previous, build]))}
    />
  );
}

function WebUpdateCard({
  build,
  onReload,
  onDismiss,
}: {
  build: string;
  onReload: () => void;
  onDismiss: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restoreFocusOnCancel = useRef(false);
  const [remaining, setRemaining] = useState<number>();
  const counting = remaining !== undefined;

  const cancelCountdown = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    setRemaining(undefined);
  }, []);

  const focusRefreshTrigger = useCallback((button: HTMLButtonElement | null) => {
    if (!button || !restoreFocusOnCancel.current) return;
    restoreFocusOnCancel.current = false;
    button.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const leaving = [navigationEvent, 'popstate', 'pagehide'];
    for (const event of leaving) window.addEventListener(event, cancelCountdown);
    return () => {
      clearTimeout(timer.current);
      for (const event of leaving) window.removeEventListener(event, cancelCountdown);
    };
  }, [cancelCountdown]);

  function startCountdown() {
    if (timer.current !== undefined) return;
    const deadline = performance.now() + refreshDelaySeconds * 1_000;
    const page = location.href;
    function tick() {
      if (webBuildUpdates.getSnapshot() !== build || location.href !== page) {
        cancelCountdown();
        return;
      }
      const left = deadline - performance.now();
      if (left <= 0) {
        cancelCountdown();
        onReload();
        return;
      }
      const seconds = Math.ceil(left / 1_000);
      setRemaining(seconds);
      timer.current = setTimeout(tick, Math.ceil(left - (seconds - 1) * 1_000));
    }
    tick();
  }

  return (
    <section
      aria-label="版本更新"
      className="mx-auto max-w-310 px-4 pt-2.5 text-ink min-[850px]:px-7"
    >
      <div className={webUpdateSurfaceStyles}>
        <div className={webUpdateGridStyles} aria-hidden="true" />
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3.5">
          <span className={webUpdateMarkStyles} aria-hidden="true">
            <Sparkles size={20} />
          </span>
          <div role="status" className="min-w-0">
            <p className="flex items-center gap-2.5 text-section leading-5 font-semibold">
              Hub 已更新
              <span
                className="hidden rounded-full border border-brand/20 bg-paper/65 px-2 py-0.5 font-mono text-caption leading-none tracking-wider text-brand sm:inline-block"
                aria-hidden="true"
              >
                WEB UPDATE
              </span>
            </p>
            <p className="mt-0.5 text-sm text-muted-ink">
              {counting ? '倒计时结束后刷新，未保存的修改不会保留' : '刷新前请保存正在编辑的内容'}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          {counting ? (
            <Button
              autoFocus
              aria-label="取消刷新"
              className={cn(btnStyles, btnPrimaryStyles, webUpdateRefreshButtonStyles)}
              onPress={() => {
                restoreFocusOnCancel.current = true;
                cancelCountdown();
              }}
            >
              <span aria-hidden="true" className="font-mono tabular-nums">
                {String(remaining).padStart(2, '0')}s
              </span>
              取消刷新
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-on-brand/65 motion-safe:transition-transform motion-safe:duration-500"
                style={{ transform: `scaleX(${remaining / refreshDelaySeconds})` }}
              />
            </Button>
          ) : (
            <MenuTrigger>
              <Button
                ref={focusRefreshTrigger}
                className={cn(btnStyles, btnPrimaryStyles, webUpdateRefreshButtonStyles)}
              >
                <RefreshCw size={14} aria-hidden="true" />
                刷新页面
                <ChevronDown size={13} aria-hidden="true" className="opacity-75" />
              </Button>
              <Popover
                className={webUpdateMenuStyles}
                placement="bottom end"
                offset={6}
                data-overlay-child="true"
              >
                <Menu aria-label="刷新方式" className="outline-none">
                  <MenuItem className={webUpdateMenuItemStyles} onAction={onReload}>
                    <RefreshCw size={14} aria-hidden="true" />
                    立即刷新
                  </MenuItem>
                  <MenuItem className={webUpdateMenuItemStyles} onAction={startCountdown}>
                    <Clock3 size={14} aria-hidden="true" />
                    {refreshDelaySeconds} 秒后刷新
                  </MenuItem>
                </Menu>
              </Popover>
            </MenuTrigger>
          )}
          <Button
            aria-label="关闭版本提示"
            className={cn(iconBtnStyles, 'size-11 shrink-0 rounded-xl')}
            onPress={() => {
              cancelCountdown();
              onDismiss();
            }}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}
