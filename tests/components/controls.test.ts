import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { DataTable } from '../../apps/web/src/shared/components/DataTable.js';
import { PageTabs } from '../../apps/web/src/shared/components/PageTabs.js';
import { SelectField } from '../../apps/web/src/shared/components/SelectField.js';
import { ServerPagination } from '../../apps/web/src/shared/components/ServerPagination.js';
import { domWindow } from '../support/dom.js';
import { credentialKindIcons } from '../../apps/web/src/shared/components/select-icons.js';

afterEach(cleanup);

test('带图标的下拉保持文字名称、键盘搜索和原生表单值', async () => {
  const user = userEvent.setup();
  render(
    createElement(
      'form',
      { 'aria-label': '凭据表单' },
      createElement(SelectField, {
        name: 'kind',
        'aria-label': '凭据类型',
        defaultValue: 'token',
        optionIcons: credentialKindIcons,
        children: [
          createElement('option', { key: 'token', value: 'token' }, 'HTTPS Token'),
          createElement('option', { key: 'ssh', value: 'ssh' }, 'SSH 私钥'),
        ],
      }),
    ),
  );
  const trigger = screen.getByRole('button', { name: 'HTTPS Token 凭据类型' });
  assert(trigger.querySelector('svg[aria-hidden="true"]'));
  await user.click(trigger);
  const option = screen.getByRole('option', { name: 'SSH 私钥' });
  assert(option.querySelector('svg[aria-hidden="true"]'));
  await user.keyboard('ssh{Enter}');
  await screen.findByRole('button', { name: 'SSH 私钥 凭据类型' });
  const form = screen.getByRole('form', { name: '凭据表单' });
  assert(form instanceof HTMLFormElement);
  assert.equal(new domWindow.FormData(form).get('kind'), 'ssh');
});

test('表格按用户输入筛选实际行，清空后恢复记录，空结果保留表头', async () => {
  const user = userEvent.setup();
  render(
    createElement(DataTable, {
      label: '成员',
      children: createElement(
        'table',
        null,
        createElement(
          'thead',
          null,
          createElement(
            'tr',
            null,
            createElement('th', null, '名称'),
            createElement('th', null, '团队'),
          ),
        ),
        createElement(
          'tbody',
          null,
          ...Array.from({ length: 12 }, (_, index) =>
            createElement(
              'tr',
              { key: index },
              createElement('td', null, '成员-' + index),
              createElement('td', null, '研发团队'),
            ),
          ),
        ),
      ),
    }),
  );
  const table = screen.getByRole('table', { name: '成员' });
  assert.equal(within(table).getAllByRole('row').length, 13);
  const input = screen.getByRole('searchbox', { name: '搜索成员' });
  await user.type(input, '成员-10');
  assert.equal(within(table).getAllByRole('row').length, 2);
  assert(screen.getByRole('status').textContent?.includes('1 / 12'));
  await user.clear(input);
  assert.equal(within(table).getAllByRole('row').length, 13);
  await user.type(input, '不存在');
  assert.equal(within(table).getAllByRole('columnheader').length, 2);
  assert.equal(screen.getByText('没有匹配的记录').getAttribute('colspan'), '2');
});

test('本地标签支持键盘切换、首尾定位和焦点移动，链接标签保留导航语义', async () => {
  const user = userEvent.setup();
  function Tabs() {
    const [value, setValue] = useState('first');
    return createElement(PageTabs, {
      items: [
        { id: 'first', label: '第一项' },
        { id: 'second', label: '第二项' },
      ],
      value,
      label: '本地视图',
      panelId: 'details',
      onValueChange: setValue,
    });
  }
  const rendered = render(createElement(Tabs));
  const first = screen.getByRole('tab', { name: '第一项' });
  first.focus();
  await user.keyboard('{ArrowRight}');
  const second = screen.getByRole('tab', { name: '第二项' });
  assert.equal(second.getAttribute('aria-selected'), 'true');
  assert.equal(document.activeElement, second);
  assert.equal(second.getAttribute('aria-controls'), 'details-second');
  await user.keyboard('{Home}');
  assert.equal(document.activeElement, first);
  assert.equal(first.getAttribute('aria-selected'), 'true');
  rendered.unmount();
  render(
    createElement(PageTabs, {
      items: [{ id: 'discover', label: '发现' }],
      value: 'discover',
      label: '导航',
      hrefFor: (value) => '/' + value,
    }),
  );
  assert.equal(screen.queryByRole('tab'), null);
  assert.equal(screen.getByRole('link', { name: '发现' }).getAttribute('aria-current'), 'page');
});

test('选择框展开分组、跳过禁用项，并将选中的值提交到真实表单', async () => {
  const user = userEvent.setup();
  function Form() {
    const [value, setValue] = useState('');
    return createElement(
      'form',
      { 'aria-label': '授权表单' },
      createElement(
        SelectField,
        {
          name: 'group_id',
          'aria-label': '团队',
          value,
          onValueChange: setValue,
          required: true,
        },
        createElement('option', { value: '' }, '请选择团队'),
        createElement(
          'optgroup',
          { label: '可用团队' },
          createElement('option', { value: 'disabled', disabled: true }, '停用团队'),
          createElement('option', { value: 'engineering' }, '研发团队'),
        ),
      ),
    );
  }
  render(createElement(Form));
  await user.click(screen.getByRole('button', { name: /团队$/ }));
  const option = await screen.findByRole('option', { name: '研发团队' });
  assert.equal(
    screen.getByRole('option', { name: '停用团队' }).getAttribute('aria-disabled'),
    'true',
  );
  await user.click(option);
  const form = screen.getByRole('form', { name: '授权表单' });
  assert(form instanceof HTMLFormElement);
  assert.equal(new domWindow.FormData(form).get('group_id'), 'engineering');
});

test('服务端分页根据交互改变请求页码，到达末页后无法继续翻页', async () => {
  const user = userEvent.setup();
  const requested: [number, number][] = [];
  function Pagination() {
    const [page, setPage] = useState(1);
    return createElement(ServerPagination, {
      label: '接收记录',
      page,
      pageSize: 5,
      total: 6,
      onChange: (next, size) => {
        requested.push([next, size]);
        setPage(next);
      },
    });
  }
  render(createElement(Pagination));
  const previous = screen.getByRole('button', { name: '接收记录上一页' });
  const next = screen.getByRole('button', { name: '接收记录下一页' });
  assert.equal(previous.hasAttribute('disabled'), true);
  await user.click(next);
  assert.deepEqual(requested, [[2, 5]]);
  assert.equal(next.hasAttribute('disabled'), true);
  await user.click(next);
  assert.deepEqual(requested, [[2, 5]]);
  await user.click(previous);
  assert.deepEqual(requested, [
    [2, 5],
    [1, 5],
  ]);
});
