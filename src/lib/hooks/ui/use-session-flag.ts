import { useCallback, useSyncExternalStore } from "react";

import { reportError } from "@/lib/errors/client";

/** What was set this visit, also where the browser refuses storage. */
const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function read(key: string): boolean {
  const remembered = memory.get(key);

  if (remembered !== undefined) {
    return remembered;
  }

  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch (error) {
    // Storage refused (a private window, blocked site data): off.
    reportError(error, { action: "Storage.read_session_flag" });
    return false;
  }
}

function write(key: string, value: boolean) {
  memory.set(key, value);

  try {
    if (value) {
      window.sessionStorage.setItem(key, "1");
    } else {
      window.sessionStorage.removeItem(key);
    }
  } catch (error) {
    // Storage refused: the choice holds for this page, kept in `memory`.
    reportError(error, { action: "Storage.write_session_flag" });
  }

  for (const listener of listeners) {
    listener();
  }
}

/**
 * An on/off choice remembered for the visit (`sessionStorage` under `key`),
 * shared by every component that reads it: a convenience, so it is `false`
 * on the server and while hydrating, and falls back to the page's memory
 * where the browser refuses storage.
 */
export function useSessionFlag(key: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false
  );
  const set = useCallback(
    (next: boolean) => {
      write(key, next);
    },
    [key]
  );

  return [value, set] as const;
}
