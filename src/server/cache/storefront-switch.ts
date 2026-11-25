import { captureExceptionWithScope } from "@/lib/sentry";
import { within } from "@/lib/utils/within";
import { db } from "@/server/db";
import { withStatementTimeout } from "@/server/db/statement-timeout";
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
 * treats the store as closed. Past a first connection attempt that hangs to
 * its limit and the pool's backoff, it leaves close to four seconds for the
 * second attempt and the read: with a wait as short as one attempt, the
 * retry could never save a read, and a cold instance showed an open store as
 * closed. Two attempts that both hang still end here, closed and reported.
 *
 * A longer wait does not make an answer older: the wait is mostly for the
 * connection, and the answer is as old as its statement, which Postgres
 * cancels at `SWITCH_STATEMENT_TIMEOUT_MS`, inside the window.
 */
export const SWITCH_TIMEOUT_MS = 7000;

/**
 * How long Postgres runs the switch's query before it cancels it: under the
 * proxy's wait and the window, so a stalled read hands its connection back
 * before the next window starts another, and a stall cannot fill the pool.
 * It times the statement alone, not the connection it waits for.
 */
export const SWITCH_STATEMENT_TIMEOUT_MS = 4000;

interface StorefrontSwitchOptions {
  now: () => number;
  /** Whether the coming-soon page is published (the store closed). */
  read: () => Promise<boolean>;
  report: (error: unknown) => void;
  timeoutMs: number;
  ttlMs: number;
}

/**
 * The switch as the proxy reads it: remembered for `ttlMs`, one read at a
 * time however many requests arrive together. A value is as old as the read
 * that asked for it, so a slow answer is trusted for what is left of its
 * window, never a whole window past it. It fails closed: a read that throws
 * or outlasts `timeoutMs` is reported and answers "closed" for a window
 * from the failure, so a database outage hides the store from the public
 * instead of opening it, and costs one wait per window rather than one per
 * request.
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

  async function load(): Promise<{ closed: boolean; until: number }> {
    const askedAt = now();

    try {
      const closed = await within(read(), timeoutMs, "The storefront switch");

      return { closed, until: askedAt + ttlMs };
    } catch (error) {
      report(error);

      return { closed: true, until: now() + ttlMs };
    }
  }

  async function refresh(): Promise<boolean> {
    known = await load();
    pending = null;

    return known.closed;
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
  read: async () =>
    await withStatementTimeout(
      db,
      SWITCH_STATEMENT_TIMEOUT_MS,
      async (tx) => await isComingSoonPublished(tx)
    ),
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
