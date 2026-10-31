import { tagStyles, tagWarningStyles } from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import { FileTerminal } from '../icons/lucide.js';

export function ScriptBadge() {
  return (
    <span className={cn(tagStyles, tagWarningStyles)}>
      <FileTerminal size={12} aria-hidden="true" />
      含脚本
    </span>
  );
}
