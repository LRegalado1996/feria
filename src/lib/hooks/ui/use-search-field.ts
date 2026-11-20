import { useEffect, useRef, useState } from "react";

/** How long typing pauses before the address follows it. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * A search field whose text the address keeps (the orders' search, FER-027;
 * the articles', FER-019): what is typed is sent once typing pauses, trimmed,
 * blank as none; submitting or clearing sends at once. The field keeps what
 * is typed while the address catches up with it: a search in the address
 * that this field sent is its own navigation arriving; any other came from
 * elsewhere (the back button, a link) and replaces the field, dropping a
 * search still waiting to be sent. `send` is read when the wait ends, so it
 * carries what the address holds then (a tab changed meanwhile), and nothing
 * is sent once the field is gone.
 */
export function useSearchField(
  current: string | undefined,
  send: (q: string | undefined) => void
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSend = useRef(send);
  const [value, setValue] = useState(current ?? "");
  // The search the address last brought, and the ones this field sent since.
  const [seen, setSeen] = useState(current);
  const [sent, setSent] = useState<(string | undefined)[]>([]);
  const [replaced, setReplaced] = useState(0);

  useEffect(() => {
    latestSend.current = send;
  });

  // A search still waiting when the field goes away would navigate back to
  // the screen it left: the pending timer is the work this cleans up.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  if (current !== seen) {
    const own = sent.indexOf(current);
    setSeen(current);
    setSent(own === -1 ? [] : sent.slice(own + 1));

    if (own === -1) {
      setValue(current ?? "");
      setReplaced((count) => count + 1);
    }
  }

  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // A search from elsewhere replaced the field: one still waiting to be sent
  // would navigate away from it, so it goes.
  useEffect(() => {
    if (replaced > 0 && timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, [replaced]);

  const go = (typed: string) => {
    const q = typed.trim() === "" ? undefined : typed.trim();
    setSent((previous) => [...previous, q]);
    latestSend.current(q);
  };

  return {
    /** Empties the field and the search, at once. */
    clear: () => {
      cancel();
      setValue("");
      go("");
    },
    /** What was typed: sent once typing pauses. */
    change: (typed: string) => {
      setValue(typed);
      cancel();
      timer.current = setTimeout(() => {
        go(typed);
      }, SEARCH_DEBOUNCE_MS);
    },
    /** Sends what the field holds, at once. */
    submit: () => {
      cancel();
      go(value);
    },
    value,
  };
}
