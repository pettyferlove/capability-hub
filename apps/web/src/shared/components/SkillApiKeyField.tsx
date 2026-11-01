import { useId } from 'react';
import { checkLabelStyles, subtleStyles } from '../styles/recipes.js';

/**
 * Skill 的「需要 API Key」勾选项（受控）：勾上只是声明，平台不会代为校验或保存使用者的密钥，
 * 具体配置方式要求写在 Skill 文档里——因此文案与提示必须一起展示，不能只留复选框。
 */
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
