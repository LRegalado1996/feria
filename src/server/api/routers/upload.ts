import { createUploadTokenSchema } from "@/lib/schemas/upload";
import { adminProcedure } from "@/server/api/orpc";
import { requireBlobStore } from "@/server/api/utils/blob-store";
import { issueUploadToken } from "@/server/services/upload";

/**
 * Image uploads (FER-011). The browser sends a photo straight to the Blob
 * store, never through a function (whose body is capped at 4.5 MB), with a
 * client token only an admin gets: `adminProcedure` checks the session,
 * then the request's limits, then re-reads the login from the database.
 */
export const uploadRouter = {
  createToken: adminProcedure
    .input(createUploadTokenSchema)
    .handler(
      async ({ input }) => await issueUploadToken(requireBlobStore(), input)
    )
    .route({
      method: "POST",
      path: "/admin/uploads/token",
      summary: "Get a client token to upload one image",
      tags: ["uploads"],
    }),
};
