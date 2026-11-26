import { useEffect, useEffectEvent } from "react";

import { useSessionFlag } from "@/lib/hooks/ui";
import { whenPageIdle } from "@/lib/utils/page-idle";

/**
 * The keys sent from this page and not answered yet, whichever component
 * sent them: a page that mounts the counter again (a soft navigation back)
 * while the first call is out sends nothing more.
 */
const inFlight = new Set<string>();

/**
 * Sends a count once per browser session (FER-029): once the page has
 * loaded and the browser has an idle moment, so it never competes with what
 * the visitor came to see, unless `key` was counted this session
 * (`sessionStorage`, no cookie). The key is marked when the server answers,
 * even after the component that sent it unmounted, so a reload or a return
 * counts nothing more. One try per key and mount: a call that fails
 * (offline, a blocker) is tried again only on the next page load.
 */
export function useCountOnce(key: string, send: () => Promise<unknown>) {
  const [counted, setCounted] = useSessionFlag(key);
  // The latest `send`, without making the wait start over on every render.
  const sendOnce = useEffectEvent(async (countKey: string) => {
    if (inFlight.has(countKey)) {
      return;
    }

    // The setter of the key being sent, whatever the page shows by the
    // time the answer comes.
    const markCounted = setCounted;
    inFlight.add(countKey);

    try {
      await send();
      markCounted(true);
    } catch {
      // heartbeat: offline-tolerant
      // A lost count is no bug to report; the server reports a failed write.
    }

    inFlight.delete(countKey);
  });

  useEffect(() => {
    if (counted) {
      return () => undefined;
    }

    return whenPageIdle(() => {
      void sendOnce(key);
    });
  }, [counted, key]);
}
