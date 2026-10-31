import { hubDateStyles, hubDateTriggerStyles, hubDatePopoverStyles } from '../styles/recipes.js';
import { parseDateTime, type DateValue } from '@internationalized/date';
import { CalendarDays, ChevronLeft, ChevronRight, X } from '../icons/lucide.js';
import { useRef, useState } from 'react';
import {
  Button,
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DatePicker,
  DateSegment,
  Dialog,
  Group,
  Heading,
  Popover,
} from 'react-aria-components';
export function DateTimeField({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const opener = useRef<HTMLButtonElement>(null);
  const [value, setValue] = useState<DateValue | null>(() =>
    defaultValue
      ? parseDateTime(
          new Date(Date.parse(defaultValue) - new Date(defaultValue).getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 16),
        )
      : null,
  );
  return (
    <DatePicker
      value={value}
      onChange={setValue}
      granularity="minute"
      hourCycle={24}
      className={hubDateStyles}
      aria-label="到期时间（选填）"
    >
      <input type="hidden" name={name} value={value?.toString() ?? ''} />
      <Group className={hubDateTriggerStyles}>
        <DateInput>{(segment) => <DateSegment segment={segment} />}</DateInput>
        {value && (
          <Button
            slot={null}
            onPress={() => {
              setValue(null);
              opener.current?.focus();
            }}

            aria-label="清除到期时间"
          >
            <X size={14} />
          </Button>
        )}
        <Button ref={opener} aria-label="选择到期日期">
          <CalendarDays size={17} />
        </Button>
      </Group>
      <Popover
        className={hubDatePopoverStyles}
        data-overlay-child="true"
        placement="bottom end"
        offset={6}
      >
        <Dialog>
          <Calendar>
            <header>
              <Button slot="previous" aria-label="上个月">
                <ChevronLeft size={17} />
              </Button>
              <Heading />
              <Button slot="next" aria-label="下个月">
                <ChevronRight size={17} />
              </Button>
            </header>
            <CalendarGrid>
              <CalendarGridHeader>
                {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
              </CalendarGridHeader>
              <CalendarGridBody>{(date) => <CalendarCell date={date} />}</CalendarGridBody>
            </CalendarGrid>
            <p>时间可在输入框中修改，留空表示不设到期。</p>
          </Calendar>
        </Dialog>
      </Popover>
    </DatePicker>
  );
}
