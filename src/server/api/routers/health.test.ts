import { call } from "@orpc/server";
import { describe, expect, test, vi } from "vitest";

import { createUnauthenticatedMockContext } from "@/server/test";
import { renderSql } from "@/server/test/render-sql";

import { healthRouter } from "./health";

const { env } = vi.hoisted(() => ({
  env: { HEALTH_SECRET: undefined as string | undefined },
}));

vi.mock("@/env", () => ({ env }));

const SECRET = "synthetic-health-secret-0123456789";

function setup({
  authorization,
  healthSecret,
  secret,
}: { authorization?: string; healthSecret?: string; secret?: string } = {}) {
  env.HEALTH_SECRET = healthSecret;
  const { mockCtx } = createUnauthenticatedMockContext();
  if (authorization) {
    mockCtx.headers.set("authorization", authorization);
  }

  return {
    db: mockCtx.db,
    // The SQL of every round trip the probe made.
    queries: () =>
      mockCtx.db.$.execute.mock.calls.map(([query]) => renderSql(query)),
    probe: async () =>
      await call(healthRouter.status, secret ? { secret } : {}, {
        context: mockCtx as never,
      }),
  };
}

describe("health.status", () => {
  test("answers ok after one round trip to the database", async () => {
    const { probe, queries } = setup();

    await expect(probe()).resolves.toEqual({ db: "ok" });
    expect(queries()).toEqual(["select 1"]);
  });

  test("answers SERVICE_UNAVAILABLE after a single failed attempt", async () => {
    const { db, probe, queries } = setup();
    db.$.execute.mockRejectedValue(new Error("connection refused"));

    await expect(probe()).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "The database is unreachable.",
      status: 503,
    });
    expect(queries()).toEqual(["select 1"]);
  });

  test.each([
    ["a bearer token", { authorization: `Bearer ${SECRET}` }],
    ["a query parameter", { secret: SECRET }],
  ])("accepts the secret as %s", async (_case, presented) => {
    const { probe, queries } = setup({ healthSecret: SECRET, ...presented });

    await expect(probe()).resolves.toEqual({ db: "ok" });
    expect(queries()).toEqual(["select 1"]);
  });

  test.each([
    ["no secret", {}],
    ["a wrong bearer token", { authorization: "Bearer wrong" }],
    ["the secret plus one character", { secret: `${SECRET}x` }],
    ["the secret minus its last character", { secret: SECRET.slice(0, -1) }],
  ])("refuses %s without touching the database", async (_case, presented) => {
    const { db, probe } = setup({ healthSecret: SECRET, ...presented });

    await expect(probe()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
    expect(db.$.execute).not.toHaveBeenCalled();
  });
});
