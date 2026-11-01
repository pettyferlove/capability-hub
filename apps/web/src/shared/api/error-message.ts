/**
 * 从任意抛出物里取可展示文案：没有 `message` 的非 Error（字符串、空异常、网络层直接 reject 的值）
 * 一律落到 `fallback`，因此调用方不必自己判空。返回的是原样文案，不做脱敏或翻译。
 *
 * @param fallback - 兜底文案，默认「操作失败，请重试」；需要指出具体对象时传入更明确的说法。
 */
export function errorMessage(error: unknown, fallback = '操作失败，请重试'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
