import {
  hubSelectOptionStyles,
  hubSelectStyles,
  hubSelectTriggerStyles,
  hubSelectPopoverStyles,
  hubSelectOptionsStyles,
} from '../styles/recipes.js';
import { cn } from '../styles/cn.js';
import type { IconComponent } from '../icons/AppIcon.js';
import { Check, ChevronDown } from '../icons/lucide.js';
import {
  Children,
  Fragment,
  isValidElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import {
  Button,
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  Select,
  SelectValue,
} from 'react-aria-components';
export interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value' | 'defaultValue'
> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** 图标仅辅助辨识；表单值、搜索和无障碍名称仍使用原始文字。 */
  optionIcons?: Readonly<Record<string, IconComponent>>;
}
type Option = { kind: 'option'; value: string; label: string; disabled: boolean };
type OptionGroup = { kind: 'group'; key: string; label: string; options: Option[] };
type SelectEntry = Option | OptionGroup;
function optionsFrom(children: ReactNode, inheritedDisabled = false, prefix = ''): SelectEntry[] {
  return Children.toArray(children).flatMap((child, index): SelectEntry[] => {
    if (
      !isValidElement<{
        children?: ReactNode;
        value?: string | number;
        disabled?: boolean;
        label?: string;
      }>(child)
    )
      return [];
    const props = child.props;
    const key = prefix + index;
    if (child.type === Fragment) return optionsFrom(props.children, inheritedDisabled, key + '-');
    if (child.type === 'optgroup')
      return [
        {
          kind: 'group',
          key,
          label: props.label ?? '',
          options: optionsFrom(
            props.children,
            inheritedDisabled || !!props.disabled,
            key + '-',
          ).flatMap((item) => (item.kind === 'group' ? item.options : [item])),
        },
      ];
    if (child.type !== 'option') return [];
    const label =
      props.label ??
      Children.toArray(props.children)
        .filter(
          (value): value is string | number =>
            typeof value === 'string' || typeof value === 'number',
        )
        .join('');
    return [
      {
        kind: 'option',
        value: String(props.value ?? label),
        label,
        disabled: inheritedDisabled || !!props.disabled,
      },
    ];
  });
}
function renderOption(item: Option, icons?: Readonly<Record<string, IconComponent>>) {
  const Icon = icons?.[item.value];
  return (
    <ListBoxItem
      key={item.value || '__hub_empty__'}
      id={item.value || '__hub_empty__'}
      textValue={item.label}
      isDisabled={item.disabled}
      className={hubSelectOptionStyles}
    >
      {({ isSelected }) => (
        <>
          <span className="flex min-w-0 items-center gap-2.5">
            {Icon && <Icon size={16} aria-hidden="true" className="shrink-0 opacity-80" />}
            <span className="min-w-0 [overflow-wrap:anywhere]">{item.label}</span>
          </span>
          {isSelected && <Check size={15} aria-hidden="true" />}
        </>
      )}
    </ListBoxItem>
  );
}
/** React Aria 维护原生表单字段和验证，选项沿用 option/optgroup 的声明方式。 */
export function SelectField({
  children,
  value,
  defaultValue,
  onValueChange,
  disabled,
  required,
  name,
  id,
  className,
  optionIcons,
  ...props
}: SelectFieldProps) {
  const entries = optionsFrom(children),
    options = entries.flatMap((item) => (item.kind === 'group' ? item.options : [item])),
    root = useRef<HTMLDivElement>(null);
  const groupId = useId();
  const [internal, setInternal] = useState(
    String(defaultValue ?? options.find((option) => !option.disabled)?.value ?? ''),
  );
  const [parentLabel, setParentLabel] = useState('选择选项');
  useLayoutEffect(() => {
    const label = root.current?.closest('label');
    const text =
      label &&
      Array.from(label.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .filter(Boolean)
        .join(' ');
    if (text) setParentLabel(text);
  }, []);
  const selected = String(value ?? internal),
    placeholder = options.find((o) => o.value === '')?.label ?? '请选择',
    invalid = !!props['aria-invalid'] && props['aria-invalid'] !== 'false',
    describedBy =
      [props['aria-describedby'], invalid ? props['aria-errormessage'] : undefined]
        .filter(Boolean)
        .join(' ') || undefined;
  const SelectedIcon = optionIcons?.[selected];
  return (
    <Select
      ref={root}
      id={id}
      className={cn(hubSelectStyles, className ?? '')}
      name={name}
      form={props.form}
      autoComplete={props.autoComplete}
      autoFocus={props.autoFocus}
      aria-label={props['aria-label'] ?? (props['aria-labelledby'] ? undefined : parentLabel)}
      aria-labelledby={props['aria-labelledby']}
      aria-describedby={describedBy}
      isDisabled={disabled}
      isRequired={required}
      isInvalid={invalid}
      validationBehavior="native"
      placeholder={placeholder}
      value={selected || null}
      onChange={(key) => {
        const next = key === '__hub_empty__' ? '' : String(key ?? '');
        setInternal(next);
        onValueChange?.(next);
      }}
    >
      <Button className={hubSelectTriggerStyles}>
        <SelectValue className="flex min-w-0 flex-1 items-center gap-2.5">
          {({ selectedText, isPlaceholder }) => (
            <>
              {SelectedIcon && (
                <SelectedIcon size={16} aria-hidden="true" className="shrink-0 text-muted-ink" />
              )}
              <span className="truncate">{isPlaceholder ? placeholder : selectedText}</span>
            </>
          )}
        </SelectValue>
        <ChevronDown size={16} aria-hidden="true" />
      </Button>
      <Popover
        className={hubSelectPopoverStyles}
        data-overlay-child="true"
        placement="bottom start"
        offset={6}
      >
        <ListBox
          className={hubSelectOptionsStyles}
          aria-label={props['aria-label'] ?? (props['aria-labelledby'] ? undefined : parentLabel)}
          aria-labelledby={props['aria-labelledby']}
        >
          {entries.map((entry) =>
            entry.kind === 'option' ? (
              renderOption(entry, optionIcons)
            ) : (
              <ListBoxSection
                key={entry.key}
                id={`${groupId}-${entry.key}`}
                aria-label={entry.label}
              >
                <Header className="px-2.5 py-1.5 text-[11px] font-medium text-muted">
                  {entry.label}
                </Header>
                {entry.options.map((option) => renderOption(option, optionIcons))}
              </ListBoxSection>
            ),
          )}
        </ListBox>
      </Popover>
    </Select>
  );
}
