/** The longest the browser may hold an idle callback back once the page loaded. */
const IDLE_TIMEOUT_MS = 2000;

interface WhenPageIdleOptions {
  /** The longest to wait for an idle moment after the load, in ms. */
  timeout?: number;
  win?: Window;
}

/**
 * Runs `callback` once the page has loaded and the browser has an idle
 * moment, or `timeout` after the load, whichever comes first: for work a
 * page can do without (a recorder, photos out of view) that should not
 * compete with what the visitor came to see. Safari has no
 * `requestIdleCallback`: a zero timeout after the load stands in for it.
 * Answers a function that cancels it, for a component that unmounts first.
 */
export function whenPageIdle(
  callback: () => void,
  { timeout = IDLE_TIMEOUT_MS, win = window }: WhenPageIdleOptions = {}
): () => void {
  let cancel = () => {
    win.removeEventListener("load", schedule);
  };

  // Once it ran there is nothing left to cancel.
  function run() {
    cancel = () => undefined;
    callback();
  }

  function schedule() {
    if (typeof win.requestIdleCallback === "function") {
      const id = win.requestIdleCallback(run, { timeout });
      cancel = () => {
        win.cancelIdleCallback(id);
      };
    } else {
      const id = win.setTimeout(run, 0);
      cancel = () => {
        win.clearTimeout(id);
      };
    }
  }

  if (win.document.readyState === "complete") {
    schedule();
  } else {
    win.addEventListener("load", schedule, { once: true });
  }

  return () => {
    cancel();
  };
}
