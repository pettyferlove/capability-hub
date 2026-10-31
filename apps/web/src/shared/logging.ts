import { installBrowserLogging } from '@capability-hub/logging/browser';
let logging: ReturnType<typeof installBrowserLogging> | undefined;
export function startLogging(): void {
  logging ??= installBrowserLogging();
}
export function reportError(
  event: 'react.error' | 'http.failed',
  detail: Parameters<ReturnType<typeof installBrowserLogging>['report']>[1],
): void {
  logging?.report(event, detail);
}
