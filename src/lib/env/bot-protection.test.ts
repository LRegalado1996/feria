import { NextRequest } from "next/server";
import { describe, expect, test, vi } from "vitest";

import { POST } from "@/app/api/orpc/[[...rest]]/route";
import type { appRouter as AppRouter } from "@/server/api/root";
import { orderRouter } from "@/server/api/routers/order";

import { BOT_PROTECTED_REQUESTS } from "./bot-protection";

const { getSession, realAppRouter } = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ headers: new Headers(), response: null })),
  // The real router tree, kept for the assertion that `order.create` is the
  // procedure the route below stands in for.
  realAppRouter: new Map<"tree", unknown>(),
}));

vi.mock("@/env", () => ({
  env: { DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

vi.mock("@/server/better-auth", () => ({ auth: { api: { getSession } } }));

// The real router tree with one leaf swapped: `order.create` answers who it
// is, so a request the RPC handler routes there proves the path, without
// placing an order.
vi.mock("@/server/api/root", async (importOriginal) => {
  const actual = await importOriginal<{ appRouter: typeof AppRouter }>();
  const { publicProcedure } = await import("@/server/api/orpc");
  realAppRouter.set("tree", actual.appRouter);

  return {
    appRouter: {
      ...actual.appRouter,
      order: {
        ...actual.appRouter.order,
        create: publicProcedure.handler(() => "order.create"),
      },
    },
  };
});

function setup() {
  const [protectedRequest] = BOT_PROTECTED_REQUESTS;

  return {
    protectedRequest,
    send: async (method: string, path: string) =>
      await POST(
        new NextRequest(`http://localhost:3000${path}`, {
          body: JSON.stringify({ json: {} }),
          headers: { "content-type": "application/json" },
          method,
        })
      ),
  };
}

describe("BOT_PROTECTED_REQUESTS", () => {
  test("protects exactly one request: placing an order through the oRPC endpoint", () => {
    expect(BOT_PROTECTED_REQUESTS).toEqual([
      { method: "POST", path: "/api/orpc/order/create" },
    ]);
  });

  test("names the path where the RPC handler, under its /api/orpc prefix, serves order.create", async () => {
    const { protectedRequest, send } = setup();
    // The swapped leaf sits where the real `order.create` is.
    expect(realAppRouter.get("tree")).toMatchObject({
      order: { create: orderRouter.create },
    });

    const response = await send(
      protectedRequest?.method ?? "",
      protectedRequest?.path ?? ""
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ json: "order.create" });
  });
});
