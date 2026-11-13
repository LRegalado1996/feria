import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { config, proxy } from "./proxy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("proxy", () => {
  test("stamps a request id and the start time on the forwarded request and the response", async () => {
    vi.setSystemTime(new Date("2024-06-15T12:00:00.000Z"));

    const response = await proxy(
      new NextRequest("http://localhost:3000/api/orpc/post/create")
    );
    const requestId = response.headers.get("x-request-id");

    expect(requestId).toMatch(UUID);
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe(
      requestId
    );
    expect(response.headers.get("x-middleware-request-x-evlog-start")).toBe(
      "1718452800000"
    );
  });

  test("keeps the request id a caller already sent", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/api/health", {
        headers: { "x-request-id": "upstream-42" },
      })
    );

    expect(response.headers.get("x-request-id")).toBe("upstream-42");
    expect(response.headers.get("x-middleware-request-x-request-id")).toBe(
      "upstream-42"
    );
  });

  test("runs on /api only", () => {
    expect(config.matcher).toEqual(["/api/:path*"]);
  });
});
