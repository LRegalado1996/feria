import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { db } from "@/server/db";
import type { MockDatabase } from "@/server/test/context";
import { renderSql } from "@/server/test/render-sql";

import { GET } from "./route";

vi.mock("@/env", () => ({ env: { HEALTH_SECRET: undefined } }));

// `setup-common.ts` mocks the database with the Drizzle double.
const mockDb = db as unknown as MockDatabase;

function setup({ databaseDown = false } = {}) {
  if (databaseDown) {
    mockDb.$.execute.mockRejectedValueOnce(new Error("connection refused"));
  }

  return {
    execute: mockDb.$.execute,
    get: async (path = "", method = "GET") =>
      await GET(
        new NextRequest(`http://localhost:3000/api/health${path}`, { method })
      ),
  };
}

describe("health route", () => {
  test("answers 200 with the probe's result, never cached", async () => {
    const { execute, get } = setup();

    const response = await get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ db: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(execute).toHaveBeenCalledOnce();
    expect(renderSql(execute.mock.calls[0]?.[0])).toBe("select 1");
  });

  test("answers 503, never cached, when the database is down", async () => {
    const { get } = setup({ databaseDown: true });

    const response = await get();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: "The database is unreachable.",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("a HEAD request runs no probe", async () => {
    const { execute, get } = setup();

    const response = await get("", "HEAD");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(execute).not.toHaveBeenCalled();
  });

  test("serves nothing but the health router", async () => {
    const { execute, get } = setup();

    const response = await get("/posts");

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not found");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(execute).not.toHaveBeenCalled();
  });
});
