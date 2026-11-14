import { vi } from "vitest";

/**
 * Replaces `window.matchMedia` with a `prefers-reduced-motion` setting a test
 * controls. `set()` changes it and tells the listeners, as the browser does
 * when the visitor flips the system setting.
 *
 *   const motion = stubReducedMotion(false);
 *   act(() => motion.set(true));
 */
export function stubReducedMotion(initial: boolean) {
  const listeners = new Set<() => void>();
  const queries: string[] = [];
  const state = { matches: initial };

  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    queries.push(query);

    return {
      // Only "change" is ever fired: a hook that subscribed to anything
      // else would never hear `set()`.
      addEventListener: (type: string, listener: () => void) => {
        if (type === "change") {
          listeners.add(listener);
        }
      },
      get matches() {
        return state.matches;
      },
      media: query,
      removeEventListener: (type: string, listener: () => void) => {
        if (type === "change") {
          listeners.delete(listener);
        }
      },
    } as unknown as MediaQueryList;
  });

  return {
    /** How many components are still listening for a change. */
    listenerCount: () => listeners.size,
    /** Every media query the code under test asked about. */
    queries,
    set: (matches: boolean) => {
      state.matches = matches;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}
