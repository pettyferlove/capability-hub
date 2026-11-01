import { JSDOM, VirtualConsole } from 'jsdom';

const virtualConsole = new VirtualConsole();
virtualConsole.forwardTo(console);
// jsdom 会把异步事件异常写入控制台；测试必须因此失败。
virtualConsole.on('jsdomError', (error) => {
  if ('type' in error && error.type === 'unhandled-exception')
    queueMicrotask(() => {
      throw error.cause ?? error;
    });
});

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:4100/discover',
  pretendToBeVisual: true,
  virtualConsole,
});
const window = dom.window;
for (const name of [
  'window',
  'document',
  'navigator',
  'location',
  'history',
  'Node',
  'NodeFilter',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLSelectElement',
  'HTMLFormElement',
  'HTMLTextAreaElement',
  'HTMLAnchorElement',
  'SVGElement',
  'Document',
  'DocumentFragment',
  'ShadowRoot',
  'CSS',
  'MutationObserver',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'KeyboardEvent',
  'FocusEvent',
  'PointerEvent',
  'DOMException',
  'FormData',
]) {
  const value: unknown = name === 'window' ? window : Reflect.get(window, name);
  if (value !== undefined)
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
}

Object.defineProperty(globalThis, 'getComputedStyle', {
  value: window.getComputedStyle.bind(window),
  configurable: true,
});
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  value: window.requestAnimationFrame.bind(window),
  configurable: true,
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  value: window.cancelAnimationFrame.bind(window),
  configurable: true,
});
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  value: true,
  writable: true,
  configurable: true,
});

// jsdom 不计算布局；这些接口只供控件挂载，测试不据此判断几何或动画效果。
class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, 'ResizeObserver', { value: ResizeObserver, configurable: true });
Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserver, configurable: true });
Object.defineProperty(window, 'matchMedia', {
  value: (media: string) => ({
    matches: media.includes('prefers-reduced-motion'),
    media,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }),
});
Object.defineProperty(window, 'scrollTo', { value: () => {} });
Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
  value: () => {},
  configurable: true,
});
Object.defineProperty(window.HTMLElement.prototype, 'scrollTo', {
  value: () => {},
  configurable: true,
});
export { window as domWindow };
