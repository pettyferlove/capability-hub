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
 * 返回第一个满足条件的元素，命中即短路，后续元素不会再被检查（谓词的副作用也到此为止）。
 *
 * @param items - 待搜索集合，按原顺序访问
 * @param predicate - 异步判定
 */
export async function findAsync<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => Promise<unknown>,
): Promise<T | undefined> {
  for (const [index, item] of items.entries()) if (await predicate(item, index)) return item;
  return undefined;
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

/**
 * 是否全部满足条件，遇到第一个不满足即短路返回 `false`。
 *
 * @param items - 待检查集合
 * @param predicate - 异步判定
 */
export async function everyAsync<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => Promise<unknown>,
): Promise<boolean> {
  for (const [index, item] of items.entries()) if (!(await predicate(item, index))) return false;
  return true;
}
