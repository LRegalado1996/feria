import { expect, test, vi } from "vitest";

import { appRouter } from "./root";
import { postRouter } from "./routers/post";
import { storeRouter } from "./routers/store";

vi.mock("@/env", () => ({
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

// Every key here is a public URL prefix (`/api/orpc/post/...`): a router
// mounted by accident is reachable, and one dropped is a 404 for every client.
test("mounts each domain router at its own key, and nothing else", () => {
  expect(Object.keys(appRouter)).toEqual(["post", "store"]);
  expect(appRouter.post).toBe(postRouter);
  expect(appRouter.store).toBe(storeRouter);
});
