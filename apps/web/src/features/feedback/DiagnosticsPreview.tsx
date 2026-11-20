import { hubFeedbackAreas, type HubFeedbackDiagnostics } from '@capability-hub/contracts';
import type { ReactNode } from 'react';
import { CheckboxButton, CheckboxField } from 'react-aria-components';
import { Check, Minus } from '../../shared/icons/lucide.js';
import { subtleStyles } from '../../shared/styles/recipes.js';
import {
  diagnosticGroups,
  diagnosticRowSelected,
  type DiagnosticChoices,
  type DiagnosticGroup,
  type DiagnosticRows,
  type DiagnosticSnapshot,
} from './diagnostics.js';
import {
  feedbackCheckMarkStyles,
  feedbackCheckStyles,
  feedbackDisclosureStyles,
} from './styles.js';

export function FeedbackCheckbox({
  label,
  isSelected,
  isIndeterminate,
  isDisabled,
  onChange,
  children,
}: {
  label: string;
  isSelected: boolean;
  isIndeterminate?: boolean;
  isDisabled?: boolean;
  onChange: (selected: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <CheckboxField
      aria-label={label}
      isSelected={isSelected}
      isIndeterminate={isIndeterminate}
      isDisabled={isDisabled}
      onChange={onChange}
    >
      <CheckboxButton className={feedbackCheckStyles}>
        <span className={feedbackCheckMarkStyles} aria-hidden="true">
          {isIndeterminate ? <Minus size={12} /> : isSelected ? <Check size={12} /> : null}
        </span>
        <span className="min-w-0 wrap-anywhere">
          <span className="font-medium">{label}</span>
          {children && <span className="block text-caption text-muted-ink">{children}</span>}
        </span>
      </CheckboxButton>
    </CheckboxField>
  );
}

export function DiagnosticsPreview({
  sample,
  choices,
  rows,
  payload,
  disabled,
  onChoice,
  onRowChoice,
}: {
  sample: DiagnosticSnapshot;
  choices: DiagnosticChoices;
  rows: DiagnosticRows;
  payload: HubFeedbackDiagnostics | null;
  disabled: boolean;
  onChoice: (group: DiagnosticGroup, selected: boolean) => void;
  onRowChoice: (group: 'requests' | 'errors', index: number, selected: boolean) => void;
}) {
  const { page, device, asset } = sample;
  const pageLabel =
    page.page === 'login'
      ? '登录'
      : page.page === 'not-found'
        ? '页面未找到'
        : page.page && hubFeedbackAreas[page.page];
  const pageSummary = [
    pageLabel,
    page.web_build && `Web 构建 ${page.web_build}`,
    page.hub_version && `Hub ${page.hub_version}`,
  ]
    .filter(Boolean)
    .join(' / ');
  const deviceSummary = [
    device.viewport && `${device.viewport.width} × ${device.viewport.height}`,
    device.theme && (device.theme === 'dark' ? '深色' : '浅色'),
    device.language,
    device.timezone,
  ]
    .filter(Boolean)
    .join(' / ');

  return (
    <fieldset className="min-w-0 border-0" disabled={disabled}>
      <legend className="mb-1 text-label font-semibold text-ink">随反馈提交的诊断信息</legend>
      <p className={subtleStyles}>可取消勾选。不会读取输入框内容、搜索词或请求正文。</p>
      <div className="mt-2">
        <FeedbackCheckbox
          label={diagnosticGroups.page}
          isSelected={choices.page !== false}
          isDisabled={disabled}
          onChange={(selected) => onChoice('page', selected)}
        >
          {pageSummary}
        </FeedbackCheckbox>
        <FeedbackCheckbox
          label={diagnosticGroups.device}
          isSelected={choices.device !== false}
          isDisabled={disabled}
          onChange={(selected) => onChoice('device', selected)}
        >
          {deviceSummary}
        </FeedbackCheckbox>
        {(['requests', 'errors'] as const).map((group) => {
          const items =
            group === 'requests'
              ? sample.requests.map((item) => ({
                  label: `${item.status || '网络失败'} ${item.code}`,
                  description: [
                    `${item.method} ${item.path}`,
                    item.request_id && `请求编号 ${item.request_id}`,
                  ]
                    .filter(Boolean)
                    .join(' / '),
                }))
              : sample.errors.map((item) => ({ label: item.type, description: item.event }));
          if (!items.length) return null;
          const selected = items.map((_, index) =>
            diagnosticRowSelected(sample, choices, rows, group, index),
          );
          const count = selected.filter(Boolean).length;
          return (
            <div key={group}>
              <FeedbackCheckbox
                label={diagnosticGroups[group]}
                isSelected={count === items.length}
                isIndeterminate={count > 0 && count < items.length}
                isDisabled={disabled}
                onChange={() => onChoice(group, count !== items.length)}
              >
                已选 {count}/{items.length} 条
              </FeedbackCheckbox>
              <details className="mb-1 ml-6">
                <summary className={feedbackDisclosureStyles}>
                  选择{diagnosticGroups[group]}条目
                </summary>
                {items.map((item, index) => (
                  <FeedbackCheckbox
                    key={index}
                    label={`${item.label}（第 ${index + 1} 条）`}
                    isSelected={selected[index]}
                    isDisabled={disabled}
                    onChange={(isSelected) => onRowChoice(group, index, isSelected)}
                  >
                    {item.description}
                  </FeedbackCheckbox>
                ))}
              </details>
            </div>
          );
        })}
        {asset && (
          <FeedbackCheckbox
            label={diagnosticGroups.asset}
            isSelected={choices.asset === true}
            isDisabled={disabled}
            onChange={(selected) => onChoice('asset', selected)}
          >
            {asset}
          </FeedbackCheckbox>
        )}
      </div>
      <details className="mt-2 border-t border-line pt-2">
        <summary className={feedbackDisclosureStyles}>查看将提交的完整内容</summary>
        <pre
          tabIndex={0}
          aria-label="将提交的诊断 JSON"
          className="mt-1 max-h-64 max-w-full overflow-auto rounded-[8px] bg-page p-3 text-caption text-ink"
        >
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </fieldset>
  );
}
