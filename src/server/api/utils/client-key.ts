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
 * The client's key for the hourly order limit (FER-025): a keyed hash of the
 * address the platform reports (`x-real-ip`, set by Vercel; a client cannot
 * forge it there), so the database never holds an IP. `null` when there is
 * none, as on a local server: then only the per-phone limit applies, never
 * one shared bucket for every unknown client (docs/agents/security.md).
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
    .update(`order-client:${clientAddress(ip)}`)
    .digest("base64url");
}
