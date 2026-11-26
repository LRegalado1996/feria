import { expect, test, vi } from "vitest";

import { appRouter } from "./root";
import { comingSoonRouter } from "./routers/coming-soon";
import { metricsRouter } from "./routers/metrics";
import { orderRouter } from "./routers/order";
import { pageRouter } from "./routers/page";
import { storeRouter } from "./routers/store";
import { uploadRouter } from "./routers/upload";
import { userRouter } from "./routers/user";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Every key here is a public URL prefix (`/api/orpc/order/...`): a router
// mounted by accident is reachable, and one dropped is a 404 for every client.
test("mounts each domain router at its own key, and nothing else", () => {
  expect(Object.keys(appRouter)).toEqual([
    "admin",
    "attribute",
    "catalog",
    "category",
    "comingSoon",
    "metrics",
    "order",
    "page",
    "product",
    "store",
    "upload",
    "user",
  ]);
  expect(appRouter.comingSoon).toBe(comingSoonRouter);
  expect(appRouter.metrics).toBe(metricsRouter);
  expect(appRouter.page).toBe(pageRouter);
  expect(appRouter.order).toBe(orderRouter);
  expect(appRouter.store).toBe(storeRouter);
  expect(appRouter.upload).toBe(uploadRouter);
  expect(appRouter.user).toBe(userRouter);
});
