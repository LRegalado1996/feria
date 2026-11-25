import { useEffect, useState } from "react";

import { whenPageIdle } from "@/lib/utils/page-idle";

/**
 * `false` in the server render, while hydrating and until the page has
 * loaded and the browser has an idle moment (`whenPageIdle`), then `true`:
 * for what a page can show a moment later (photos out of view) so it does
 * not compete with what the visitor came to see.
 */
export function usePageIdle(): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(
    () =>
      whenPageIdle(() => {
        setIdle(true);
      }),
    []
  );

  return idle;
}
