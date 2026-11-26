import { changePasswordSchema } from "@/lib/schemas/access";
import { loginProcedure } from "@/server/api/orpc";
import { auth } from "@/server/better-auth";
import { changeOwnPassword } from "@/server/services/user";

/**
 * The signed-in login itself (FER-013, FER-015), for the admin's pages. Both
 * are `loginProcedure`s: they serve a login still on a temporary password
 * too, which every other procedure of the admin refuses until it changes it.
 */
export const adminRouter = {
  /**
   * Who is signed in: the name and email the shell shows at the foot of its
   * sections (FER-040), and whether the page must send it to change its
   * password first. The login is re-read from the database, so a session
   * that outlived its user, or its disabling, is UNAUTHORIZED here too.
   */
  me: loginProcedure
    .handler(({ context }) => ({
      email: context.session.user.email,
      mustChangePassword: context.login.mustChangePassword,
      name: context.session.user.name,
    }))
    .route({
      method: "GET",
      path: "/admin/me",
      summary: "The signed-in login",
      tags: ["admin"],
    }),

  /**
   * The signed-in login choosing its own password, knowing the current one.
   * Its other sessions end; the one making the change stays.
   */
  changePassword: loginProcedure
    .input(changePasswordSchema)
    .handler(
      async ({ context, input }) =>
        await changeOwnPassword(auth, context.db, {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          sessionId: context.session.session.id,
          userId: context.login.id,
        })
    )
    .route({
      method: "PUT",
      path: "/admin/me/password",
      summary: "Change the signed-in login's password",
      tags: ["admin"],
    }),
};
