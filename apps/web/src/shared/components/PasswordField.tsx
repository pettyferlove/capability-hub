import { useState } from 'react';
import { InputField } from './InputField.js';

/**
 * 密码输入框（带显隐切换），始终 `required`。可见性只影响 `type`，值不受影响，
 * 切换不会清空已输入内容；`minLength` 只是前端提示，服务端仍会独立校验。
 */
export function PasswordField({
  name,
  label,
  autoComplete = 'new-password',
  minimum = 12,
  placeholder,
}: {
  name: string;
  label: string;
  /** 交给浏览器的自动填充语义：新密码用 `new-password`，登录/当前密码场景要改成 `current-password`。 */
  autoComplete?: string;
  /** 最小长度，默认 12；与后端密码策略不一致时以这个为提交前提示。 */
  minimum?: number;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label>
      {label}
      <InputField
        icon="lock"
        name={name}
        type={show ? 'text' : 'password'}
        required
        minLength={minimum}
        maxLength={256}
        autoComplete={autoComplete}
        placeholder={placeholder}
        trailing={
          <button
            type="button"
            aria-label={show ? '隐藏' + label : '显示' + label}
            className="min-h-7.5 border-0 bg-transparent py-[5px] text-caption text-brand"
            onClick={() => setShow((v) => !v)}
          >
            {show ? '隐藏' : '显示'}
          </button>
        }
      />
    </label>
  );
}
