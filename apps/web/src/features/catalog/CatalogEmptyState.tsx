import { btnStyles } from '../../shared/styles/recipes.js';
import { Search } from '../../shared/icons/lucide.js';
import { Empty } from '../../shared/components/Empty.js';

/**
 * 筛选或关键词下没有匹配资源时的兜底视图，提供一键重置；
 * 目录对当前访问者整体为空时由 {@link CatalogOnboarding} 接管，不走这里。
 */
export function CatalogEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <Empty
      title="未找到匹配资源"
      icon={<Search size={28} />}
      action={
        <button className={btnStyles} onClick={onClear}>
          重置筛选
        </button>
      }
    >
      请调整搜索词或筛选条件后重试。
    </Empty>
  );
}
