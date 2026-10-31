export function errorMessage(error: unknown, fallback = '操作失败，请重试'): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
