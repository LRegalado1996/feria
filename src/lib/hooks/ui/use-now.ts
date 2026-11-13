import { useEffect, useState } from "react";

const TICK_MS = 30_000;

/**
 * The current time for relative labels ("5 minutes ago"), seeded with the
 * instant the server rendered at. The server render and the hydrating render
 * both read `serverNow`, so they print the same text; after mount the browser
 * clock takes over and ticks, so a tab left open never shows stale ages.
 */
export function useNow(serverNow: number): number {
  const [now, setNow] = useState(serverNow);

  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
    };

    tick();
    const timer = setInterval(tick, TICK_MS);

    return () => {
      clearInterval(timer);
    };
  }, []);

  return now;
}
