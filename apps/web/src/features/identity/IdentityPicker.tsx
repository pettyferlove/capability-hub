import { useState } from 'react';
import {
  Button,
  ComboBox,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
} from 'react-aria-components';
import { ChevronDown, Search } from '../../shared/icons/lucide.js';
import {
  hubSelectOptionStyles,
  hubSelectOptionsStyles,
  hubSelectPopoverStyles,
} from '../../shared/styles/recipes.js';

/** 写入以记录 ID 为准，显示名称不参与标识。 */
export interface IdentityOption {
  id: string;
  label: string;
}

/** 编辑已选文本会清除原 ID，未确认的搜索词不能当作选项提交。 */
export function IdentityPicker({
  label,
  name,
  options,
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string;
  name?: string;
  options: IdentityOption[];
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
}) {
  const [localValue, setLocalValue] = useState('');
  const [query, setQuery] = useState<string>();
  const selected = value ?? localValue;
  const selectedLabel = options.find((option) => option.id === selected)?.label ?? '';
  return (
    <ComboBox<IdentityOption>
      className="grid min-w-0 gap-1.5"
      name={name}
      defaultItems={options}
      value={selected || null}
      menuTrigger={selected ? 'manual' : 'input'}
      inputValue={query ?? selectedLabel}
      onInputChange={(text) => {
        setQuery(text);
        if (text !== selectedLabel && selected) {
          setLocalValue('');
          onChange?.('');
        }
      }}
      onChange={(choice) => {
        const id = String(choice ?? '');
        setQuery(undefined);
        setLocalValue(id);
        onChange?.(id);
      }}
      isRequired={required}
      allowsEmptyCollection
      validationBehavior="native"
    >
      <Label>{label}</Label>
      <div className="relative min-w-0">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 my-auto text-muted-ink"
        />
        <Input
          className="w-full min-w-0 pl-9! pr-11!"
          placeholder={placeholder}
          autoComplete="off"
        />
        <Button
          className="absolute inset-y-1 right-1 grid w-9 place-items-center rounded-md text-muted-ink hover:bg-brand-soft hover:text-brand"
          aria-label={'展开' + label + '选项'}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </Button>
      </div>
      <Popover
        className={hubSelectPopoverStyles}
        data-overlay-child="true"
        placement="bottom start"
        offset={6}
      >
        <ListBox<IdentityOption>
          className={hubSelectOptionsStyles}
          renderEmptyState={() => (
            <span className="block px-3 py-2 text-body text-muted-ink">没有匹配选项</span>
          )}
        >
          {(option) => (
            <ListBoxItem className={hubSelectOptionStyles} id={option.id} textValue={option.label}>
              <span className="min-w-0">{option.label}</span>
            </ListBoxItem>
          )}
        </ListBox>
      </Popover>
    </ComboBox>
  );
}
