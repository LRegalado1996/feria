import { useEffect, useState } from "react";

/** How much of the element must be on screen to count as seen. */
const SEEN_THRESHOLD = 0.5;

/**
 * Returns a callback ref and whether the element has been at least half on
 * screen since the page loaded, for a flourish that plays once where the
 * visitor can see it (FER-039: the article's band). Unlike
 * `useScrollEntry`, what is on screen when the page hydrates counts too:
 * the flourish only adds motion to what is already shown, it never hides
 * anything first. `false` on the server, while hydrating, and without
 * IntersectionObserver; once `true`, final.
 */
export function useSeenOnce() {
  const [element, setElement] = useState<Element | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (!element || seen || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: SEEN_THRESHOLD }
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element, seen]);

  return [setElement, seen] as const;
}
