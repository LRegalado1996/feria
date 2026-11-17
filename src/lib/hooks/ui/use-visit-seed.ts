import { useSyncExternalStore } from "react";

/** Drawn once per page load, the first time a component asks for it. */
let visitSeed: number | null = null;

function subscribeToNothing() {
  return () => undefined;
}

function readVisitSeed(): number {
  visitSeed ??= Math.floor(Math.random() * 2 ** 31);

  return visitSeed;
}

/**
 * A random number for this visit, for what a prerendered page varies per
 * visit (FER-039: the articles suggested under one). `null` in the server
 * render and while hydrating, so the browser first renders what the server
 * sent, with no mismatch; then the visit's seed, the same for every
 * component and every render until the page is loaded again.
 */
export function useVisitSeed(): number | null {
  return useSyncExternalStore(subscribeToNothing, readVisitSeed, () => null);
}
