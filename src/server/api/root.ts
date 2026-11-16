import { adminRouter } from "@/server/api/routers/admin";
import { catalogRouter } from "@/server/api/routers/catalog";
import { postRouter } from "@/server/api/routers/post";
import { productRouter } from "@/server/api/routers/product";
import { storeRouter } from "@/server/api/routers/store";

export const appRouter = {
  admin: adminRouter,
  catalog: catalogRouter,
  post: postRouter,
  product: productRouter,
  store: storeRouter,
};

export type AppRouter = typeof appRouter;
