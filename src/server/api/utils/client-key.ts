import { createHmac } from "node:crypto";

import { ipAddress } from "@vercel/functions";

import { env } from "@/env";

/**
 * The client's key for the hourly order limit (FER-025): a keyed hash of the
 * IP the platform reports (`x-real-ip`, set by Vercel; a client cannot forge
 * it there), so the database never holds an IP. `null` when there is none,
 * as on a local server: then only the per-phone limit applies, never one
 * shared bucket for every unknown client (docs/agents/security.md).
 */
export function orderClientKey(headers: Headers): string | null {
  const ip = ipAddress({ headers });
  // Required in production, where the platform gives the IP; a local server
  // may run without one.
  const secret = env.BETTER_AUTH_SECRET;

  if (!ip || !secret) {
    return null;
  }

  return createHmac("sha256", secret)
    .update(`order-client:${ip}`)
    .digest("base64url");
}
