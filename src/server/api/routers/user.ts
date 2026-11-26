import {
  createAccountSchema,
  loginRefSchema,
  resetLoginPasswordSchema,
} from "@/lib/schemas/access";
import { adminProcedure } from "@/server/api/orpc";
import { writeToStore } from "@/server/api/utils/write-to-store";
import { auth } from "@/server/better-auth";
import { createAccount } from "@/server/better-auth/accounts";
import {
  disableLogin,
  enableLogin,
  listLogins,
  resetLoginPassword,
} from "@/server/services/user";

/**
 * The store's logins (FER-015). Every login is an admin (FER-038), so any
 * admin manages them all. The actor is always the session's login, never
 * an id from the input; the id in the input only names the login acted on,
 * and the service looks it up under a lock before touching it.
 */
export const userRouter = {
  list: adminProcedure
    .handler(async ({ context }) => await listLogins(context.db))
    .route({
      method: "GET",
      path: "/admin/users",
      summary: "List the store's logins",
      tags: ["users"],
    }),

  /**
   * A login with a temporary password the admin typed: it signs in with it
   * and must choose its own before it reaches the admin.
   */
  create: adminProcedure
    .input(createAccountSchema)
    .handler(
      async ({ context, input }) =>
        await writeToStore(
          context,
          async (tx) =>
            await createAccount(auth, tx, input, { mustChangePassword: true })
        )
    )
    .route({
      method: "POST",
      path: "/admin/users",
      summary: "Create a login with a temporary password",
      tags: ["users"],
    }),

  /** Ends the login's sessions; it cannot sign in until it is enabled. */
  disable: adminProcedure
    .input(loginRefSchema)
    .handler(
      async ({ context, input }) =>
        await disableLogin(context.db, {
          actorId: context.session.user.id,
          targetId: input.id,
        })
    )
    .route({
      method: "POST",
      path: "/admin/users/{id}/disable",
      summary: "Disable a login and end its sessions",
      tags: ["users"],
    }),

  enable: adminProcedure
    .input(loginRefSchema)
    .handler(
      async ({ context, input }) =>
        await enableLogin(context.db, {
          actorId: context.session.user.id,
          targetId: input.id,
        })
    )
    .route({
      method: "POST",
      path: "/admin/users/{id}/enable",
      summary: "Enable a disabled login again",
      tags: ["users"],
    }),

  /**
   * Another login's new temporary password, typed by the admin: its
   * sessions end and it must choose its own at its next sign-in.
   */
  resetPassword: adminProcedure
    .input(resetLoginPasswordSchema)
    .handler(
      async ({ context, input }) =>
        await resetLoginPassword(auth, context.db, {
          actorId: context.session.user.id,
          password: input.password,
          targetId: input.id,
        })
    )
    .route({
      method: "PUT",
      path: "/admin/users/{id}/password",
      summary: "Give another login a new temporary password",
      tags: ["users"],
    }),
};
