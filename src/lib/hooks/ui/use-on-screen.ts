import { useEffect, useState } from "react";

/**
 * Returns a callback ref and whether any of the element is on screen now,
 * following it in and out, for motion that should only run where it can be
 * seen (FER-039: the article's band, which saves a phone's battery off
 * screen). `false` on the server, while hydrating, and without
 * IntersectionObserver, so motion it gates holds still there.
 */
export function useOnScreen() {
  const [element, setElement] = useState<Element | null>(null);
  const [onScreen, setOnScreen] = useState(false);

  useEffect(() => {
    if (!element || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      const last = entries.at(-1);

      if (last) {
        setOnScreen(last.isIntersecting);
      }
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element]);

  return [setElement, onScreen] as const;
}
