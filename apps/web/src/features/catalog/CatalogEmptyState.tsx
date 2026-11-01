import { btnStyles, btnPrimaryStyles } from '../../shared/styles/recipes.js';
import { cn } from '../../shared/styles/cn.js';
import { FolderOpen, Search, UploadCloud } from '../../shared/icons/lucide.js';
import { Empty } from '../../shared/components/Empty.js';
import { useHub } from '../../shared/context/HubContext.js';

/**
 * 目录列表为空时的兜底视图，按「无匹配」与「整库为空」分别给出行动点。
 * 发布入口只对具备 `can_publish` 能力的登录用户出现；未登录时文案改为公开资源说明。
 */
export function CatalogEmptyState({
  browsing,
  onClear,
}: {
  browsing: boolean;
  onClear: () => void;
}) {
  const { me } = useHub();
  if (!browsing)
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
  const canPublish = me?.capabilities.can_publish;
  return (
    <Empty
      title={!me ? '暂无公开资源' : canPublish ? '暂无已发布资源' : '暂无可访问的资源'}
      icon={<FolderOpen size={28} />}
      action={
        canPublish ? (
          <a className={cn(btnStyles, btnPrimaryStyles)} href="/publish">
            <UploadCloud size={16} />
            发布资源
          </a>
        ) : undefined
      }
    >
      {!me
        ? '公开发布的 Skill 和 MCP 将在此处展示。'
        : canPublish
          ? '上传 Skill 或 MCP，审核通过后即可发布。'
          : '当前没有向你开放的已发布 Skill 或 MCP。'}
    </Empty>
  );
}
