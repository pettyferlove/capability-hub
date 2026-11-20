import { useEffectEvent, useLayoutEffect, useState } from 'react';
import { Button } from 'react-aria-components';
import { useAutoDismiss } from '../../app/use-auto-dismiss.js';
import {
  openHubFeedback,
  type HubFeedbackFailure,
  type HubFeedbackSeed,
} from '../../shared/hub-feedback-events.js';
import { cn } from '../../shared/styles/cn.js';
import { kfocusStyles } from '../../shared/styles/recipes.js';

const preferenceKey = 'capability-hub:feedback-hints';
const seen = new Set<string>();
let disabledForPage = false;

function hintsDisabled() {
  try {
    return disabledForPage || window.localStorage.getItem(preferenceKey) === 'off';
  } catch {
    return disabledForPage;
  }
}

const hintPosition =
  'fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[max(1rem,env(safe-area-inset-bottom))] z-[9]';
const actionStyles = cn(kfocusStyles, 'min-h-8 cursor-pointer rounded-full px-2 font-medium');

function FailureCapsule({
  hidden,
  seed,
  dismiss,
}: {
  hidden: boolean;
  seed: HubFeedbackSeed;
  dismiss: () => void;
}) {
  const { holdProps } = useAutoDismiss(!hidden, 10, dismiss);
  return (
    <div
      {...holdProps}
      data-feedback-chrome
      data-feedback-hint
      hidden={hidden}
      className={cn(
        hintPosition,
        hidden ? 'hidden' : 'flex',
        'max-w-[calc(100%-2rem)] flex-wrap items-center gap-x-1 rounded-full border border-brand bg-paper px-3 py-1 text-label shadow-[var(--shadow-floating)]',
      )}
    >
      <span role="status" className="px-2 text-ink">
        刚才的操作失败了
      </span>
      <Button
        className={cn(actionStyles, 'text-brand data-[hovered]:bg-brand-soft')}
        onPress={() => {
          dismiss();
          openHubFeedback(seed);
        }}
      >
        反馈此问题
      </Button>
      <Button
        className={cn(actionStyles, 'text-muted-ink data-[hovered]:bg-page')}
        onPress={() => {
          disabledForPage = true;
          try {
            window.localStorage.setItem(preferenceKey, 'off');
          } catch {
            // 存储不可用时仍在本页关闭提示。
          }
          dismiss();
        }}
      >
        不再提示
      </Button>
    </div>
  );
}

export function HubFeedbackHints({ hidden = false }: { hidden?: boolean }) {
  const [failure, setFailure] = useState<HubFeedbackFailure>();
  const onFailure = useEffectEvent(({ detail }: WindowEventMap['hub:feedback-failure']) => {
    if (
      hidden ||
      hintsDisabled() ||
      seen.has(detail.code) ||
      (detail.status !== undefined &&
        detail.status !== 0 &&
        !(detail.status >= 500 && detail.status <= 599))
    )
      return;
    seen.add(detail.code);
    setFailure(detail);
  });
  useLayoutEffect(() => {
    const notify = (event: WindowEventMap['hub:feedback-failure']) => onFailure(event);
    window.addEventListener('hub:feedback-failure', notify);
    return () => window.removeEventListener('hub:feedback-failure', notify);
  }, []);

  return failure ? (
    <FailureCapsule
      key={failure.code}
      hidden={hidden}
      seed={failure.seed}
      dismiss={() => setFailure(undefined)}
    />
  ) : null;
}
