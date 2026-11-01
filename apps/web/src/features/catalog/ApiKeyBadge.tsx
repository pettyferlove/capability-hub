import { KeyRound } from '../../shared/icons/lucide.js';
import { cn } from '../../shared/styles/cn.js';
import { tagStyles, tagWarningStyles } from '../../shared/styles/recipes.js';

/** 需要配置 API Key 才能使用的标记；具体填法交给 Skill 文档，这里只提示。 */
export function ApiKeyBadge() {
  return (
    <span
      className={cn(tagStyles, tagWarningStyles)}
      title="全部或部分功能需要配置 API Key，详见 Skill 文档。"
    >
      <KeyRound size={12} aria-hidden="true" />需 API Key
    </span>
  );
}
