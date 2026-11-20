import {
  createBannerSchema,
  deleteBannerSchema,
  saveAnnouncementSchema,
  saveHomeLayoutSchema,
  updateBannerSchema,
} from "@/lib/schemas/home";
import { businessDay } from "@/lib/utils/format";
import { adminProcedure } from "@/server/api/orpc";
import { discardBlobs, readBlobStore } from "@/server/api/utils/blob-store";
import { writeToHome } from "@/server/api/utils/write-to-store";
import {
  createBanner,
  deleteBanner,
  getHomeCuration,
  saveAnnouncement,
  saveHomeLayout,
  updateBanner,
} from "@/server/services/home";

/**
 * The home's curation (FER-020), for the admin: the announcement bar, the
 * photo banners and the order of the home's rows. Every query is on the
 * store `adminProcedure` puts in the context, every write re-checks the
 * caller's login inside its transaction and drops the cached home
 * (`writeToHome`), and a banner's dropped photos are deleted once it is
 * saved (FER-011).
 */
export const homeRouter = {
  get: adminProcedure
    .handler(
      async ({ context }) =>
        await getHomeCuration(context.db, {
          storeId: context.store.id,
          today: businessDay(new Date()),
        })
    )
    .route({
      method: "GET",
      path: "/admin/home",
      summary:
        "The home's announcement, banners and order, with the store's categories and articles to pick from",
      tags: ["home"],
    }),

  saveAnnouncement: adminProcedure
    .input(saveAnnouncementSchema)
    .handler(
      async ({ context, input }) =>
        await writeToHome(
          context,
          async (tx, storeId) =>
            await saveAnnouncement(tx, { storeId, values: input })
        )
    )
    .route({
      method: "PUT",
      path: "/admin/home/announcement",
      summary: "Replace the announcement bar's text, link, switch and days",
      tags: ["home"],
    }),

  createBanner: adminProcedure
    .input(createBannerSchema)
    .handler(
      async ({ context, input }) =>
        await writeToHome(
          context,
          async (tx, storeId) =>
            await createBanner(tx, {
              blobStore: readBlobStore(),
              storeId,
              values: input,
            })
        )
    )
    .route({
      method: "POST",
      path: "/admin/home/banners",
      summary: "Add a photo banner to the cover or between two rows",
      tags: ["home"],
    }),

  updateBanner: adminProcedure
    .input(updateBannerSchema)
    .handler(async ({ context, input }) => {
      const { discardedImageUrls, ...updated } = await writeToHome(
        context,
        async (tx, storeId) =>
          await updateBanner(tx, {
            blobStore: readBlobStore(),
            storeId,
            values: input,
          })
      );
      // A replaced or removed photo's file goes once it is saved (FER-011).
      discardBlobs(context.db, discardedImageUrls);

      return updated;
    })
    .route({
      method: "PUT",
      path: "/admin/home/banners/{id}",
      summary:
        "Edit a photo banner: its photos, words, link, switch, days and place",
      tags: ["home"],
    }),

  deleteBanner: adminProcedure
    .input(deleteBannerSchema)
    .handler(async ({ context, input }) => {
      const { discardedImageUrls, ...deleted } = await writeToHome(
        context,
        async (tx, storeId) => await deleteBanner(tx, { id: input.id, storeId })
      );
      // Its photos' files go with it (FER-011).
      discardBlobs(context.db, discardedImageUrls);

      return deleted;
    })
    .route({
      method: "DELETE",
      path: "/admin/home/banners/{id}",
      summary: "Delete a photo banner",
      tags: ["home"],
    }),

  saveLayout: adminProcedure
    .input(saveHomeLayoutSchema)
    .handler(
      async ({ context, input }) =>
        await writeToHome(
          context,
          async (tx, storeId) =>
            await saveHomeLayout(tx, { storeId, values: input })
        )
    )
    .route({
      method: "PUT",
      path: "/admin/home/layout",
      summary:
        "Save the home's order: its rows and banners, the cover, the best sellers and the featured articles",
      tags: ["home"],
    }),
};
