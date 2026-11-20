import { expect, test, vi } from "vitest";

import { appRouter } from "./root";
import { homeRouter } from "./routers/home";
import { orderRouter } from "./routers/order";
import { storeRouter } from "./routers/store";
import { uploadRouter } from "./routers/upload";

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
    "home",
    "order",
    "product",
    "store",
    "upload",
  ]);
  expect(appRouter.home).toBe(homeRouter);
  expect(appRouter.order).toBe(orderRouter);
  expect(appRouter.store).toBe(storeRouter);
  expect(appRouter.upload).toBe(uploadRouter);
});
