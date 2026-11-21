import {
  setComingSoonPublishedSchema,
  updateComingSoonSchema,
} from "@/lib/schemas/coming-soon";
import { adminProcedure } from "@/server/api/orpc";
import { writeToStore } from "@/server/api/utils/write-to-store";
import { invalidateComingSoonCache } from "@/server/cache/coming-soon";
import {
  findComingSoon,
  setComingSoonPublished,
  updateComingSoon,
} from "@/server/services/coming-soon";

/**
 * The coming-soon page (FER-034), managed from the admin: its switch and its
 * texts. Admin only, read included: whether the store is about to open is
 * the store's business. The public page reads it through the cache
 * (`readComingSoon`), the proxy through its own read (`isStorefrontClosed`),
 * which takes up to its window to see a flip.
 */
export const comingSoonRouter = {
  get: adminProcedure
    .handler(async ({ context }) => await findComingSoon(context.db))
    .route({
      method: "GET",
      path: "/admin/coming-soon",
      summary: "The coming-soon page: its switch, its day and its texts",
      tags: ["coming-soon"],
    }),

  setPublished: adminProcedure
    .input(setComingSoonPublishedSchema)
    .handler(async ({ context, input }) => {
      const saved = await writeToStore(
        context,
        async (tx, storeId) =>
          await setComingSoonPublished(tx, storeId, input.published)
      );
      // The sitemap lists the store only while it is open.
      invalidateComingSoonCache();

      return saved;
    })
    .route({
      method: "PUT",
      path: "/admin/coming-soon/published",
      summary:
        "Publish the coming-soon page (the store closes to the public) or take it down",
      tags: ["coming-soon"],
    }),

  update: adminProcedure
    .input(updateComingSoonSchema)
    .handler(async ({ context, input }) => {
      const saved = await writeToStore(
        context,
        async (tx, storeId) => await updateComingSoon(tx, storeId, input)
      );
      invalidateComingSoonCache();

      return saved;
    })
    .route({
      method: "PUT",
      path: "/admin/coming-soon",
      summary:
        "Replace the coming-soon page's texts and day (never its switch)",
      tags: ["coming-soon"],
    }),
};
