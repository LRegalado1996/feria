import { createHmac } from "node:crypto";

import { ipAddress } from "@vercel/functions";

import { env } from "@/env";

/**
 * The part of an address one client controls. An IPv4 address is one
 * client; an IPv6 home or phone connection usually holds a whole /64, so
 * keying on the full address would hand it a fresh bucket per request.
 * An IPv4 address written as IPv6 (`::ffff:1.2.3.4`) is its IPv4 part.
 */
export function clientAddress(ip: string): string {
  if (!ip.includes(":")) {
    return ip;
  }

  const embeddedIpv4 = /:(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(ip)?.[1];

  if (embeddedIpv4) {
    return embeddedIpv4;
  }

  const [head = "", tail] = ip.toLowerCase().split("::");
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === undefined || tail === "" ? [] : tail.split(":");
  const groups =
    tail === undefined
      ? headGroups
      : [
          ...headGroups,
          ...Array.from(
            { length: 8 - headGroups.length - tailGroups.length },
            () => "0"
          ),
          ...tailGroups,
        ];
  const prefix = groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/u, ""));

  return `${prefix.join(":")}::/64`;
}

/**
 * A keyed hash of `purpose` and the client's address as the platform
 * reports it (`x-real-ip`, set by Vercel; a client cannot forge it there),
 * so the database never holds an IP. `null` without an address or a secret,
 * as on a local server.
 */
function keyedClient(headers: Headers, purpose: string): string | null {
  const ip = ipAddress({ headers });
  // Required in production, where the platform gives the IP; a local server
  // may run without one.
  const secret = env.BETTER_AUTH_SECRET;

  if (!ip || !secret) {
    return null;
  }

  return createHmac("sha256", secret)
    .update(`${purpose}:${clientAddress(ip)}`)
    .digest("base64url");
}

/**
 * The client's key for the hourly order limit (FER-025). `null` when there
 * is none: then only the per-phone limit applies, never one shared bucket
 * for every unknown client (docs/agents/security.md).
 */
export function orderClientKey(headers: Headers): string | null {
  return keyedClient(headers, "order-client");
}

/**
 * The client's bucket for one daily cap of the view counts (FER-029): what
 * it counted (`subject`, the visit or one article) on `day`, hashed with its
 * address, so a stored bucket names neither, and the same client's buckets
 * of two days or two articles cannot be linked. `null` when there is no
 * address: the caps are then skipped, never one shared bucket.
 */
export function metricsBucket(
  headers: Headers,
  { day, subject }: { day: string; subject: string }
): string | null {
  return keyedClient(headers, `metrics:${day}:${subject}`);
}
