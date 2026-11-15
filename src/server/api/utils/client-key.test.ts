import { createHmac } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import { orderClientKey } from "./client-key";

const { env } = vi.hoisted(() => ({
  env: { BETTER_AUTH_SECRET: undefined as string | undefined },
}));

vi.mock("@/env", () => ({ env }));

const SECRET = "a-secret-only-tests-know";

function setup({ secret = SECRET }: { secret?: string } = {}) {
  env.BETTER_AUTH_SECRET = secret === "" ? undefined : secret;

  return {
    keyFor: (headers: Record<string, string>) =>
      orderClientKey(new Headers(headers)),
  };
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

    expect(key).toBe(
      createHmac("sha256", SECRET)
        .update("order-client:203.0.113.7")
        .digest("base64url")
    );
    expect(keyFor({ "x-real-ip": "203.0.113.7" })).toBe(key);
    expect(keyFor({ "x-real-ip": "203.0.113.8" })).not.toBe(key);
    expect(key).not.toContain("203.0.113.7");
  });

  test("depends on the secret, so the database alone cannot reverse it", () => {
    const first = setup().keyFor({ "x-real-ip": "203.0.113.7" });
    const second = setup({ secret: "another-secret" }).keyFor({
      "x-real-ip": "203.0.113.7",
    });

    expect(second).toBe(
      createHmac("sha256", "another-secret")
        .update("order-client:203.0.113.7")
        .digest("base64url")
    );
    expect(second).not.toBe(first);
  });
});
