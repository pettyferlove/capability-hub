import { LockKeyhole } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { tagStyles, tagTealStyles } from '../../shared/styles/recipes.js';

/** 在待审记录和共享研判中标识访问权限，独立于任务的运行状态。 */
export function ReadOnlyBadge() {
  return (
    <span
      className={cn(
        tagStyles,
        tagTealStyles,
        'shrink-0 gap-1 whitespace-nowrap px-1.5 py-0.5 font-medium ring-1 ring-inset ring-brand/15',
      )}
    >
      <LockKeyhole size={11} aria-hidden="true" />
      只读
    </span>
  );
}
