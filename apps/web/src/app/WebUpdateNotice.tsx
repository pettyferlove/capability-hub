import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { usePendingWebBuild } from '../shared/api/use-pending-web-build.js';
import { bundledWebBuild, webBuildUpdates } from '../shared/api/web-build.js';
import { DotGrid } from '../shared/components/react-bits/DotGrid.js';
import { ShinyText } from '../shared/components/react-bits/ShinyText.js';
import { StarBorder } from '../shared/components/react-bits/StarBorder.js';
import {
  ChevronDown,
  CircleCheck,
  Clock3,
  RefreshCw,
  Sparkles,
  X,
} from '../shared/icons/lucide.js';
import { contentTransition } from '../shared/motion/transitions.js';
import { navigationEvent } from '../shared/navigation/history-navigation.js';
import { cn } from '../shared/styles/cn.js';
import {
  btnPrimaryStyles,
  btnStyles,
  iconBtnStyles,
  stepNumberStyles,
} from '../shared/styles/recipes.js';
import {
  webUpdateCountdownStyles,
  webUpdateDotsStyles,
  webUpdateLabelStyles,
  webUpdateMenuItemStyles,
  webUpdateMenuStyles,
  webUpdateRefreshButtonStyles,
  webUpdateSurfaceStyles,
  webUpdateTickStyles,
} from './styles.js';
import { useAutoDismiss } from './use-auto-dismiss.js';

const countdownSeconds = 10;
const confirmedBuildKey = 'capability-hub:confirmed-web-build';

function readConfirmedBuild() {
  try {
    return window.localStorage.getItem(confirmedBuildKey);
  } catch {
    return null;
  }
}

function rememberBuild(build: string) {
  try {
    window.localStorage.setItem(confirmedBuildKey, build);
  } catch {
    // 禁用存储时仍可在当前标签页确认提示。
  }
}

function reloadCurrentPage() {
  location.reload();
}

/** 本地只记录实际加载的构建，旧页面关闭待刷新提示不等于已加载新版。 */
export function WebUpdateNotice({ onReload = reloadCurrentPage }: { onReload?: () => void }) {
  const build = usePendingWebBuild();
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  const [loadedUpdate, setLoadedUpdate] = useState(() => {
    const previous = bundledWebBuild ? readConfirmedBuild() : null;
    return previous !== null && previous !== bundledWebBuild;
  });

  useEffect(() => {
    if (!bundledWebBuild) return;
    if (readConfirmedBuild() === null) rememberBuild(bundledWebBuild);

    const syncConfirmation = (event: StorageEvent) => {
      if (event.key === confirmedBuildKey && event.newValue === bundledWebBuild)
        setLoadedUpdate(false);
    };
    window.addEventListener('storage', syncConfirmation);
    return () => window.removeEventListener('storage', syncConfirmation);
  }, []);

  const reduceMotion = useReducedMotion();
  const visible = build ? !dismissed.has(build) : loadedUpdate;
  const notice = visible && (
    <WebUpdateRegion key="web-update" animated={!reduceMotion}>
      <WebUpdateCard
        key={build ?? bundledWebBuild}
        build={build}
        onReload={onReload}
        onDismiss={() => {
          if (build) setDismissed((previous) => new Set([...previous, build]));
          else if (bundledWebBuild) {
            rememberBuild(bundledWebBuild);
            setLoadedUpdate(false);
          }
        }}
      />
    </WebUpdateRegion>
  );
  // 减少动态效果时没有退场过渡，关闭后立即卸载。
  return reduceMotion ? notice : <AnimatePresence initial={false}>{notice}</AnimatePresence>;
}

/** 中途出现时展开、关闭时收起，顶栏与正文随之平移而不跳动；退场期间立即移出读屏与交互。 */
function WebUpdateRegion({ animated, children }: { animated: boolean; children: ReactNode }) {
  const present = useIsPresent();
  return (
    <motion.section
      aria-label="版本更新"
      aria-hidden={present ? undefined : true}
      inert={!present}
      className="overflow-hidden text-ink"
      initial={animated ? { height: 0, opacity: 0 } : false}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ ...contentTransition, duration: 0.3 }}
    >
      <div className="mx-auto max-w-310 px-4 pt-2.5 min-[850px]:px-7">{children}</div>
    </motion.section>
  );
}

function WebUpdateCard({
  build,
  onReload,
  onDismiss,
}: {
  build: string | null;
  onReload: () => void;
  onDismiss: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restoreFocusOnCancel = useRef(false);
  const [remaining, setRemaining] = useState<number>();
  const counting = remaining !== undefined;
  const loaded = build === null;
  const autoDismiss = useAutoDismiss(loaded, countdownSeconds, onDismiss);

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
    if (build === null) return;
    const leaving = [navigationEvent, 'popstate', 'pagehide'];
    for (const event of leaving) window.addEventListener(event, cancelCountdown);
    return () => {
      clearTimeout(timer.current);
      for (const event of leaving) window.removeEventListener(event, cancelCountdown);
    };
  }, [build, cancelCountdown]);

  function startCountdown() {
    if (timer.current !== undefined) return;
    const deadline = performance.now() + countdownSeconds * 1_000;
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

  const barSeconds = loaded ? autoDismiss.remaining : remaining;
  return (
    <StarBorder
      {...autoDismiss.holdProps}
      className={cn(webUpdateSurfaceStyles, loaded && 'grid-cols-[minmax(0,1fr)_auto]')}
    >
      <DotGrid className={webUpdateDotsStyles} />
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={cn(stepNumberStyles, loaded && 'bg-success-soft text-success')}
          aria-hidden="true"
        >
          {loaded ? <CircleCheck size={18} /> : <Sparkles size={18} />}
        </span>
        <div role="status" className="min-w-0">
          <p className="flex items-center gap-2.5 text-base leading-5 font-semibold">
            <ShinyText>{loaded ? 'Hub 已更新' : 'Hub 有新版本'}</ShinyText>
            <span className={webUpdateLabelStyles} aria-hidden="true">
              WEB UPDATE
            </span>
          </p>
          <p className="mt-0.5 text-body leading-4.5 text-muted-ink">
            {loaded
              ? '你正在使用最新版本'
              : counting
                ? '倒计时结束后刷新，未保存的修改不会保留'
                : '刷新前请保存正在编辑的内容'}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {loaded ? (
          <Button className={cn(btnStyles, 'sm:px-6')} onPress={onDismiss}>
            知道了
          </Button>
        ) : counting ? (
          <Button
            autoFocus
            aria-label="取消刷新"
            className={cn(btnStyles, btnPrimaryStyles, webUpdateRefreshButtonStyles)}
            onPress={() => {
              restoreFocusOnCancel.current = true;
              cancelCountdown();
            }}
          >
            <span key={remaining} aria-hidden="true" className={webUpdateTickStyles}>
              {String(remaining).padStart(2, '0')}s
            </span>
            取消刷新
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
                  {countdownSeconds} 秒后刷新
                </MenuItem>
              </Menu>
            </Popover>
          </MenuTrigger>
        )}
        {!loaded && (
          <Button
            aria-label="关闭版本提示"
            className={cn(iconBtnStyles, 'size-10 shrink-0 rounded-[10px]')}
            onPress={() => {
              cancelCountdown();
              onDismiss();
            }}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        )}
      </div>
      {barSeconds !== undefined && (
        <span
          aria-hidden="true"
          className={webUpdateCountdownStyles}
          style={{
            animationDuration: `${countdownSeconds}s`,
            animationPlayState: loaded && autoDismiss.paused ? 'paused' : undefined,
            transform: `scaleX(${barSeconds / countdownSeconds})`,
          }}
        />
      )}
    </StarBorder>
  );
}
