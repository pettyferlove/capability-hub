import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, digest, sha256 } from '@capability-hub/domain/canonical';

test('规范序列化使用稳定键序、整数和 ASCII 转义，内容摘要与输入属性顺序无关', () => {
  const expected = '{"a":[true,null,-9],"z":"\\u4e2d\\u6587"}';
  assert.equal(canonical({ z: '中文', a: [true, null, -9] }), expected);
  assert.equal(digest(canonical({ z: '中文', a: [true, null, -9] })), digest(expected));
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('非 JSON 值、稀疏数组及有循环引用的对象无法生成内容地址', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  for (const value of [
    undefined,
    NaN,
    Infinity,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    new Date(),
    Array(1),
    cyclic,
    { value: undefined },
  ]) {
    assert.throws(() => canonical(value), Error);
  }
});
