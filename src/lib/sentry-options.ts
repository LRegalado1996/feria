import { ORPCError } from "@orpc/client";
import type { ErrorEvent, Event, EventHint } from "@sentry/nextjs";

import {
  detectStableEnvironment,
  isProductionDeploy,
  isVercelPreviewDeploy,
} from "@/lib/env/deploy";
import { sanitizeForLog } from "@/lib/redaction";

/**
 * What every Sentry runtime (`sentry.server.config.ts`,
 * `instrumentation-client.ts`) shares: which deployments report, what data
 * leaves the process, and which events are not issues. Kept out of those two
 * files because they call `init()` on import, so nothing in them is testable.
 */

type DeployEnv = Record<string, string | undefined>;

/**
 * The Sentry `environment`, or `null` when this deployment must not report at
 * all. `production` and `qa` report under their own names. Every other Vercel
 * preview is a throwaway branch whose issues would outlive it, so it never
 * initialises Sentry. Local, CI and Docker report under `NODE_ENV`.
 */
export function resolveSentryEnvironment(env: DeployEnv): string | null {
  const stable = detectStableEnvironment(env);
  if (stable) {
    return stable;
  }
  if (isVercelPreviewDeploy(env)) {
    return null;
  }
  // `||`, not `??`: the browser gets "" for a variable unset at build time.
  // oxlint-disable-next-line typescript/prefer-nullish-coalescing -- "" must fall back too
  return env.NODE_ENV || "development";
}

/** All traces off production, a tenth on it. */
export function tracesSampleRate(env: DeployEnv): number {
  return isProductionDeploy(env) ? 0.1 : 1;
}

/**
 * The client IP headers Sentry itself withholds without `sendDefaultPii`.
 * Credential headers, cookies and query params (`auth`, `token`, `secret`,
 * `session`, …) are filtered by the SDK whatever this says.
 */
const CLIENT_IP_SNIPPETS = ["forwarded", "-ip", "remote-", "via", "-user"];

/**
 * Privacy-safe and spelled out, so turning a category on is a reviewed
 * one-line change: no user identity, cookies, bodies, client IPs, query values
 * or AI prompts. `frameContextLines` is restated because the default drops to
 * 5 once `dataCollection` is present. A fresh object per call: the SDK types
 * its arrays as mutable.
 */
export function sentryDataCollection() {
  return {
    userInfo: false,
    cookies: false,
    httpHeaders: { deny: CLIENT_IP_SNIPPETS },
    httpBodies: [],
    urlQueryParams: { deny: CLIENT_IP_SNIPPETS },
    databaseQueryData: false,
    graphQL: { document: false, variables: false },
    genAI: { inputs: false, outputs: false },
    stackFrameVariables: true,
    frameContextLines: 7,
  };
}

/**
 * Next's plumbing spans, promoted to transactions with no route identity, and
 * the events tunnel itself.
 */
export const SENTRY_IGNORE_TRANSACTIONS: (RegExp | string)[] = [
  "start response",
  /^render route /,
  /^executing api route /,
  /\/monitoring/,
];

/**
 * The event with every secret withheld, through the same `sanitizeForLog` as
 * every other log egress: a failed query's values in a message, a breadcrumb or
 * a frame's variables, credentials under any key, and a driver's `params`.
 */
export function scrubEventSecrets<T extends Event>(event: T): T {
  // The sanitizer keeps the event's shape except where it withholds a value,
  // which becomes the "[REDACTED]" string; Sentry drops a mistyped field, not
  // the event.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- shape kept, see above
  return sanitizeForLog(event) as T;
}

const BUSINESS_ERROR_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
]);

/**
 * A typed refusal the server meant to send. The client handles it; it is not a
 * defect, so it never opens an issue. Matched by code, never by message:
 * `UNAUTHORIZED` reads `Unauthorized`.
 */
export function isBusinessError(error: unknown): boolean {
  return (
    error instanceof ORPCError && BUSINESS_ERROR_CODES.has(String(error.code))
  );
}

/**
 * Crawler product tokens, anchored at the END of the token: a phone model such
 * as `CUBOT_NOTE_20` continues past the letters, a crawler (`Googlebot/2.1`,
 * `bingbot/2.0`, `Bytespider;`) closes the token there.
 */
const CRAWLER_TOKEN = /(?:bot|crawler|crawling|spider|slurp)(?:[/;)]|$)/i;
const NAMED_CRAWLER =
  /facebookexternalhit|headlesschrome|chrome-lighthouse|adsbot-google|mediapartners-google|bingpreview|google-inspectiontool|googleother|storebot-google/i;

function isCrawler(event: ErrorEvent, userAgent: string | undefined): boolean {
  if (event.contexts?.device?.family === "Spider") {
    return true;
  }
  return (
    userAgent !== undefined &&
    (CRAWLER_TOKEN.test(userAgent) || NAMED_CRAWLER.test(userAgent))
  );
}

/**
 * Next's `notFound()`, `forbidden()` and `unauthorized()` thrown after a
 * `loading.tsx` streamed the shell reach `window.reportError` as a recoverable
 * error carrying this digest. The user saw exactly the page the code asked
 * for. Matched exactly, as Next itself matches it: any other digest is a real
 * broken page.
 */
function isStreamedNavigationSignal(hint: EventHint): boolean {
  const error = hint.originalException;
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }
  return (
    typeof error.digest === "string" &&
    /^NEXT_HTTP_ERROR_FALLBACK;(?:401|403|404)$/.test(error.digest)
  );
}

const EXTENSION_URL =
  /^(?:chrome|moz|safari(?:-web)?|ms-browser)-extension:\/\//;

/** Every frame that names a file is a browser extension's own code. */
function isExtensionError(event: ErrorEvent): boolean {
  const files = (event.exception?.values ?? []).flatMap((exception) =>
    (exception.stacktrace?.frames ?? []).flatMap((frame) =>
      frame.filename ? [frame.filename] : []
    )
  );
  return files.length > 0 && files.every((file) => EXTENSION_URL.test(file));
}

/**
 * The browser `beforeSend`: drops only provable non-bugs (crawlers, streamed
 * navigation signals, typed business errors, extension code) and scrubs the
 * rest. `userAgent` is injected so this is testable outside a browser.
 */
export function filterClientEvent(
  event: ErrorEvent,
  hint: EventHint,
  userAgent: string | undefined
): ErrorEvent | null {
  if (
    isCrawler(event, userAgent) ||
    isStreamedNavigationSignal(hint) ||
    isBusinessError(hint.originalException) ||
    isExtensionError(event)
  ) {
    return null;
  }
  return scrubEventSecrets(event);
}
