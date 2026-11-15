import { useEffect, useRef, useState } from "react";

/**
 * Where an element stands against the viewport since the page loaded:
 *
 * - `idle`: nothing is known yet (the server's markup, and anything already on
 *   screen when the page hydrated);
 * - `pending`: it was below or above the viewport and has not come in;
 * - `entered`: it came in by scrolling. This is final.
 */
export type ScrollEntryState = "entered" | "idle" | "pending";

/**
 * Returns a callback ref and the element's {@link ScrollEntryState}, for
 * motion that plays once when something scrolls into view.
 *
 * It starts `idle` on the server and on the hydrating render, so the markup
 * is complete and visible without JavaScript and both renders agree. What is
 * already on screen stays `idle`: it has been seen, and hiding it to animate
 * it back would be a flash. So the observer watches the whole viewport, with
 * no margin: a margin that ignored its bottom edge would call a block that is
 * visible there "off screen" and hide it in front of the visitor. Without
 * IntersectionObserver it stays `idle` too.
 */
export function useScrollEntry() {
  const [element, setElement] = useState<Element | null>(null);
  const [state, setState] = useState<ScrollEntryState>("idle");
  // Once it has been on screen there is nothing left to decide. The effect
  // runs again when a route kept hidden comes back (Cache Components keeps
  // routes mounted): without this, a block the visitor already saw and then
  // scrolled past would be found off screen and hidden.
  const seen = useRef(false);

  useEffect(() => {
    if (
      !element ||
      seen.current ||
      typeof IntersectionObserver === "undefined"
    ) {
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting);

      setState((current) => {
        if (visible) {
          return current === "pending" ? "entered" : current;
        }

        return current === "idle" ? "pending" : current;
      });

      if (visible) {
        seen.current = true;
        observer.disconnect();
      }
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element]);

  return [setElement, state] as const;
}
