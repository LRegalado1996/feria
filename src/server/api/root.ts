import { adminRouter } from "@/server/api/routers/admin";
import { attributeRouter } from "@/server/api/routers/attribute";
import { catalogRouter } from "@/server/api/routers/catalog";
import { categoryRouter } from "@/server/api/routers/category";
import { orderRouter } from "@/server/api/routers/order";
import { productRouter } from "@/server/api/routers/product";
import { storeRouter } from "@/server/api/routers/store";

export const appRouter = {
  admin: adminRouter,
  attribute: attributeRouter,
  catalog: catalogRouter,
  category: categoryRouter,
  order: orderRouter,
  product: productRouter,
  store: storeRouter,
};

export type AppRouter = typeof appRouter;
