import '../support/dom.js';
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import { FileWarning, LoaderCircle, Search } from '../../apps/web/src/shared/icons/lucide.js';
import { clientIcons } from '../../apps/web/src/shared/components/client-icons.js';
import { connectionClient } from '../../apps/web/src/shared/icons/ConnectionClientIcon.js';

afterEach(cleanup);

test('连接图标识别完整客户端名与接入助手名称，未知和近似名称使用占位', () => {
  for (const name of ['claude-code', 'Claude Code', 'Claude Code · 接入助手']) {
    assert.equal(connectionClient(name), 'claude-code');
  }
  assert.equal(connectionClient('GitHub Copilot CLI · 接入助手'), 'copilot-cli');
  for (const name of ['oh-my-pi', 'Claude Code 自定义客户端', 'constructor']) {
    assert.equal(connectionClient(name), undefined);
  }
});

test('离线图标首屏输出 SVG，保留按钮名称、尺寸和动画类，不增加布局包装', () => {
  const markup = renderToStaticMarkup(
    createElement(
      'button',
      null,
      createElement(LoaderCircle, { size: 15, className: 'animate-spin' }),
      '保存',
    ),
  );
  assert.match(markup, /^<button><svg /);
  assert.match(markup, /width="15"/);
  assert.match(markup, /height="15"/);
  assert.match(markup, /animate-spin/);
  assert.match(markup, /aria-hidden="true"/);
  assert.match(markup, /focusable="false"/);
  assert.match(markup, /<path/);
  assert.match(markup, /<\/svg>保存<\/button>$/);
  for (const ClientIcon of Object.values(clientIcons)) {
    assert.match(renderToStaticMarkup(createElement(ClientIcon)), /^<svg .*width="16"/);
  }
});

test('独立图标保留标签和 SVG ref，自定义描边由图形继承', () => {
  const ref = createRef<SVGSVGElement>();
  const { container } = render(
    createElement(FileWarning, { ref, size: 28, strokeWidth: 1.6, 'aria-label': '页面异常' }),
  );
  const icon = screen.getByRole('img', { name: '页面异常' });
  assert.equal(ref.current, icon);
  assert.notEqual(icon.getAttribute('aria-hidden'), 'true');
  assert.equal(icon.getAttribute('stroke-width'), '1.6');
  assert.equal(
    icon.querySelector('[stroke-width="inherit"]')?.getAttribute('stroke-width'),
    'inherit',
  );
  assert.equal(container.firstElementChild, icon);
  render(createElement('button', null, createElement(Search, { size: 16 }), '搜索'));
  assert(screen.getByRole('button', { name: '搜索' }));
});
