import { useState, useSyncExternalStore } from 'react';
import { Button } from 'react-aria-components';
import { webBuildUpdates } from '../shared/api/web-build.js';
import { X } from '../shared/icons/lucide.js';
import { btnStyles, iconBtnStyles } from '../shared/styles/recipes.js';

/** 关闭只影响对应构建，不影响之后的部署提示。 */
export function WebUpdateNotice() {
  const build = useSyncExternalStore(webBuildUpdates.subscribe, webBuildUpdates.getSnapshot);
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(() => new Set());
  if (!build || dismissed.has(build)) return null;
  return (
    <section aria-label="版本更新" className="border-b border-line bg-brand-soft text-ink">
      <div className="mx-auto flex max-w-310 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
        <p role="status">Hub 已更新，刷新页面后使用新版本</p>
        <div className="ml-auto flex items-center gap-2">
          <Button className={btnStyles} onPress={() => location.reload()}>
            刷新页面
          </Button>
          <Button
            aria-label="关闭版本提示"
            className={iconBtnStyles}
            onPress={() => setDismissed((previous) => new Set([...previous, build]))}
          >
            <X size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}
