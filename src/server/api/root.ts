import { postRouter } from "@/server/api/routers/post";

export const appRouter = {
  post: postRouter,
};

export type AppRouter = typeof appRouter;
