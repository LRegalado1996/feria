import { adminProcedure } from "@/server/api/orpc";

/**
 * Who is signed in, for the admin's pages (FER-013): the name and email the
 * shell shows at the foot of its sections (FER-040). Every login is an admin
 * (FER-038); the login is re-read from the database by `adminProcedure`, so a
 * session that outlived its user is UNAUTHORIZED here too.
 */
export const adminRouter = {
  me: adminProcedure
    .handler(({ context }) => ({
      email: context.session.user.email,
      name: context.session.user.name,
    }))
    .route({
      method: "GET",
      path: "/admin/me",
      summary: "The signed-in login",
      tags: ["admin"],
    }),
};
