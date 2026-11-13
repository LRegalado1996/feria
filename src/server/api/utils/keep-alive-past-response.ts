import { setTimeout as sleep } from "node:timers/promises";

import { waitUntil } from "@vercel/functions";
import { after } from "next/server";

import { captureExceptionWithScope } from "@/lib/sentry";

const DEFAULT_TIMEOUT_MS = 10_000;

async function rejectAfter(ms: number, action: string): Promise<never> {
  // Unref'd: a script or test that never awaits it is not held open.
  await sleep(ms, undefined, { ref: false });
  throw new Error(`${action} was still running after ${ms} ms`);
}

/** Never rejects: a failure or an overrun is reported, not left unhandled. */
async function settle(
  work: Promise<unknown>,
  action: string,
  timeoutMs: number
): Promise<void> {
  try {
    await Promise.race([work, rejectAfter(timeoutMs, action)]);
  } catch (error) {
    captureExceptionWithScope(error, { action });
  }
}

/**
 * Keep side work (a webhook, an email, a log drain) alive after the response
 * is sent, without the caller awaiting it. An unregistered promise is not
 * enough: Vercel may freeze the instance once the response ships.
 *
 * `after()` registers it inside a request scope. Outside one (a streamed
 * body completing, a script, a test) `after()` throws, and `waitUntil` takes
 * over, a no-op off Vercel where the work simply runs on. Either way the wait
 * is bounded, and a failure or an overrun is reported under `action`
 * (`Domain.snake_action`).
 */
export function keepAlivePastResponse(
  work: Promise<unknown>,
  {
    action,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { action: string; timeoutMs?: number }
): void {
  const settled = settle(work, action, timeoutMs);
  try {
    after(settled);
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        error.message.includes("outside a request scope")
      )
    ) {
      throw error;
    }
    waitUntil(settled);
  }
}
