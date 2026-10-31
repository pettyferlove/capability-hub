import { useState } from 'react';
import { InputField } from './InputField.js';

export function PasswordField({
  name,
  label,
  autoComplete = 'new-password',
  minimum = 12,
  placeholder,
}: {
  name: string;
  label: string;
  autoComplete?: string;
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
