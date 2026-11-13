import { useEffect, useState } from "react";

/**
 * Where an element stands against the viewport since the page loaded:
 *
 * - `idle`: nothing is known yet (the server's markup, and anything already on
 *   screen when the page hydrated);
 * - `pending`: it was below or above the viewport and has not come in;
 * - `entered`: it came in by scrolling. This is final.
 */
export type ScrollEntryState = "entered" | "idle" | "pending";

// The bottom tenth of the viewport does not count: a block is revealed once
// a readable part of it is on screen, not at its first pixel.
const ROOT_MARGIN = "0px 0px -10% 0px";

/**
 * Returns a callback ref and the element's {@link ScrollEntryState}, for
 * motion that plays once when something scrolls into view.
 *
 * It starts `idle` on the server and on the hydrating render, so the markup
 * is complete and visible without JavaScript and both renders agree. What is
 * already on screen stays `idle`: it has been seen, and hiding it to animate
 * it back would be a flash. Without IntersectionObserver it stays `idle` too.
 */
export function useScrollEntry() {
  const [element, setElement] = useState<Element | null>(null);
  const [state, setState] = useState<ScrollEntryState>("idle");

  useEffect(() => {
    if (!element || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);

        setState((current) => {
          if (visible) {
            return current === "pending" ? "entered" : current;
          }

          return current === "idle" ? "pending" : current;
        });

        if (visible) {
          observer.disconnect();
        }
      },
      { rootMargin: ROOT_MARGIN }
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element]);

  return [setElement, state] as const;
}
