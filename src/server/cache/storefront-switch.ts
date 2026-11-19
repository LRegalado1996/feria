import { captureExceptionWithScope } from "@/lib/sentry";
import { db } from "@/server/db";
import { isComingSoonPublished } from "@/server/services/coming-soon";

/**
 * How long one instance trusts the switch it read. Next runs no `"use cache"`
 * in the proxy and the proxy shares no memory with the functions that save,
 * so no tag can reach this read: a flip from the admin takes effect on every
 * instance within this window, and a busy instance asks the database once
 * per window, not once per page.
 */
export const SWITCH_TTL_MS = 5000;

/**
 * How long a page request waits for the switch before it gives up and
 * treats the store as closed. Long enough for a database waking from idle.
 */
export const SWITCH_TIMEOUT_MS = 5000;

interface StorefrontSwitchOptions {
  now: () => number;
  /** Whether the coming-soon page is published (the store closed). */
  read: () => Promise<boolean>;
  report: (error: unknown) => void;
  timeoutMs: number;
  ttlMs: number;
}

/** `promise`, or a rejection once `ms` have passed without it settling. */
async function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`The storefront switch took over ${ms} ms`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The switch as the proxy reads it: remembered for `ttlMs`, one read at a
 * time however many requests arrive together. It fails closed: a read that
 * throws or outlasts `timeoutMs` is reported and answers "closed" for the
 * window, so a database outage hides the store from the public instead of
 * opening it, and costs one wait per window rather than one per request.
 */
export function createStorefrontSwitch({
  now,
  read,
  report,
  timeoutMs,
  ttlMs,
}: StorefrontSwitchOptions) {
  let known: { closed: boolean; until: number } | null = null;
  let pending: Promise<boolean> | null = null;

  async function load(): Promise<boolean> {
    try {
      return await within(read(), timeoutMs);
    } catch (error) {
      report(error);

      return true;
    }
  }

  async function refresh(): Promise<boolean> {
    const closed = await load();
    known = { closed, until: now() + ttlMs };
    pending = null;

    return closed;
  }

  return {
    async isClosed(): Promise<boolean> {
      if (known && now() < known.until) {
        return known.closed;
      }

      pending ??= refresh();

      return await pending;
    },
  };
}

const storefrontSwitch = createStorefrontSwitch({
  now: () => Date.now(),
  read: async () => await isComingSoonPublished(db),
  report: (error) => {
    captureExceptionWithScope(error, {
      action: "ComingSoon.read_switch",
    });
  },
  timeoutMs: SWITCH_TIMEOUT_MS,
  ttlMs: SWITCH_TTL_MS,
});

/**
 * Whether the public sees only the coming-soon page (FER-034): its switch,
 * read for the proxy. Closed when the database cannot say.
 */
export async function isStorefrontClosed(): Promise<boolean> {
  return await storefrontSwitch.isClosed();
}
