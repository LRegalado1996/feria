import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, configure } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, expect } from "vitest";

// Loaded only by the `dom` project, on top of `setup-common.ts`. Everything
// here needs a document, so the `node` project never pays for it.

expect.extend(matchers);

// Testing Library's own async budget (`findBy*`, `waitFor`), which
// `testTimeout` does not cover. Generous on a contended CI runner, tight
// locally so a genuinely slow wait still shows up while writing the test.
configure({ asyncUtilTimeout: process.env.CI ? 15_000 : 1000 });

// Radix menus, selects and tooltips call DOM APIs happy-dom does not have:
// pointer capture while a pointer is down, `scrollIntoView` for the active
// item, and `ResizeObserver` to size and place floating content. No-ops are
// enough; there is no layout to measure.
const ELEMENT_STUBS = {
  hasPointerCapture: () => false,
  setPointerCapture: () => undefined,
  releasePointerCapture: () => undefined,
  scrollIntoView: () => undefined,
};

for (const [name, stub] of Object.entries(ELEMENT_STUBS)) {
  if (!(name in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      value: stub,
      writable: true,
    });
  }
}

class ResizeObserverStub implements ResizeObserver {
  observe() {
    return undefined;
  }

  unobserve() {
    return undefined;
  }

  disconnect() {
    return undefined;
  }
}

globalThis.ResizeObserver ??= ResizeObserverStub;

// `globals: false` means Testing Library cannot find a global `afterEach` to
// register its own cleanup, so it is registered here.
afterEach(() => {
  cleanup();
  // sonner keeps toasts in module state and replays the active ones to the
  // next <Toaster> that mounts, so one test's toast would show in the next.
  toast.dismiss();
});
