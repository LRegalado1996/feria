import { createFsDrain } from "evlog/fs";
import { createEvlog } from "evlog/next";

import { sanitizeRecordInPlace } from "@/lib/redaction";

/**
 * One wide event per request wrapped in `withEvlog`, written to the console:
 * pretty in development, one JSON line elsewhere, where the platform's runtime
 * logs keep it. `next dev` also writes a copy to `.evlog/logs/`, which the
 * `analyze-logs` skill reads.
 *
 * Redaction sits in these options because only they run before the console
 * write; a drain's own redaction would protect the drain and leave stdout raw.
 * It is `sanitizeForLog`, the same definition of "sensitive" as every other
 * egress, on top of evlog's built-in masks.
 *
 * The upstream `withEvlog` is used as is: since evlog 2.33 it registers a
 * streamed response's drain with `after()` while still in the request scope,
 * and rethrows Next's navigation signals.
 */
export const { withEvlog } = createEvlog({
  pretty: process.env.NODE_ENV !== "production",
  redact: { transform: sanitizeRecordInPlace },
  ...(process.env.NODE_ENV === "development" ? { drain: createFsDrain() } : {}),
});
