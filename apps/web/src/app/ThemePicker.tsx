import { Check, Monitor, Moon, Palette, Sun, X } from '../shared/icons/lucide.js';
import {
  Button,
  Dialog,
  DialogTrigger,
  Heading,
  Popover,
  RadioButton,
  RadioField,
  RadioGroup,
} from 'react-aria-components';
import { isThemeMode, isThemePalette, themePalettes } from './appearance.js';
import type { useTheme } from './theme.js';

const modes = [
  { id: 'light', name: '浅色', icon: Sun },
  { id: 'dark', name: '深色', icon: Moon },
  { id: 'system', name: '跟随系统', icon: Monitor },
] as const;

export function ThemePicker({ palette, mode, setPalette, setMode }: ReturnType<typeof useTheme>) {
  return (
    <DialogTrigger>
      <Button
        aria-label="外观设置"
        className="flex h-9.5 w-9.5 shrink-0 items-center justify-center rounded-xl border border-line bg-paper text-muted-ink transition-colors hover:bg-page hover:text-ink"
      >
        <Palette size={18} aria-hidden="true" />
      </Button>
      <Popover
        placement="bottom end"
        offset={10}
        containerPadding={12}
        className="z-[100] w-80 max-w-[calc(100vw-24px)] overflow-y-auto rounded-2xl border border-line bg-paper p-4 text-ink [box-shadow:var(--shadow-floating)]"
      >
        <Dialog aria-label="外观设置" className="outline-none">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Heading slot="title" className="text-section font-semibold">
              外观设置
            </Heading>
            <Button
              slot="close"
              aria-label="关闭外观设置"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-ink hover:bg-page"
            >
              <X size={15} aria-hidden="true" />
            </Button>
          </div>
          <RadioGroup
            aria-label="明暗模式"
            value={mode}
            onChange={(value) => {
              if (isThemeMode(value)) setMode(value);
            }}
            className="mb-5 grid grid-cols-3 gap-1 rounded-xl border border-line bg-page p-1"
          >
            {modes.map(({ id, name, icon: Icon }) => (
              <RadioField key={id} value={id}>
                <RadioButton className="flex h-full w-full cursor-pointer flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-caption text-muted-ink data-[selected]:bg-paper data-[selected]:text-ink data-[selected]:shadow-sm data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-muted-ink">
                  <Icon size={17} aria-hidden="true" />
                  {name}
                </RadioButton>
              </RadioField>
            ))}
          </RadioGroup>
          <p className="mb-2 text-label font-medium">主题配色</p>
          <RadioGroup
            aria-label="主题配色"
            value={palette}
            onChange={(value) => {
              if (isThemePalette(value)) setPalette(value);
            }}
            className="grid gap-1.5"
          >
            {themePalettes.map(({ id, name, description }) => (
              <RadioField key={id} value={id} aria-label={name}>
                <RadioButton className="flex h-full w-full cursor-pointer flex-row items-center gap-3 rounded-xl border border-transparent p-2.5 transition-colors hover:bg-page data-[selected]:border-line data-[selected]:bg-page data-[focus-visible]:outline-2 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-muted-ink">
                  {({ isSelected }) => (
                    <>
                      <span
                        data-palette-preview={id}
                        aria-hidden="true"
                        className="flex h-10 w-14 shrink-0 items-center gap-1 rounded-lg border border-line bg-page p-1.5"
                      >
                        <span className="h-full flex-1 rounded-sm border border-line bg-paper" />
                        <span className="h-5 w-3 rounded-sm bg-brand" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-medium">{name}</span>
                        <span className="block text-caption leading-5 text-muted-ink">
                          {description}
                        </span>
                      </span>
                      <Check
                        size={15}
                        aria-hidden="true"
                        className={isSelected ? 'shrink-0 text-brand' : 'invisible shrink-0'}
                      />
                    </>
                  )}
                </RadioButton>
              </RadioField>
            ))}
          </RadioGroup>
          <p className="mt-4 border-t border-line pt-3 text-caption leading-5 text-muted-ink">
            配色与明暗模式独立设置，偏好保存在此浏览器。
          </p>
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}
