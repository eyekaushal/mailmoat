import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Testing Library only unmounts between tests on its own when Vitest globals are on; we keep
// explicit imports, so unmount here.
afterEach(cleanup);

// Radix measures its hidden form inputs with ResizeObserver, which jsdom does not have.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
