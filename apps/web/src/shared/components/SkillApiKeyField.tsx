import { useId } from 'react';
import { checkLabelStyles, subtleStyles } from '../styles/recipes.js';

export function SkillApiKeyField({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const hintId = useId();
  return (
    <label className={checkLabelStyles}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-labelledby={hintId + '-label'}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="flex flex-col gap-1">
        <span id={hintId + '-label'}>使用时需要 API Key</span>
        <span id={hintId} className={subtleStyles}>
          若全部或部分功能需要使用者自行配置 API Key，请勾选，并在 Skill 文档中说明配置方式。
        </span>
      </span>
    </label>
  );
}
