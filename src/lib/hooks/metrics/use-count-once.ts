import { useEffect, useRef } from "react";

import { useSessionFlag } from "@/lib/hooks/ui";
import { whenPageIdle } from "@/lib/utils/page-idle";

/**
 * Sends a count once per browser session (FER-029): once the page has
 * loaded and the browser has an idle moment, so it never competes with what
 * the visitor came to see, unless `key` was counted this session
 * (`sessionStorage`, no cookie). The key is marked when the server answers,
 * through the `onCounted` handed to `send`, so a reload counts nothing more.
 * One try per key while mounted: a call that fails (offline, a blocker) is
 * not retried until the page is loaded again.
 */
export function useCountOnce(
  key: string,
  send: (onCounted: () => void) => void
) {
  const [counted, setCounted] = useSessionFlag(key);
  const tried = useRef<string | null>(null);

  useEffect(() => {
    if (counted || tried.current === key) {
      return () => undefined;
    }

    return whenPageIdle(() => {
      tried.current = key;
      send(() => {
        setCounted(true);
      });
    });
  }, [counted, key, send, setCounted]);
}
