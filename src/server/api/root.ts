import { postRouter } from "@/server/api/routers/post";
import { storeRouter } from "@/server/api/routers/store";

export const appRouter = {
  post: postRouter,
  store: storeRouter,
};

export type AppRouter = typeof appRouter;
