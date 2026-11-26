import { adminRouter } from "@/server/api/routers/admin";
import { attributeRouter } from "@/server/api/routers/attribute";
import { catalogRouter } from "@/server/api/routers/catalog";
import { categoryRouter } from "@/server/api/routers/category";
import { comingSoonRouter } from "@/server/api/routers/coming-soon";
import { orderRouter } from "@/server/api/routers/order";
import { pageRouter } from "@/server/api/routers/page";
import { productRouter } from "@/server/api/routers/product";
import { storeRouter } from "@/server/api/routers/store";
import { uploadRouter } from "@/server/api/routers/upload";
import { userRouter } from "@/server/api/routers/user";

export const appRouter = {
  admin: adminRouter,
  attribute: attributeRouter,
  catalog: catalogRouter,
  category: categoryRouter,
  comingSoon: comingSoonRouter,
  order: orderRouter,
  page: pageRouter,
  product: productRouter,
  store: storeRouter,
  upload: uploadRouter,
  user: userRouter,
};

export type AppRouter = typeof appRouter;
