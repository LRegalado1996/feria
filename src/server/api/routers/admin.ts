import { ORPCError } from "@orpc/server";

import { storeScopeSchema } from "@/lib/schemas/access";
import { protectedProcedure, storeProcedure } from "@/server/api/orpc";
import { getUserRole, listAccessibleStores } from "@/server/services/access";

/**
 * What the admin's pages decide with (FER-013). The role is read from the
 * database, never the session's copy: a demoted superadmin loses the platform
 * area on the next page, not when their cookie expires.
 */
export const adminRouter = {
  me: protectedProcedure
    .handler(async ({ context }) => {
      const { id, name } = context.session.user;
      const role = await getUserRole(context.db, id);

      if (role === null) {
        // The session outlived its user.
        throw new ORPCError("UNAUTHORIZED");
      }

      return {
        name,
        role,
        stores: await listAccessibleStores(context.db, id),
      };
    })
    .route({
      method: "GET",
      path: "/admin/me",
      summary: "The signed-in login, its role and the stores it may work on",
      tags: ["admin"],
    }),

  store: storeProcedure(storeScopeSchema)
    .handler(({ context }) => ({
      id: context.store.id,
      isActive: context.store.isActive,
      name: context.store.name,
      slug: context.store.slug,
    }))
    .route({
      method: "GET",
      path: "/admin/stores/{storeSlug}",
      summary: "A store the signed-in login may work on",
      tags: ["admin"],
    }),
};
