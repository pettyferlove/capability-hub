import { tagStyles, tagWarningStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { FileTerminal } from '../icons/lucide.js';

/** 「含脚本」警示标签；文案固定，调用方只在确认资产带可执行脚本时才渲染它。 */
export function ScriptBadge() {
  return (
    <span className={cn(tagStyles, tagWarningStyles)}>
      <FileTerminal size={12} aria-hidden="true" />
      含脚本
    </span>
  );
}
