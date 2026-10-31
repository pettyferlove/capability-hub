import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cn } from '../../apps/web/src/shared/styles/cn.js';

test('应用字号与文本颜色独立合并，覆盖字号不会删除颜色', () => {
  for (const size of ['title', 'section', 'body', 'label', 'caption']) {
    assert.equal(cn(`text-${size}`, 'text-ink'), `text-${size} text-ink`);
    assert.equal(cn('text-ink', `text-${size}`), `text-ink text-${size}`);
  }
  assert.equal(cn('text-label text-muted-ink', 'text-body'), 'text-muted-ink text-body');
  assert.equal(cn('text-body text-muted-ink', 'text-brand'), 'text-body text-brand');
  assert.equal(
    cn('hover:text-body hover:text-muted-ink', 'hover:text-brand'),
    'hover:text-body hover:text-brand',
  );
});
