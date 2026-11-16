import { randomInt } from "node:crypto";

/**
 * A value no other test holds, for the names and slugs a test gives its rows
 * in the one store every spec shares (FER-038): a whole UUID, never a short
 * random suffix (docs/agents/testing.md § Falsifiability). Lowercase hex and
 * dashes, so a name ending in it slugs to itself (`Collares <tag>` is
 * `collares-<tag>`).
 */
export function uniqueTag(): string {
  return crypto.randomUUID();
}

/**
 * A Uruguayan mobile for one test's orders: stored as `+5989…`, typed by a
 * shopper or the staff in its local form (`09X XXX XXX`). The hourly limit
 * counts a phone's orders across the whole store, and so does a search by
 * phone, so a test never shares one with another. A whole order code typed
 * in the search is read as a code, never as phone digits, so a phone may
 * hold another order's code digits without that search finding it.
 */
export function uniquePhone(): {
  /** The eight digits after `+598`, as no masked page may show them. */
  national: string;
  international: string;
  local: string;
} {
  const digits = String(randomInt(10_000_000)).padStart(7, "0");

  return {
    international: `+5989${digits}`,
    local: `09${digits.slice(0, 1)} ${digits.slice(1, 4)} ${digits.slice(4)}`,
    national: `9${digits}`,
  };
}
