import { createHash, timingSafeEqual } from "node:crypto";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Whether a request's `Authorization` header is the one Vercel sends to a
 * cron, `Bearer <CRON_SECRET>`. Compared in constant time over the two
 * values' digests, which have one length whatever was sent, so neither the
 * secret's characters nor its length leak through the answer's timing.
 */
export function isCronRequest(
  authorization: string | null,
  secret: string
): boolean {
  return timingSafeEqual(
    sha256(authorization ?? ""),
    sha256(`Bearer ${secret}`)
  );
}
