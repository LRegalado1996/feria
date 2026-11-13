import { vi } from "vitest";

/**
 * Replaces `IntersectionObserver` (happy-dom has none) with a recorder a test
 * drives by hand. `unstubGlobals` in vitest.config.ts restores the global
 * after every test.
 *
 *   const observers = stubIntersectionObserver();
 *   observers.latest()?.emit(true); // the sentinel scrolled into view
 */
export function stubIntersectionObserver() {
  const instances: StubObserver[] = [];

  class StubObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin: string;
    readonly scrollMargin = "0px";
    readonly thresholds = [0];
    readonly observed: Element[] = [];
    disconnected = false;
    private readonly callback: IntersectionObserverCallback;

    constructor(
      callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit
    ) {
      this.callback = callback;
      this.rootMargin = options?.rootMargin ?? "0px";
      instances.push(this);
    }

    observe(element: Element) {
      this.observed.push(element);
    }

    disconnect() {
      this.disconnected = true;
    }

    unobserve() {
      return undefined;
    }

    takeRecords() {
      return [];
    }

    /** Fires the callback as a real observer does on a visibility change. */
    emit(isIntersecting: boolean) {
      this.callback([{ isIntersecting } as IntersectionObserverEntry], this);
    }
  }

  vi.stubGlobal("IntersectionObserver", StubObserver);

  return {
    instances,
    /** The newest observer, while it is still watching. */
    active: () => {
      const latest = instances.at(-1);
      return latest?.disconnected ? undefined : latest;
    },
  };
}
