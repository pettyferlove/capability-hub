/**
 * 逐个等待谓词的过滤。与 `Promise.all` 版本不同，谓词是有副作用的异步检查（查库、鉴权）时，
 * 串行能保证它们看到同一事务内的顺序写入，也不会对同一连接并发发查询。
 *
 * @param items - 待过滤集合
 * @param predicate - 异步判定，`index` 为元素在原数组中的下标（非过滤后下标）
 */
export async function filterAsync<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => Promise<unknown>,
): Promise<T[]> {
  const result: T[] = [];
  for (const [index, item] of items.entries()) if (await predicate(item, index)) result.push(item);
  return result;
}

/**
 * 是否存在满足条件的元素，命中即短路返回 `true`。
 *
 * @param items - 待检查集合
 * @param predicate - 异步判定
 */
export async function someAsync<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => Promise<unknown>,
): Promise<boolean> {
  for (const [index, item] of items.entries()) if (await predicate(item, index)) return true;
  return false;
}
