import { createHmac } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import { clientAddress, metricsBucket, orderClientKey } from "./client-key";

const { env } = vi.hoisted(() => ({
  env: { BETTER_AUTH_SECRET: undefined as string | undefined },
}));

vi.mock("@/env", () => ({ env }));

const SECRET = "synthetic-order-client-secret";

function setup({ secret = SECRET }: { secret?: string } = {}) {
  env.BETTER_AUTH_SECRET = secret === "" ? undefined : secret;

  return {
    keyFor: (headers: Record<string, string>) =>
      orderClientKey(new Headers(headers)),
  };
}

describe("clientAddress", () => {
  test.each([
    ["an IPv4 address as is", "203.0.113.7", "203.0.113.7"],
    ["an IPv4 address written as IPv6", "::ffff:203.0.113.7", "203.0.113.7"],
    [
      "a full IPv6 address by its /64",
      "2001:0db8:85a3:0042:1000:8a2e:0370:7334",
      "2001:db8:85a3:42::/64",
    ],
    ["a compressed one", "2001:db8::1", "2001:db8:0:0::/64"],
    ["one compressed inside its /64", "2001:db8:1::7:8", "2001:db8:1:0::/64"],
    ["one compressed after its /64", "2001:db8:1:2::8", "2001:db8:1:2::/64"],
    ["the loopback", "::1", "0:0:0:0::/64"],
    [
      "uppercase, lowercased",
      "2001:DB8:ABCD:EF01::1",
      "2001:db8:abcd:ef01::/64",
    ],
    [
      "a group of zeros as one zero",
      "2001:0db8:0000:00a0::1",
      "2001:db8:0:a0::/64",
    ],
  ])("keys %s: %s is %s", (_case, ip, address) => {
    expect(clientAddress(ip)).toBe(address);
  });
});

/** The key the hash of `address` gives under `secret`. */
function keyOf(address: string, secret = SECRET) {
  return createHmac("sha256", secret)
    .update(`order-client:${address}`)
    .digest("base64url");
}

describe("orderClientKey", () => {
  test("is null without the platform's IP, even with a forwarded one", () => {
    const { keyFor } = setup();

    expect(keyFor({})).toBeNull();
    expect(keyFor({ "x-forwarded-for": "203.0.113.7" })).toBeNull();
  });

  test("is null without a secret to key the hash", () => {
    const { keyFor } = setup({ secret: "" });

    expect(keyFor({ "x-real-ip": "203.0.113.7" })).toBeNull();
  });

  test("is the IP's keyed hash: stable, different per IP, never the IP", () => {
    const { keyFor } = setup();

    const key = keyFor({ "x-real-ip": "203.0.113.7" });

    expect(key).toBe(keyOf("203.0.113.7"));
    expect(keyFor({ "x-real-ip": "203.0.113.7" })).toBe(key);
    expect(keyFor({ "x-real-ip": "203.0.113.8" })).toBe(keyOf("203.0.113.8"));
    expect(keyOf("203.0.113.8")).not.toBe(key);
    expect(key).not.toContain("203.0.113.7");
  });

  test("depends on the secret, so the database alone cannot reverse it", () => {
    const first = setup().keyFor({ "x-real-ip": "203.0.113.7" });
    const second = setup({ secret: "synthetic-other-secret" }).keyFor({
      "x-real-ip": "203.0.113.7",
    });

    expect(second).toBe(keyOf("203.0.113.7", "synthetic-other-secret"));
    expect(second).not.toBe(first);
  });

  test("keys an IPv6 client by its /64: one connection, one bucket", () => {
    const { keyFor } = setup();

    const key = keyFor({ "x-real-ip": "2001:db8:1:2::8" });

    expect(key).toBe(keyOf("2001:db8:1:2::/64"));
    expect(keyFor({ "x-real-ip": "2001:db8:1:2:ffff::9" })).toBe(key);
    expect(keyFor({ "x-real-ip": "2001:db8:1:3::8" })).toBe(
      keyOf("2001:db8:1:3::/64")
    );
    expect(keyOf("2001:db8:1:3::/64")).not.toBe(key);
  });
});

/** The bucket the hash of `subject` on `day` from `address` gives. */
function bucketOf(day: string, subject: string, address: string) {
  return createHmac("sha256", SECRET)
    .update(`metrics:${day}:${subject}:${address}`)
    .digest("base64url");
}

describe("metricsBucket", () => {
  test("is null without the platform's IP or without a secret", () => {
    setup();
    const scope = { day: "2026-12-05", subject: "visit" };

    expect(metricsBucket(new Headers(), scope)).toBeNull();
    expect(
      metricsBucket(new Headers({ "x-forwarded-for": "203.0.113.7" }), scope)
    ).toBeNull();

    setup({ secret: "" });

    expect(
      metricsBucket(new Headers({ "x-real-ip": "203.0.113.7" }), scope)
    ).toBeNull();
  });

  test("hashes the day, what is counted and the address, never showing either", () => {
    setup();
    const headers = new Headers({ "x-real-ip": "203.0.113.7" });

    const bucket = metricsBucket(headers, {
      day: "2026-12-05",
      subject: "view:42",
    });

    expect(bucket).toBe(bucketOf("2026-12-05", "view:42", "203.0.113.7"));
    expect(bucket).not.toContain("203.0.113.7");
    expect(bucket).not.toContain("42");
    // Not the order limit's key: the two can never be joined.
    expect(bucket).not.toBe(keyOf("203.0.113.7"));
  });

  test.each([
    ["another day", { day: "2026-12-06", subject: "view:42" }],
    ["another article", { day: "2026-12-05", subject: "view:43" }],
    ["the visit", { day: "2026-12-05", subject: "visit" }],
  ])("gives %s its own bucket", (_case, scope) => {
    setup();
    const headers = new Headers({ "x-real-ip": "203.0.113.7" });

    expect(metricsBucket(headers, scope)).toBe(
      bucketOf(scope.day, scope.subject, "203.0.113.7")
    );
    expect(metricsBucket(headers, scope)).not.toBe(
      bucketOf("2026-12-05", "view:42", "203.0.113.7")
    );
  });

  test("keys an IPv6 client by its /64", () => {
    setup();
    const scope = { day: "2026-12-05", subject: "visit" };

    expect(
      metricsBucket(new Headers({ "x-real-ip": "2001:db8:1:2::8" }), scope)
    ).toBe(bucketOf("2026-12-05", "visit", "2001:db8:1:2::/64"));
    expect(
      metricsBucket(new Headers({ "x-real-ip": "2001:db8:1:2:ffff::9" }), scope)
    ).toBe(bucketOf("2026-12-05", "visit", "2001:db8:1:2::/64"));
  });
});
