import { adminRouter } from "@/server/api/routers/admin";
import { attributeRouter } from "@/server/api/routers/attribute";
import { catalogRouter } from "@/server/api/routers/catalog";
import { categoryRouter } from "@/server/api/routers/category";
import { comingSoonRouter } from "@/server/api/routers/coming-soon";
import { homeRouter } from "@/server/api/routers/home";
import { orderRouter } from "@/server/api/routers/order";
import { productRouter } from "@/server/api/routers/product";
import { storeRouter } from "@/server/api/routers/store";
import { uploadRouter } from "@/server/api/routers/upload";

export const appRouter = {
  admin: adminRouter,
  attribute: attributeRouter,
  catalog: catalogRouter,
  category: categoryRouter,
  comingSoon: comingSoonRouter,
  home: homeRouter,
  order: orderRouter,
  product: productRouter,
  store: storeRouter,
  upload: uploadRouter,
};

export type AppRouter = typeof appRouter;
