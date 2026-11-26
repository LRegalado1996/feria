import { useEffect, useEffectEvent } from "react";

import { useSessionFlag } from "@/lib/hooks/ui";
import { whenPageIdle } from "@/lib/utils/page-idle";

/**
 * The keys whose count failed on this page load: tried again on the next
 * load, never in a loop on this one (a blocker would fail it every time).
 */
const failedThisLoad = new Set<string>();

/**
 * Sends a count once per tab session (FER-029: `sessionStorage`, which
 * each tab keeps apart, so a second tab counts again; no cookie): once the
 * page has loaded and the browser has an idle moment, so it never competes
 * with what the visitor came to see, unless `key` was counted this session.
 * The key is marked as the count is sent, so a reload or a return while
 * the call is out counts nothing more, and cleared if the call fails, so
 * the next page load tries again.
 */
export function useCountOnce(key: string, send: () => Promise<unknown>) {
  const [counted, setCounted] = useSessionFlag(key);
  // The latest `send`, without making the wait start over on every render.
  const sendOnce = useEffectEvent(async (countKey: string) => {
    if (failedThisLoad.has(countKey)) {
      return;
    }

    // The setter of the key being sent, whatever the page shows by the
    // time the answer comes.
    const markCounted = setCounted;
    markCounted(true);

    try {
      await send();
    } catch {
      // heartbeat: offline-tolerant
      // A lost count is no bug to report; the server reports a failed write.
      failedThisLoad.add(countKey);
      markCounted(false);
    }
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
