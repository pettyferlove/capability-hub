import { dialogTitleStyles, iconBtnStyles } from '../styles/recipes.js';
import { X } from '../icons/lucide.js';

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
