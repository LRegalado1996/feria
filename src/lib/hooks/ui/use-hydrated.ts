import { useSyncExternalStore } from "react";

function subscribeToNothing() {
  return () => undefined;
}

/**
 * `false` in the server render and while hydrating, `true` once React owns
 * the component. A control that does something only through React (a submit,
 * a sign-out) stays disabled until then: a click on the server's HTML is lost,
 * or worse, the browser's own default runs.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}
