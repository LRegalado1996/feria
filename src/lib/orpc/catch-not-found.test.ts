import { ORPCError } from "@orpc/client";
import { describe, expect, test } from "vitest";

import { catchNotFound } from "./catch-not-found";

describe("catchNotFound", () => {
  test("resolves to the value when the call succeeds", async () => {
    await expect(catchNotFound(Promise.resolve({ id: 1 }))).resolves.toEqual({
      id: 1,
    });
  });

  test("turns NOT_FOUND into null", async () => {
    await expect(
      catchNotFound(Promise.reject(new ORPCError("NOT_FOUND")))
    ).resolves.toBeNull();
  });

  test("rethrows every other failure, typed or not", async () => {
    const forbidden = new ORPCError("FORBIDDEN");
    const outage = new Error("connection refused");

    await expect(catchNotFound(Promise.reject(forbidden))).rejects.toBe(
      forbidden
    );
    await expect(catchNotFound(Promise.reject(outage))).rejects.toBe(outage);
  });
});
