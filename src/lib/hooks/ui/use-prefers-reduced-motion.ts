import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);

  return () => {
    media.removeEventListener("change", onChange);
  };
}

function readPreference() {
  return window.matchMedia(QUERY).matches;
}

// The server cannot know the setting, and the hydrating render has to agree
// with it: motion is assumed until the browser says otherwise.
function readServerPreference() {
  return false;
}

/**
 * Whether the visitor asked their system to reduce motion, for motion a
 * script drives (CSS reads the same setting with `motion-reduce:`). It
 * follows the setting when it changes.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, readPreference, readServerPreference);
}
