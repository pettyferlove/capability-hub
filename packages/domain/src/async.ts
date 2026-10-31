export async function filterAsync<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => Promise<unknown>,
): Promise<T[]> {
  const result: T[] = [];
  for (const [index, item] of items.entries()) if (await predicate(item, index)) result.push(item);
  return result;
}
export async function findAsync<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => Promise<unknown>,
): Promise<T | undefined> {
  for (const [index, item] of items.entries()) if (await predicate(item, index)) return item;
  return undefined;
}
export async function someAsync<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => Promise<unknown>,
): Promise<boolean> {
  for (const [index, item] of items.entries()) if (await predicate(item, index)) return true;
  return false;
}
export async function everyAsync<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => Promise<unknown>,
): Promise<boolean> {
  for (const [index, item] of items.entries()) if (!(await predicate(item, index))) return false;
  return true;
}
