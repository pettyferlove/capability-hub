import { dialogTitleStyles, iconBtnStyles } from '../styles/recipes.js';
import { X } from '../icons/lucide.js';

/**
 * 弹层标题栏（同时是关闭按钮所在行）；只负责呈现，不处理 Esc 与遮罩点击——
 * 那些交给外层 {@link Overlay}，避免两处都能关闭导致动画重复播放或历史被推两次。
 */
export function DialogTitle({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className={dialogTitleStyles}>
      <h2>{title}</h2>
      <button type="button" className={iconBtnStyles} aria-label="关闭" onClick={onClose}>
        <X size={20} />
      </button>
    </div>
  );
}
