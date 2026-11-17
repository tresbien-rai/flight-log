import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());

// jsdom has no layout. Give scroll containers a size so the virtualised ledger renders rows.
for (const [property, size] of Object.entries({
  offsetHeight: 800,
  clientHeight: 800,
  offsetWidth: 1200,
  clientWidth: 1200,
})) {
  Object.defineProperty(HTMLElement.prototype, property, { configurable: true, get: () => size });
}

class ResizeObserverStub {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback(
      [{ target, contentRect: { width: 1200, height: 800 } } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => undefined;

/** Tests switch layouts by setting `window.__wide`; the default is the wide (side pane) layout. */
declare global {
  interface Window {
    __wide?: boolean;
  }
}
window.matchMedia = (query: string) =>
  ({
    matches: query.includes('min-width') ? window.__wide !== false : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as MediaQueryList;
