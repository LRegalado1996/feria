import { describe, expect, test } from "vitest";

import { withExplicitSslMode } from "./connection-string";

const NEON = "postgresql://app:s%40cret@ep-x-pooler.neon.tech/app";

describe("withExplicitSslMode", () => {
  test.each(["prefer", "require", "verify-ca"])(
    "spells sslmode=%s as the verify-full pg already applies",
    (mode) => {
      const url = new URL(
        withExplicitSslMode(`${NEON}?sslmode=${mode}&channel_binding=require`)
      );

      expect(url.searchParams.get("sslmode")).toBe("verify-full");
      // The rest of the URL is the caller's, untouched.
      expect(url.searchParams.get("channel_binding")).toBe("require");
      expect(url.password).toBe("s%40cret");
      expect(url.host).toBe("ep-x-pooler.neon.tech");
    }
  );

  test.each([
    ["verify-full", `${NEON}?sslmode=verify-full`],
    ["disable", `${NEON}?sslmode=disable`],
    ["no-verify", `${NEON}?sslmode=no-verify`],
    ["no sslmode (the local database)", "postgresql://feria@localhost/feria"],
    [
      "libpq semantics opted into",
      `${NEON}?uselibpqcompat=true&sslmode=require`,
    ],
    ["an unparseable string", "not a url"],
  ])("leaves %s as it came", (_case, connectionString) => {
    expect(withExplicitSslMode(connectionString)).toBe(connectionString);
  });

  test("still rewrites when libpq compatibility is named but off", () => {
    const url = new URL(
      withExplicitSslMode(`${NEON}?uselibpqcompat=false&sslmode=require`)
    );

    expect(url.searchParams.get("sslmode")).toBe("verify-full");
  });
});
