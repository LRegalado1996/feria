import { ORPCError } from "@orpc/server";

import { protectedProcedure } from "@/server/api/orpc";
import { getAdminProfile } from "@/server/services/access";

/**
 * What the admin's pages decide with (FER-013). The role is read from the
 * database, never the session's copy: a demoted superadmin loses the platform
 * area on the next page, not when their cookie expires.
 */
export const adminRouter = {
  me: protectedProcedure
    .handler(async ({ context }) => {
      const { id, name } = context.session.user;
      const profile = await getAdminProfile(context.db, id);

      if (profile === null) {
        // The session outlived its user.
        throw new ORPCError("UNAUTHORIZED");
      }

      return { name, ...profile };
    })
    .route({
      method: "GET",
      path: "/admin/me",
      summary: "The signed-in login, its role and the stores it may work on",
      tags: ["admin"],
    }),
};
